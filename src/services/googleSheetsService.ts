// Google Sheets Integration Service
export interface SheetRow {
  [key: string]: any;
}

interface GoogleSheetsConfig {
  apiKey: string;
  spreadsheetId: string;
  sheetName: string;
  startRow?: number; // NEW: Allow specifying start row
}

const COLUMN_MAPPING: Record<string, string> = {
  'Opportunity Ref No': 'opportunityRefNo',
  'OpportunityRefNo': 'opportunityRefNo',
  'Ref No': 'opportunityRefNo',
  'RefNo': 'opportunityRefNo',
  'Reference Number': 'opportunityRefNo',
  'Opportunity Reference Number': 'opportunityRefNo',
  
  'Tender No': 'tenderNo',
  'TenderNo': 'tenderNo',
  'Tender Number': 'tenderNo',
  'Tender Name': 'tenderName',
  'TenderName': 'tenderName',
  'Name': 'tenderName',
  'Project Name': 'tenderName',
  
  'Client Name': 'clientName',
  'ClientName': 'clientName',
  'Client': 'clientName',
  'Customer': 'clientName',
  'Client Type': 'clientType',
  'ClientType': 'clientType',
  
  'Opportunity Status': 'opportunityStatus',
  'OpportunityStatus': 'opportunityStatus',
  'Status': 'opportunityStatus',
  'Current Status': 'opportunityStatus',
  
  'Group Classification': 'groupClassification',
  'GroupClassification': 'groupClassification',
  'Group': 'groupClassification',
  'Classification': 'groupClassification',
  
  'Internal Lead': 'internalLead',
  'InternalLead': 'internalLead',
  'Lead': 'internalLead',
  'Owner': 'internalLead',
  'Assigned To': 'internalLead',
  
  'Opportunity Value': 'opportunityValue',
  'OpportunityValue': 'opportunityValue',
  'Value': 'opportunityValue',
  'Amount': 'opportunityValue',
  'Contract Value': 'opportunityValue',
  
  'Probability': 'probability',
  'Win Probability': 'probability',
  'Probability %': 'probability',
  'Win %': 'probability',
  
  'Date Tender Received': 'dateTenderReceived',
  'DateTenderReceived': 'dateTenderReceived',
  'Received Date': 'dateTenderReceived',
  'Date Received': 'dateTenderReceived',
  'Tender Received': 'dateTenderReceived',
  
  'Planned Submission Date': 'tenderPlannedSubmissionDate',
  'PlannedSubmissionDate': 'tenderPlannedSubmissionDate',
  'Submission Date': 'tenderPlannedSubmissionDate',
  'Due Date': 'tenderPlannedSubmissionDate',
  'Deadline': 'tenderPlannedSubmissionDate',
  
  'Tender Submitted Date': 'tenderSubmittedDate',
  'TenderSubmittedDate': 'tenderSubmittedDate',
  'Submitted Date': 'tenderSubmittedDate',
  'Date Submitted': 'tenderSubmittedDate',
  
  'Partner Name': 'partnerName',
  'PartnerName': 'partnerName',
  'Partner': 'partnerName',
  
  'Qualification Status': 'qualificationStatus',
  'QualificationStatus': 'qualificationStatus',
  'Qualification': 'qualificationStatus',
  
  'Opportunity Classification': 'opportunityClassification',
  'OpportunityClassification': 'opportunityClassification',
  'Type': 'opportunityClassification',
  
  'Remarks': 'remarks',
  'Notes': 'remarks',
  'Comments': 'remarks',
  'Description': 'remarks',
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
    
    // Fetch with explicit range to get all data
    const range = `${sheetName}!A:ZZ`; // Get columns A to ZZ
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?key=${apiKey}`;

    try {
      console.log('🔍 Fetching from URL:', url);
      const response = await fetch(url);
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to fetch data from Google Sheets');
      }

      const data = await response.json();
      const rows = data.values as string[][];

      if (!rows || rows.length === 0) {
        console.warn('❌ No data found in sheet');
        throw new Error('Sheet is empty or has no data');
      }

      console.log('📊 Total rows in sheet:', rows.length);
      console.log('📋 First row (headers):', rows[0]);
      console.log('📋 Second row (first data):', rows[1]);

      // Find the header row (first non-empty row)
      let headerRowIndex = 0;
      let headers: string[] = [];
      
      for (let i = 0; i < Math.min(10, rows.length); i++) {
        const row = rows[i];
        if (row && row.length > 0 && row.some(cell => cell && cell.trim() !== '')) {
          headers = row.map(h => (h || '').trim());
          headerRowIndex = i;
          console.log(`✅ Found headers at row ${i + 1}:`, headers);
          break;
        }
      }

      if (headers.length === 0 || headers.every(h => !h)) {
        throw new Error('No valid headers found in the first 10 rows. Please ensure your sheet has column headers.');
      }

      // Get data rows (everything after header row)
      const dataRows = rows.slice(headerRowIndex + 1);
      
      // Convert rows to objects
      const mappedData = dataRows
        .filter(row => row && row.length > 0 && row.some(cell => cell && cell.trim() !== ''))
        .map((row, index) => {
          const obj: SheetRow = { 
            id: `OPP-${String(index + 1).padStart(4, '0')}` 
          };
          
          headers.forEach((header, colIndex) => {
            if (!header) return;
            
            const mappedKey = COLUMN_MAPPING[header] || 
                             header.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '');
            const value = row[colIndex];
            obj[mappedKey] = value ? value.trim() : '';
          });

          return obj;
        });

      console.log('✅ Mapped data sample:', mappedData[0]);
      console.log(`📊 Total data rows: ${mappedData.length}`);

      return mappedData;
    } catch (error) {
      console.error('❌ Error fetching Google Sheets data:', error);
      throw error;
    }
  }

  convertToOpportunities(sheetData: SheetRow[]): any[] {
    console.log('🔄 Converting sheet data to opportunities...');
    
    return sheetData.map((row, index) => {
      const parseNumber = (value: any): number => {
        if (!value) return 0;
        const str = value.toString().replace(/[^0-9.-]/g, '');
        const num = parseFloat(str);
        return isNaN(num) ? 0 : num;
      };

      const opportunityValue = parseNumber(
        row.opportunityValue || row.opportunityvalue || row.value || row.amount || row.contractvalue
      );
      const probability = parseNumber(
        row.probability || row.winprobability || row['probability%'] || row['win%']
      );

      const statusMapping: Record<string, string> = {
        'PRE-BID': 'Pre-bid',
        'PREBID': 'Pre-bid',
        'PRE BID': 'Pre-bid',
        'RFT YET TO RECEIVE': 'Pre-bid',
        'OPEN': 'Pre-bid',
        'BD': 'Pre-bid',
        'EOI': 'Pre-bid',
        'IN PROGRESS': 'In Progress',
        'IN-PROGRESS': 'In Progress',
        'INPROGRESS': 'In Progress',
        'WORKING': 'In Progress',
        'ONGOING': 'In Progress',
        'SUBMITTED': 'Submitted',
        'TENDER SUBMITTED': 'Submitted',
        'AWARDED': 'Awarded',
        'WON': 'Awarded',
        'LOST': 'Lost/Regretted',
        'REGRETTED': 'Lost/Regretted',
        'HOLD': 'On Hold/Paused',
        'ON HOLD': 'On Hold/Paused',
        'CLOSED': 'Closed',
      };

      const rawStatus = (
        row.opportunityStatus || 
        row.opportunitystatus || 
        row.status || 
        row.currentstatus || 
        ''
      ).toString().toUpperCase().trim();
      
      const canonicalStage = statusMapping[rawStatus] || 'Pre-bid';
      
      const finalProbability = probability || (
        canonicalStage === 'Awarded' ? 100 : 
        canonicalStage === 'Submitted' ? 60 : 
        canonicalStage === 'In Progress' ? 40 : 10
      );
      
      const expectedValue = opportunityValue * (finalProbability / 100);

      const parseDate = (dateStr: any): string | null => {
        if (!dateStr) return null;
        const str = dateStr.toString().trim();
        if (!str || str === '' || str === 'undefined' || str === 'null') return null;
        
        try {
          const date = new Date(str);
          if (!isNaN(date.getTime())) {
            return date.toISOString().split('T')[0];
          }
        } catch (e) {
          // Invalid date
        }
        
        return null;
      };

      const dateRecd = parseDate(
        row.dateTenderReceived || row.datetenderreceived || row.receiveddate || row.datereceived || row.tenderreceived
      );
      const plannedDate = parseDate(
        row.tenderPlannedSubmissionDate || row.tenderplannedsubmissiondate || 
        row.plannedsubmissiondate || row.submissiondate || row.duedate || row.deadline
      );
      const submittedDate = parseDate(
        row.tenderSubmittedDate || row.tendersubmitteddate || 
        row.submitteddate || row.datesubmitted
      );

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
      const isAtRisk = (agedDays >= 30) || (finalProbability < 50 && canonicalStage === 'In Progress');

      // Get values with fallbacks
      const refNo = row.opportunityRefNo || row.opportunityrefno || row.refno || row.referencenumber || `REF-${index + 1}`;
      const tenderNo = row.tenderNo || row.tenderno || row.tendernumber || refNo;
      const tenderName = row.tenderName || row.tendername || row.name || row.projectname || 'Unnamed Opportunity';
      const clientName = row.clientName || row.clientname || row.client || row.customer || 'Unknown Client';
      const internalLead = row.internalLead || row.internallead || row.lead || row.owner || row.assignedto || '';

      return {
        id: row.id || `OPP-${String(index + 1).padStart(4, '0')}`,
        opportunityRefNo: refNo,
        tenderNo: tenderNo,
        tenderName: tenderName,
        clientName: clientName,
        clientType: row.clientType || row.clienttype || 'Potential Client',
        clientLead: row.clientLead || row.clientlead || '',
        opportunityClassification: row.opportunityClassification || row.opportunityclassification || row.type || 'Tender',
        opportunityStatus: rawStatus,
        canonicalStage,
        qualificationStatus: row.qualificationStatus || row.qualificationstatus || row.qualification || 'Under Review',
        groupClassification: row.groupClassification || row.groupclassification || row.group || row.classification || 'GES',
        domainSubGroup: 'Detailed Engineering',
        internalLead: internalLead,
        opportunityValue,
        opportunityValue_imputed: !opportunityValue,
        opportunityValue_imputation_reason: !opportunityValue ? 'Not provided in sheet' : '',
        probability: finalProbability,
        probability_imputed: !probability,
        probability_imputation_reason: !probability ? `Inferred from stage: ${canonicalStage}` : '',
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
        partnerInvolvement: !!(row.partnerName || row.partnername || row.partner),
        partnerName: row.partnerName || row.partnername || row.partner || '',
        country: 'UAE',
        remarks: row.remarks || row.notes || row.comments || row.description || '',
        awardStatus: canonicalStage === 'Awarded' ? 'AWARDED' : canonicalStage === 'Lost/Regretted' ? 'LOST' : '',
      };
    });
  }

  clearConfig() {
    this.config = null;
  }
}

export const googleSheetsService = new GoogleSheetsService();
