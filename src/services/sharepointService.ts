// src/services/sharepointService.ts
import { getFirstWorksheet, loadWorkbookFromArrayBuffer, worksheetToObjects } from '@/lib/excelWorkbook';

export interface ExcelRow {
  srNo: number;
  year: number;
  tenderNo: string;
  tenderName: string;
  client: string;
  endUser: string;
  location: string;
  gdsGes: string;
  assignedPerson: string;
  projectStage: string;
  tenderType: string;
  dateReceived: string;
  bidDecision: string;
  plannedSubmissionDate: string;
  submittedDate?: string;
  avenirStatus: string;
  remarks: string;
  tenderResult?: string;
  tenderStatus?: string;
  currency?: string;
  gmPercent?: number;
  tenderValue?: number;
  subContractValue?: number;
  gmValue?: number;
  goPercent?: string;
  getPercent?: string;
  goGetPercent?: string;
  goGetValue?: string;
  usdToAed?: number;
  awardedTo?: string;
  finalPrice?: number;
}

export interface SyncStatus {
  lastSync: Date | null;
  isLoading: boolean;
  error: string | null;
  recordCount: number;
}
const MAX_SHAREPOINT_EXCEL_BYTES = 8 * 1024 * 1024;
const MAX_SHAREPOINT_EXCEL_ROWS = 10000;

class SharePointService {
  private sharePointUrl: string;
  private syncStatus: SyncStatus = {
    lastSync: null,
    isLoading: false,
    error: null,
    recordCount: 0,
  };

  constructor() {
    // Your SharePoint file URL (we'll configure this)
    this.sharePointUrl = import.meta.env.VITE_SHAREPOINT_URL || '';
  }

  /**
   * Fetch data from SharePoint Excel file
   * This uses the public link method - no authentication needed
   */
  async fetchExcelData(): Promise<ExcelRow[]> {
    this.syncStatus.isLoading = true;
    this.syncStatus.error = null;

    try {
      // Convert SharePoint sharing link to download link
      const downloadUrl = this.convertToDownloadUrl(this.sharePointUrl);
      
      // Fetch the Excel file
      const response = await fetch(downloadUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch Excel file: ${response.statusText}`);
      }

      const blob = await response.blob();
      const data = await this.parseExcelBlob(blob);
      
      this.syncStatus.lastSync = new Date();
      this.syncStatus.recordCount = data.length;
      this.syncStatus.isLoading = false;

      return data;
    } catch (error) {
      this.syncStatus.error = error instanceof Error ? error.message : 'Unknown error';
      this.syncStatus.isLoading = false;
      throw error;
    }
  }

  /**
   * Convert SharePoint sharing URL to direct download URL
   */
  private convertToDownloadUrl(sharePointUrl: string): string {
    // SharePoint URL format: https://domain.sharepoint.com/:x:/g/personal/...
    // We need to extract the file reference and convert to download format
    
    // For now, return as-is. In production, you'd need to:
    // 1. Use Microsoft Graph API for authenticated access, OR
    // 2. Use a proxy server to handle the conversion
    
    return sharePointUrl.replace('/:x:/', '/:x:/r/');
  }

  /**
   * Parse Excel blob to JSON data
   */
  private async parseExcelBlob(blob: Blob): Promise<ExcelRow[]> {
    if (blob.size > MAX_SHAREPOINT_EXCEL_BYTES) {
      throw new Error('SharePoint workbook exceeds the 8MB safety limit.');
    }
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = async (e) => {
        try {
          const data = e.target?.result;
          if (!data) throw new Error('No data received');

          const buffer = data instanceof ArrayBuffer ? data : null;
          if (!buffer) throw new Error('Invalid workbook binary data');
          const workbook = await loadWorkbookFromArrayBuffer(buffer);
          const worksheet = getFirstWorksheet(workbook);
          if (!worksheet) throw new Error('Workbook is empty');
          
          // Convert to JSON
          const jsonData = worksheetToObjects(worksheet, { headerRow: 1, maxRows: MAX_SHAREPOINT_EXCEL_ROWS });
          if (jsonData.length > MAX_SHAREPOINT_EXCEL_ROWS) {
            throw new Error(`SharePoint workbook has too many rows (${jsonData.length}). Limit is ${MAX_SHAREPOINT_EXCEL_ROWS}.`);
          }

          // Map Excel columns to our interface
          const mappedData = jsonData.map(this.mapExcelRowToInterface);
          
          resolve(mappedData);
        } catch (error) {
          reject(error);
        }
      };

      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsArrayBuffer(blob);
    });
  }

  /**
   * Map Excel row to our TypeScript interface
   */
  private mapExcelRowToInterface(row: Record<string, unknown>): ExcelRow {
    return {
      srNo: parseInt(String(row['Sr.no'] ?? ''), 10) || 0,
      year: parseInt(String(row['Year'] ?? ''), 10) || new Date().getFullYear(),
      tenderNo: row['Tender no'] || '',
      tenderName: row['Tender name'] || '',
      client: row['Client'] || '',
      endUser: row['END USER'] || '',
      location: row['Tender Location\n(Execution)'] || '',
      gdsGes: row['GDS/GES'] || '',
      assignedPerson: row['Assigned Person'] || '',
      projectStage: row['Stage of project, Concept, FEED, DE'] || '',
      tenderType: row['Tender Type'] || '',
      dateReceived: row['date tender recd'] || '',
      bidDecision: row['BID / NO BID DECISION'] || '',
      plannedSubmissionDate: row['Tender Planned Submission date'] || '',
      submittedDate: row['Tender  Submitted  date'] || null,
      avenirStatus: row['AVENIR STATUS'] || '',
      remarks: row['REMARKS/REASON'] || '',
      tenderResult: row['TENDER RESULT'] || null,
      tenderStatus: row['TENDER STATUS -'] || null,
      currency: row['Currency, USD/AED'] || null,
      gmPercent: parseFloat(String(row['GM%'] ?? '')) || null,
      tenderValue: parseFloat(String(row[' Tender value '] ?? '')) || null,
      subContractValue: parseFloat(String(row['Sub-contract value'] ?? '')) || null,
      gmValue: parseFloat(String(row['GM Value'] ?? '')) || null,
      goPercent: row['Go%'] || null,
      getPercent: row['Get %'] || null,
      goGetPercent: row['GO/Get %'] || null,
      goGetValue: row['go/get value'] || null,
      usdToAed: parseFloat(row['USD to AED']) || null,
      awardedTo: row['who was awarded the project'] || null,
      finalPrice: parseFloat(row['final awarded price']) || null,
    };
  }

  /**
   * Get current sync status
   */
  getSyncStatus(): SyncStatus {
    return { ...this.syncStatus };
  }

  /**
   * Set SharePoint URL dynamically
   */
  setSharePointUrl(url: string): void {
    this.sharePointUrl = url;
  }
}

// Export singleton instance
export const sharepointService = new SharePointService();
export default sharepointService;
