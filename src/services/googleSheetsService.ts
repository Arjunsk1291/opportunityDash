// Google Sheets Integration Service
export interface SheetRow {
  [key: string]: any;
}

interface GoogleSheetsConfig {
  apiKey: string;
  spreadsheetId: string;
  sheetName: string;
  startRow?: number;
}

const COLUMN_MAPPING: Record<string, string> = {
  'tenderno': 'tenderNo',
  'tendername': 'tenderName',
  'client': 'client',  // Your sheet uses 'client' not 'clientName'
  'clientname': 'client',
  'enduser': 'endUser',
  'tenderlocationexecution': 'location',
  'location': 'location',
  'gdsges': 'groupClassification',
  'groupclassification': 'groupClassification',
  'assignedperson': 'internalLead',
  'internallead': 'internalLead',
  'stageofprojectconceptfeedde': 'projectStage',
  'projectstage': 'projectStage',
  'tendertype': 'tenderType',
  'datetenderrecd': 'dateTenderReceived',
  'datetenderreceived': 'dateTenderReceived',
  'bidnobiddecision': 'bidDecision',
  'biddecision': 'bidDecision',
  'tenderplannedsubmissiondate': 'tenderPlannedSubmissionDate',
  'tendersubmitteddate': 'tenderSubmittedDate',
  'avenirstatus': 'opportunityStatus',
  'opportunitystatus': 'opportunityStatus',
  'remarksreason': 'remarks',
  'remarks': 'remarks',
  'tenderresult': 'tenderResult',
  'tenderstatus': 'tenderStatus',
  'opportunityvalue': 'opportunityValue',
  'value': 'opportunityValue',
  'probability': 'probability',
};

class GoogleSheetsService {
  private config: GoogleSheetsConfig | null = null;

  initialize(apiKey: string, spreadsheetId: string, sheetName: string = 'Sheet1', startRow: number = 1) {
    this.config = { apiKey, spreadsheetId, sheetName, startRow };
  }

  isConfigured(): boolean {
    return this.config !== null;
  }

  getConfig(): GoogleSheetsConfig | null {
    return this.config;
  }

