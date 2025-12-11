// src/services/sharepointService.ts

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
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = async (e) => {
        try {
          const data = e.target?.result;
          if (!data) throw new Error('No data received');

          // Dynamic import of xlsx to reduce bundle size
          const XLSX = await import('xlsx');
          const workbook = XLSX.read(data, { type: 'binary' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          
          // Convert to JSON
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
            raw: false,
            defval: null 
          });

          // Map Excel columns to our interface
          const mappedData = jsonData.map(this.mapExcelRowToInterface);
          
          resolve(mappedData);
        } catch (error) {
          reject(error);
        }
      };

      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsBinaryString(blob);
    });
  }

  /**
   * Map Excel row to our TypeScript interface
   */
  private mapExcelRowToInterface(row: any): ExcelRow {
    return {
      srNo: parseInt(row['Sr.no']) || 0,
      year: parseInt(row['Year']) || new Date().getFullYear(),
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
      gmPercent: parseFloat(row['GM%']) || null,
      tenderValue: parseFloat(row[' Tender value ']) || null,
      subContractValue: parseFloat(row['Sub-contract value']) || null,
      gmValue: parseFloat(row['GM Value']) || null,
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