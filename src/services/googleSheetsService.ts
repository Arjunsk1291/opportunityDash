// Google Sheets Integration Service
// Uses Google Sheets API v4 with API Key (no OAuth needed for public sheets)

export interface SheetRow {
  [key: string]: any;
}

interface GoogleSheetsConfig {
  apiKey: string;
  spreadsheetId: string;
  sheetName: string;
}

// Column mapping from your Google Sheet to Opportunity interface
const COLUMN_MAPPING: Record<string, string> = {
  'Opportunity Ref No': 'opportunityRefNo',
  'Tender No': 'tenderNo',
  'Tender Name': 'tenderName',
  'Client Name': 'clientName',
  'Client Type': 'clientType',
  'Opportunity Status': 'opportunityStatus',
  'Group Classification': 'groupClassification',
  'Internal Lead': 'internalLead',
  'Opportunity Value': 'opportunityValue',
  'Probability': 'probability',
  'Date Tender Received': 'dateTenderReceived',
  'Planned Submission Date': 'tenderPlannedSubmissionDate',
  'Tender Submitted Date': 'tenderSubmittedDate',
  'Partner Name': 'partnerName',
  'Qualification Status': 'qualificationStatus',
  'Opportunity Classification': 'opportunityClassification',
  'Remarks': 'remarks',
};

class GoogleSheetsService {
  private config: GoogleSheetsConfig | null = null;

  // Initialize with API key and spreadsheet ID
  initialize(apiKey: string, spreadsheetId: string, sheetName: string = 'Sheet1') {
    this.config = { apiKey, spreadsheetId, sheetName };
  }

  // Check if service is configured
  isConfigured(): boolean {
    return this.config !== null;
  }

  // Get configuration
  getConfig(): GoogleSheetsConfig | null {
    return this.config;
  }

  // Fetch data from Google Sheets
  async fetchData(): Promise<SheetRow[]> {
    if (!this.config) {
      throw new Error('Google Sheets service not configured');
    }

    const { apiKey, spreadsheetId, sheetName } = this.config;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${sheetName}?key=${apiKey}`;

    try {
      const response = await fetch(url);
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to fetch data from Google Sheets');
      }

      const data = await response.json();
      const rows = data.values as string[][];

      if (!rows || rows.length === 0) {
        return [];
      }

      // First row is headers
      const headers = rows[0];
      
      // Convert rows to objects
      const mappedData = rows.slice(1).map((row, index) => {
        const obj: SheetRow = { 
          id: `OPP-${String(index + 1).padStart(4, '0')}` 
        };
        
        headers.forEach((header, colIndex) => {
          const mappedKey = COLUMN_MAPPING[header] || header.toLowerCase().replace(/\s+/g, '');
          obj[mappedKey] = row[colIndex] || '';
        });

        return obj;
      });

      return mappedData;
    } catch (error) {
      console.error('Error fetching Google Sheets data:', error);
      throw error;
    }
  }

  // Convert sheet data to Opportunity format
  convertToOpportunities(sheetData: SheetRow[]): any[] {
    return sheetData.map((row, index) => {
      // Parse numeric values
      const opportunityValue = parseFloat(row.opportunityValue?.toString().replace(/[^0-9.-]/g, '') || '0');
      const probability = parseFloat(row.probability?.toString().replace(/[^0-9.-]/g, '') || '0');

      // Map status to canonical stage
      const statusMapping: Record<string, string> = {
        'PRE-BID': 'Pre-bid',
        'RFT YET TO RECEIVE': 'Pre-bid',
        'OPEN': 'Pre-bid',
        'IN PROGRESS': 'In Progress',
        'WORKING': 'In Progress',
        'SUBMITTED': 'Submitted',
        'TENDER SUBMITTED': 'Submitted',
        'AWARDED': 'Awarded',
        'LOST': 'Lost/Regretted',
        'REGRETTED': 'Lost/Regretted',
        'HOLD': 'On Hold/Paused',
      };

      const canonicalStage = statusMapping[row.opportunityStatus?.toUpperCase()] || 'Pre-bid';
      const expectedValue = opportunityValue * (probability / 100);

      // Calculate date-based fields
      const today = new Date().toISOString().split('T')[0];
      const dateRecd = row.dateTenderReceived || null;
      const plannedDate = row.tenderPlannedSubmissionDate || null;
      const submittedDate = row.tenderSubmittedDate || null;

      const daysBetween = (date1: string | null, date2: string | null): number => {
        if (!date1 || !date2) return 0;
        const d1 = new Date(date1);
        const d2 = new Date(date2);
        const diffTime = d2.getTime() - d1.getTime();
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      };

      const daysSinceTenderReceived = dateRecd ? daysBetween(dateRecd, today) : 0;
      const daysToPlannedSubmission = plannedDate ? daysBetween(today, plannedDate) : 0;
      const lastContactDate = submittedDate || dateRecd || today;
      const agedDays = daysBetween(lastContactDate, today);

      const willMissDeadline = plannedDate && !submittedDate && daysToPlannedSubmission <= 7;
      const isAtRisk = (agedDays >= 30) || (probability < 50 && canonicalStage === 'In Progress');

      return {
        id: row.id || `OPP-${String(index + 1).padStart(4, '0')}`,
        opportunityRefNo: row.opportunityRefNo || row.tenderNo || '',
        tenderNo: row.tenderNo || row.opportunityRefNo || '',
        tenderName: row.tenderName || '',
        clientName: row.clientName || '',
        clientType: row.clientType || 'Potential Client',
        clientLead: row.clientLead || '',
        opportunityClassification: row.opportunityClassification || 'Tender',
        opportunityStatus: row.opportunityStatus || '',
        canonicalStage,
        qualificationStatus: row.qualificationStatus || 'Under Review',
        groupClassification: row.groupClassification || 'GES',
        domainSubGroup: 'Detailed Engineering',
        internalLead: row.internalLead || '',
        opportunityValue,
        opportunityValue_imputed: !row.opportunityValue,
        opportunityValue_imputation_reason: !row.opportunityValue ? 'Not provided in sheet' : '',
        probability,
        probability_imputed: !row.probability,
        probability_imputation_reason: !row.probability ? 'Not provided in sheet' : '',
        expectedValue,
        dateTenderReceived: dateRecd,
        tenderPlannedSubmissionDate: plannedDate,
        tenderPlannedSubmissionDate_imputed: !plannedDate,
        tenderPlannedSubmissionDate_imputation_reason: !plannedDate ? 'Not provided in sheet' : '',
        tenderSubmittedDate: submittedDate,
        lastContactDate,
        lastContactDate_imputed: false,
        lastContactDate_imputation_reason: '',
        daysSinceTenderReceived,
        daysToPlannedSubmission,
        agedDays,
        willMissDeadline: willMissDeadline || false,
        isAtRisk,
        partnerInvolvement: !!row.partnerName,
        partnerName: row.partnerName || '',
        country: 'UAE',
        remarks: row.remarks || '',
        awardStatus: canonicalStage === 'Awarded' ? 'AWARDED' : canonicalStage === 'Lost/Regretted' ? 'LOST' : '',
      };
    });
  }

  // Clear configuration
  clearConfig() {
    this.config = null;
  }
}

// Export singleton instance
export const googleSheetsService = new GoogleSheetsService();