  async fetchData(): Promise<SheetRow[]> {
    if (!this.config) {
      throw new Error('Google Sheets service not configured');
    }

    const { apiKey, spreadsheetId, sheetName } = this.config;
    const range = `${sheetName}!A:ZZ`;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?key=${apiKey}`;

    try {
      const response = await fetch(url);
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to fetch data from Google Sheets');
      }

      const data = await response.json();
      const rows = data.values as string[][];

      if (!rows || rows.length === 0) {
        throw new Error('Sheet is empty or has no data');
      }

      let headerRowIndex = 0;
      let headers: string[] = [];
      
      for (let i = 0; i < Math.min(10, rows.length); i++) {
        const row = rows[i];
        if (row && row.length > 0 && row.some(cell => cell && cell.trim() !== '')) {
          headers = row.map(h => (h || '').trim());
          headerRowIndex = i;
          break;
        }
      }

      if (headers.length === 0) {
        throw new Error('No valid headers found');
      }

      const dataRows = rows.slice(headerRowIndex + 1);
      
      const mappedData = dataRows
        .filter(row => row && row.length > 0 && row.some(cell => cell && cell.trim() !== ''))
        .map((row, index) => {
          const obj: SheetRow = { 
            id: `OPP-${String(index + 1).padStart(4, '0')}` 
          };
          
          headers.forEach((header, colIndex) => {
            if (!header) return;
            
            let mappedKey = COLUMN_MAPPING[header];
            if (!mappedKey) {
              const cleanHeader = header.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '');
              mappedKey = COLUMN_MAPPING[cleanHeader] || cleanHeader;
            }
            
            const value = row[colIndex];
            obj[mappedKey] = value ? value.trim() : '';
          });

          return obj;
        });

      return mappedData;
    } catch (error) {
      console.error('❌ Error fetching:', error);
      throw error;
    }
  }

  convertToOpportunities(sheetData: SheetRow[]): any[] {
    const DUMMY_VALUES = [
      50000, 75000, 100000, 150000, 200000, 250000, 300000, 400000, 500000, 750000,
      1000000, 1500000, 2000000, 2500000, 3000000
    ];
    
    return sheetData.map((row, index) => {
      const parseNumber = (value: any): number => {
        if (!value) return 0;
        const str = value.toString().replace(/[^0-9.-]/g, '');
        const num = parseFloat(str);
        return isNaN(num) ? 0 : num;
      };

      let opportunityValue = parseNumber(row.opportunityValue || row.value);
      const valueImputed = opportunityValue === 0;
      if (valueImputed) {
        const baseValue = DUMMY_VALUES[index % DUMMY_VALUES.length];
        const multiplier = row.groupClassification === 'GES' ? 1.2 : 1.0;
        opportunityValue = Math.round(baseValue * multiplier);
      }

      const statusMapping: Record<string, string> = {
        'PRE-BID': 'Pre-bid',
        'PREBID': 'Pre-bid',
        'BID': 'Pre-bid',
        'NO-BID': 'Lost/Regretted',
        'HOLD / CLOSED': 'On Hold/Paused',
        'HOLD': 'On Hold/Paused',
        'CLOSED': 'Closed',
        'IN PROGRESS': 'In Progress',
        'WORKING': 'In Progress',
        'ONGOING': 'In Progress',
        'SUBMITTED': 'Submitted',
        'TENDER SUBMITTED': 'Submitted',
        'AWARDED': 'Awarded',
        'WON': 'Awarded',
        'LOST': 'Lost/Regretted',
        'REGRETTED': 'Lost/Regretted',
      };

      const rawStatus = (row.opportunityStatus || row.avenirstatus || row.tenderStatus || '').toString().toUpperCase().trim();
      const canonicalStage = statusMapping[rawStatus] || 'Pre-bid';
      
      const probability = canonicalStage === 'Awarded' ? 100 : 
                         canonicalStage === 'Submitted' ? 60 : 
                         canonicalStage === 'In Progress' ? 40 :
                         canonicalStage === 'Lost/Regretted' ? 0 :
                         canonicalStage === 'On Hold/Paused' ? 20 : 10;
      
      const expectedValue = opportunityValue * (probability / 100);

      const parseDate = (dateStr: any): string | null => {
        if (!dateStr) return null;
        const str = dateStr.toString().trim();
        if (!str || str === '' || str === 'undefined') return null;
        
        const monthMap: Record<string, string> = {
          'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04',
          'May': '05', 'Jun': '06', 'Jul': '07', 'Aug': '08',
          'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
        };
        
        const match = str.match(/^(\d{1,2})-(\w{3})$/);
        if (match) {
          const day = match[1].padStart(2, '0');
          const month = monthMap[match[2]] || '01';
          return `2024-${month}-${day}`;
        }
        
        try {
          const date = new Date(str);
          if (!isNaN(date.getTime())) {
            return date.toISOString().split('T')[0];
          }
        } catch (e) {}
        
        return null;
      };

      const dateRecd = parseDate(row.dateTenderReceived);
      const plannedDate = parseDate(row.tenderPlannedSubmissionDate);
      const submittedDate = parseDate(row.tenderSubmittedDate);
      const today = new Date().toISOString().split('T')[0];
      
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
        opportunityRefNo: row.tenderNo || `REF-${index + 1}`,
        tenderNo: row.tenderNo || `TND-${index + 1}`,
        tenderName: row.tenderName || 'Unnamed Tender',
        clientName: row.client || 'Unknown Client',  // FIXED: Use 'client' field
        clientType: 'Potential Client',
        clientLead: row.endUser || '',
        opportunityClassification: row.tenderType || 'Tender',
        opportunityStatus: rawStatus,
        canonicalStage,
        qualificationStatus: row.bidDecision || 'Under Review',
        groupClassification: row.groupClassification || 'GES',
        domainSubGroup: row.projectStage || 'Detailed Engineering',
        internalLead: row.internalLead || '',
        opportunityValue,
        opportunityValue_imputed: valueImputed,
        opportunityValue_imputation_reason: valueImputed ? `Dummy value assigned: $${opportunityValue.toLocaleString()}` : '',
        probability,
        probability_imputed: true,
        probability_imputation_reason: `Inferred from stage: ${canonicalStage}`,
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
        partnerInvolvement: false,
        partnerName: '',
        country: row.location || 'UAE',
        remarks: row.remarks || '',
        awardStatus: row.tenderResult || (canonicalStage === 'Awarded' ? 'AWARDED' : canonicalStage === 'Lost/Regretted' ? 'LOST' : ''),
      };
    });
  }

  clearConfig() {
    this.config = null;
  }
}

export const googleSheetsService = new GoogleSheetsService();
