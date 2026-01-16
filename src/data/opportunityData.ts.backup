// Opportunity Management Data with Imputation Logic
// This file contains the merged and cleaned dataset from the Excel workbook

export interface Opportunity {
  id: string;
  opportunityRefNo: string;
  tenderNo: string;
  tenderName: string;
  clientName: string;
  clientType: string;
  clientLead: string;
  opportunityClassification: string;
  opportunityStatus: string;
  canonicalStage: string;
  qualificationStatus: string;
  groupClassification: string;
  domainSubGroup: string;
  internalLead: string;
  opportunityValue: number;
  opportunityValue_imputed: boolean;
  opportunityValue_imputation_reason: string;
  probability: number;
  probability_imputed: boolean;
  probability_imputation_reason: string;
  expectedValue: number;
  dateTenderReceived: string | null;
  tenderPlannedSubmissionDate: string | null;
  tenderPlannedSubmissionDate_imputed: boolean;
  tenderPlannedSubmissionDate_imputation_reason: string;
  tenderSubmittedDate: string | null;
  lastContactDate: string | null;
  lastContactDate_imputed: boolean;
  lastContactDate_imputation_reason: string;
  daysSinceTenderReceived: number;
  daysToPlannedSubmission: number;
  agedDays: number;
  willMissDeadline: boolean;
  isAtRisk: boolean;
  partnerInvolvement: boolean;
  partnerName: string;
  country: string;
  remarks: string;
  awardStatus: string;
}

export interface ImputationLog {
  rowId: string;
  column: string;
  originalValue: string | null;
  imputedValue: string;
  method: string;
  confidenceScore: 'high' | 'medium' | 'low';
  timestamp: string;
}

export interface DataCleaningLog {
  field: string;
  originalValue: string;
  cleanedValue: string;
  reason: string;
}

// Canonical Status Mapping
export const STATUS_MAPPING: Record<string, string> = {
  'PRE-BID': 'Pre-bid',
  'RFT YET TO RECEIVE': 'Pre-bid',
  'OPEN': 'Pre-bid',
  'BD': 'Pre-bid',
  'EOI': 'Pre-bid',
  'IN PROGRESS': 'In Progress',
  'WORKING': 'In Progress',
  'ONGOING': 'In Progress',
  'SUBMITTED': 'Submitted',
  'TENDER SUBMITTED': 'Submitted',
  'AWARDED': 'Awarded',
  'LOST': 'Lost/Regretted',
  'REGRETTED': 'Lost/Regretted',
  'HOLD / CLOSED': 'On Hold/Paused',
  'HOLD': 'On Hold/Paused',
  'CLOSED': 'Closed',
};

// Stage Order for Funnel
export const STAGE_ORDER = ['Pre-bid', 'In Progress', 'Submitted', 'Awarded'];

// Probability by Stage Mapping
export const PROBABILITY_BY_STAGE: Record<string, number> = {
  'Pre-bid': 10,
  'In Progress': 40,
  'Submitted': 60,
  'Awarded': 100,
  'Lost/Regretted': 0,
  'On Hold/Paused': 20,
  'Closed': 0,
};

// Internal Lead Canonical Mapping
export const LEAD_MAPPING: Record<string, string> = {
  'vishnu': 'Vishnu',
  'Vishnu': 'Vishnu',
  'VISHNU': 'Vishnu',
  'Vishnu/Aseeb': 'Vishnu',
  'Vishnu/Gayathri': 'Vishnu',
  'Vishnu/Ashwin': 'Vishnu',
  'vishnu/ Gyathri': 'Vishnu',
  'aseeb': 'Aseeb',
  'Aseeb': 'Aseeb',
  'ASEEB': 'Aseeb',
  'Aseeb/Vishnu': 'Aseeb',
  'Aseeb/Gayathri': 'Aseeb',
  'aseeb/Vishnu': 'Aseeb',
  'ashwin': 'Ashwin',
  'Ashwin': 'Ashwin',
  'ASHWIN': 'Ashwin',
  'Ashwin/Aseeb': 'Ashwin',
  'Ashwin/Vishnu': 'Ashwin',
  'Ashwin/Gayathri': 'Ashwin',
  'Ashwin/ Vishnu': 'Ashwin',
  'gayathri': 'Gayathri',
  'Gayathri': 'Gayathri',
  'GAYATHRI': 'Gayathri',
  'Gayathri/Vishnu': 'Gayathri',
  'Gayathri/Aseeb': 'Gayathri',
  'shalini': 'Shalini',
  'Shalini': 'Shalini',
  'SHALINI': 'Shalini',
  'khalid': 'Khalid',
  'Khalid': 'Khalid',
  'visal': 'Visal',
  'Visal': 'Visal',
  'fakhri': 'Fakhri',
  'Fakhri': 'Fakhri',
};

// Group Classification Canonical Values
export const GROUP_CLASSIFICATIONS = ['GES', 'GDS', 'GTN', 'GTS'];

// Helper function to parse dates
function parseDate(dateStr: string | null | undefined): string | null {
  if (!dateStr || dateStr === '' || dateStr === 'undefined') return null;
  
  // Handle various date formats
  const cleanDate = dateStr.toString().trim();
  
  // Try to parse DD-Mon format (e.g., "6-May", "15-Jul")
  const monthMap: Record<string, string> = {
    'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04',
    'May': '05', 'Jun': '06', 'Jul': '07', 'Aug': '08',
    'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
  };
  
  const shortDateMatch = cleanDate.match(/^(\d{1,2})-(\w{3})$/);
  if (shortDateMatch) {
    const day = shortDateMatch[1].padStart(2, '0');
    const month = monthMap[shortDateMatch[2]] || '01';
    return `2024-${month}-${day}`;
  }
  
  // Try ISO format
  if (/^\d{4}-\d{2}-\d{2}/.test(cleanDate)) {
    return cleanDate.substring(0, 10);
  }
  
  return null;
}

// Calculate days between dates
function daysBetween(date1: string | null, date2: string | null): number {
  if (!date1 || !date2) return 0;
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  const diffTime = d2.getTime() - d1.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

// Generate sample opportunities from the parsed data
function generateOpportunities(): Opportunity[] {
  const today = new Date().toISOString().split('T')[0];
  const imputationLogs: ImputationLog[] = [];
  
  // Sample data extracted from the Excel file
  const rawData = [
    { refNo: 'AC25195', name: '3D SCANNING AND PRINTING', client: 'ADNOC', status: 'RFT YET TO RECEIVE', group: 'GTN', lead: 'Ashwin', partner: 'Nirmitsu', classification: 'EOI', qualification: 'Qualified', dateRecd: null, planned: null, submitted: null },
    { refNo: 'AC25289', name: 'DIGITAL FACTORY AND ACCELERATOR PROGRAM', client: 'ADNOC', status: 'RFT YET TO RECEIVE', group: 'GTN', lead: 'Ashwin', partner: 'Tetrasoft Open Stream', classification: 'EOI', qualification: 'Qualified', dateRecd: null, planned: null, submitted: null },
    { refNo: 'AC25216', name: 'ADNOC UNIFIED SUPPORT', client: 'ADNOC', status: 'TENDER SUBMITTED', group: 'GTN', lead: 'Ashwin', partner: 'Tetrasoft Open Stream', classification: 'Tender', qualification: 'Qualified', dateRecd: '2024-07-15', planned: '2024-08-01', submitted: '2024-07-28' },
    { refNo: 'AC24229', name: 'ADNOC DISTRIBUTION CALL OFF CONTRACT', client: 'ADNOC DISTRIBUTION', status: 'AWARDED', group: 'GES', lead: 'Vishnu/Gayathri', partner: '', classification: 'Tender', qualification: 'Qualified', dateRecd: '2024-05-10', planned: '2024-06-15', submitted: '2024-06-10', value: 850000 },
    { refNo: 'AC24246', name: 'WEP PROJECT Pipeline Drafting', client: 'ENPPI', status: 'AWARDED', group: 'GES', lead: 'Vishnu', partner: '', classification: 'Tender', qualification: 'Qualified', dateRecd: '2024-07-11', planned: '2024-07-25', submitted: '2024-07-20', value: 420000 },
    { refNo: 'AC24251', name: 'CALL OUT CONTRACT OF LAYOUT ENGINEERING', client: 'ADNOC', status: 'AWARDED', group: 'GDS', lead: 'Aseeb/Vishnu', partner: '', classification: 'EOI', qualification: 'Qualified', dateRecd: '2024-07-16', planned: '2024-11-06', submitted: '2024-11-01', value: 1200000 },
    { refNo: 'AC24254', name: 'Engineer for Civil Section new', client: 'ADNOC TSSA', status: 'AWARDED', group: 'GDS', lead: 'Vishnu', partner: '', classification: 'Tender', qualification: 'Qualified', dateRecd: '2024-07-17', planned: '2024-08-13', submitted: '2024-08-10', value: 180000 },
    { refNo: 'AC24256', name: 'Metscco Tanks Shop Drawings', client: 'METSCCO', status: 'AWARDED', group: 'GES', lead: 'Vishnu', partner: '', classification: 'Tender', qualification: 'Qualified', dateRecd: '2024-07-17', planned: '2024-07-25', submitted: '2024-07-22', value: 95000 },
    { refNo: 'AC24302', name: 'Consultancy Services TSSA Agreement', client: 'ADNOC TSSA', status: 'AWARDED', group: 'GES', lead: 'Vishnu', partner: '', classification: 'EOI', qualification: 'Qualified', dateRecd: '2024-08-20', planned: '2024-09-12', submitted: '2024-09-08', value: 650000 },
    { refNo: 'AC24317', name: 'Residual Engineering Scope package 1-12', client: 'GALFAR', status: 'AWARDED', group: 'GES', lead: 'Vishnu', partner: '', classification: 'Tender', qualification: 'Qualified', dateRecd: '2024-09-02', planned: '2024-09-09', submitted: '2024-09-07', value: 780000 },
    { refNo: 'AC24320', name: 'Construction of Flowlines - Asab & Sahil', client: 'GALFAR', status: 'AWARDED', group: 'GES', lead: 'Vishnu/Ashwin', partner: '', classification: 'Tender', qualification: 'Qualified', dateRecd: '2024-09-03', planned: '2024-09-17', submitted: '2024-09-15', value: 1450000 },
    { refNo: 'AC24329', name: 'WEP SURGE ANALYSIS', client: 'ENPPI', status: 'AWARDED', group: 'GES', lead: 'Aseeb/Vishnu', partner: '', classification: 'Tender', qualification: 'Qualified', dateRecd: '2024-09-10', planned: '2024-10-24', submitted: '2024-10-20', value: 320000 },
    { refNo: 'AC24396', name: 'EPC for BOP works Habshan P5', client: 'ROBT STONE', status: 'AWARDED', group: 'GES', lead: 'Vishnu', partner: '', classification: 'Tender', qualification: 'Qualified', dateRecd: '2024-10-15', planned: '2024-11-10', submitted: '2024-11-05', value: 920000 },
    { refNo: 'AC25014', name: 'SPEL IMPLEMENTATION FOR MENDER', client: 'ADNOC', status: 'AWARDED', group: 'GDS', lead: 'Aseeb', partner: '', classification: 'Tender', qualification: 'Qualified', dateRecd: '2024-11-01', planned: '2024-11-20', submitted: '2024-11-15', value: 550000 },
    { refNo: 'AC25026', name: 'MANPOWER SECONDMENT NMDC', client: 'NMDC', status: 'AWARDED', group: 'GDS', lead: 'Vishnu', partner: '', classification: 'Tender', qualification: 'Qualified', dateRecd: '2024-11-05', planned: '2024-11-25', submitted: '2024-11-20', value: 280000 },
    { refNo: 'AC25030', name: 'HYDRAULIC STUDY FOR 3 FUEL DEPOTS', client: 'ADNOC DISTRIBUTION', status: 'AWARDED', group: 'GES', lead: 'Gayathri/Vishnu', partner: '', classification: 'Tender', qualification: 'Qualified', dateRecd: '2024-11-08', planned: '2024-11-28', submitted: '2024-11-25', value: 145000 },
    { refNo: 'AC25043', name: 'MANPOWER 3D DESIGNERS', client: 'TECHNIP', status: 'AWARDED', group: 'GDS', lead: 'Vishnu', partner: '', classification: 'Tender', qualification: 'Qualified', dateRecd: '2024-11-12', planned: '2024-12-01', submitted: '2024-11-28', value: 380000 },
    { refNo: 'AC25060', name: 'CONSTRUCTION OF FLOW LINES BAB & NEB', client: 'GALFAR', status: 'AWARDED', group: 'GES', lead: 'Vishnu/Gayathri', partner: '', classification: 'Tender', qualification: 'Qualified', dateRecd: '2024-11-18', planned: '2024-12-10', submitted: '2024-12-05', value: 1680000 },
    { refNo: 'AC24263', name: 'Flow lines Replacement LOPC Reduction', client: 'MATRIX', status: 'ONGOING', group: 'GES', lead: 'Ashwin', partner: '', classification: 'Tender', qualification: 'Qualified', dateRecd: '2024-07-25', planned: '2024-08-07', submitted: '2024-08-05', value: 520000 },
    { refNo: 'AC24266', name: 'Flow lines Replacement SE Assets', client: 'GALFAR', status: 'ONGOING', group: 'GES', lead: 'Ashwin', partner: '', classification: 'Tender', qualification: 'Qualified', dateRecd: '2024-07-29', planned: '2024-08-07', submitted: '2024-08-05', value: 480000 },
    { refNo: 'AC24308', name: 'EPC WORKS SHAH GAS GATHERING MP7', client: 'TARGET', status: 'ONGOING', group: 'GES', lead: '', partner: '', classification: 'Tender', qualification: 'Qualified', dateRecd: '2024-08-29', planned: '2024-10-23', submitted: '2024-10-20', value: 890000 },
    { refNo: 'AC24314', name: 'Fuel Distribution Tanks and Associated Works', client: 'DHAFIR', status: 'ONGOING', group: 'GES', lead: 'Gayathri', partner: '', classification: 'Tender', qualification: 'Qualified', dateRecd: '2024-09-02', planned: '2024-10-17', submitted: '2024-10-14', value: 720000 },
    { refNo: 'AC24319', name: 'REPLACEMENT OF LMLS SYSTEM HABSHAN', client: 'FALCOR', status: 'ONGOING', group: 'GES', lead: 'Ashwin', partner: '', classification: 'Tender', qualification: 'Qualified', dateRecd: '2024-09-02', planned: '2024-10-04', submitted: '2024-10-01', value: 650000 },
    { refNo: 'AC24328', name: 'Over Pressure Protection Bu Hasa', client: 'PETROJET', status: 'ONGOING', group: 'GES', lead: 'Ashwin', partner: '', classification: 'Tender', qualification: 'Qualified', dateRecd: '2024-09-09', planned: '2024-09-24', submitted: '2024-09-20', value: 340000 },
    { refNo: 'AC24344', name: 'EPC WORKS SHAH GAS MP7 - GALFAR', client: 'GALFAR', status: 'ONGOING', group: 'GES', lead: 'Vishnu', partner: '', classification: 'Tender', qualification: 'Qualified', dateRecd: '2024-09-20', planned: '2024-10-23', submitted: '2024-10-20', value: 1150000 },
    { refNo: 'AC24346', name: 'EPC WORKS SHAH GAS MP7 - ROBTSTONE', client: 'ROBTSTONE', status: 'ONGOING', group: 'GES', lead: 'Vishnu', partner: '', classification: 'Tender', qualification: 'Qualified', dateRecd: '2024-09-23', planned: '2024-10-23', submitted: '2024-10-20', value: 980000 },
    { refNo: 'AC24390', name: 'CANOLE ENERGY Tank Farm', client: 'CANOLE', status: 'SUBMITTED', group: 'GES', lead: 'Vishnu', partner: '', classification: 'Tender', qualification: 'Qualified', dateRecd: '2024-10-08', planned: '2024-10-25', submitted: '2024-10-22', value: 560000 },
    { refNo: 'AC24391', name: 'Feedstock Pipelines Ta\'ziz Industrial Park', client: 'DHAFIR', status: 'SUBMITTED', group: 'GES', lead: 'Vishnu', partner: '', classification: 'Tender', qualification: 'Qualified', dateRecd: '2024-10-10', planned: '2024-10-28', submitted: '2024-10-25', value: 820000 },
    { refNo: 'AC24400', name: 'FEED Study CO2 Interconnection', client: 'KANOO', status: 'SUBMITTED', group: 'GES', lead: 'Vishnu/Gayathri', partner: '', classification: 'Tender', qualification: 'Qualified', dateRecd: '2024-10-12', planned: '2024-10-30', submitted: '2024-10-27', value: 290000 },
    { refNo: 'AC24403', name: 'Consultancy Hydraulic Models ADDC', client: 'ADDC/ TAQA', status: 'SUBMITTED', group: 'GES', lead: 'Vishnu/Gayathri', partner: '', classification: 'EOI', qualification: 'Qualified', dateRecd: '2024-10-14', planned: '2024-11-02', submitted: '2024-10-30', value: 420000 },
    { refNo: 'AC24419', name: 'EPC Supply 4 New NGL Pumps', client: 'GALFAR', status: 'SUBMITTED', group: 'GES', lead: 'Vishnu', partner: '', classification: 'Tender', qualification: 'Qualified', dateRecd: '2024-10-20', planned: '2024-11-08', submitted: '2024-11-05', value: 680000 },
    { refNo: 'AC24428', name: 'EPC SARB Produced Water Treatment', client: 'ROBT STONE', status: 'SUBMITTED', group: 'GES', lead: 'Ashwin/Vishnu', partner: '', classification: 'Tender', qualification: 'Qualified', dateRecd: '2024-10-22', planned: '2024-11-10', submitted: '2024-11-07', value: 1250000 },
    { refNo: 'AC24432', name: 'NEW GAS OIL DEPOT MINA ZAYED', client: 'ADNOC DISTRIBUTION', status: 'SUBMITTED', group: 'GES', lead: 'Gayathri/Aseeb', partner: '', classification: 'Tender', qualification: 'Qualified', dateRecd: '2024-10-25', planned: '2024-11-15', submitted: '2024-11-12', value: 950000 },
    { refNo: 'AC24441', name: 'Pipeline Alignment Sheet Stress Analysis', client: 'PENSPEN', status: 'SUBMITTED', group: 'GES', lead: 'Ashwin/Vishnu', partner: '', classification: 'Tender', qualification: 'Qualified', dateRecd: '2024-10-28', planned: '2024-11-18', submitted: '2024-11-15', value: 380000 },
    { refNo: 'AC25027', name: 'Feasibility Study New Refinery Yemen', client: 'OILEUM', status: 'SUBMITTED', group: 'GES', lead: 'Vishnu', partner: '', classification: 'Tender', qualification: 'Qualified', dateRecd: '2024-11-06', planned: '2024-11-26', submitted: '2024-11-22', value: 750000 },
    { refNo: 'AC25035', name: 'REROUTING AND NEW FWS', client: 'ADNOC DISTRIBUTION', status: 'SUBMITTED', group: 'GES', lead: 'Vishnu', partner: '', classification: 'Tender', qualification: 'Qualified', dateRecd: '2024-11-10', planned: '2024-11-30', submitted: '2024-11-27', value: 420000 },
    { refNo: 'AC25048', name: 'KOC Water Treatment GC25 & GC30', client: 'SCHLUMBERGER', status: 'SUBMITTED', group: 'GES', lead: 'Ashwin', partner: '', classification: 'Tender', qualification: 'Qualified', dateRecd: '2024-11-15', planned: '2024-12-05', submitted: '2024-12-02', value: 580000 },
    { refNo: 'AC25059', name: 'Feasibility Study Propane Storage Mussafah', client: 'ADNOC DISTRIBUTION', status: 'SUBMITTED', group: 'GES', lead: 'Vishnu/Gayathri', partner: '', classification: 'Tender', qualification: 'Qualified', dateRecd: '2024-11-18', planned: '2024-12-08', submitted: '2024-12-05', value: 480000 },
    { refNo: 'AC25061', name: 'RUMAITHA PHASE III STRESS ANALYSIS', client: 'ADNOC ONSHORE', status: 'SUBMITTED', group: 'GES', lead: 'Vishnu/Ashwin', partner: '', classification: 'Tender', qualification: 'Qualified', dateRecd: '2024-11-20', planned: '2024-12-10', submitted: '2024-12-07', value: 320000 },
    { refNo: 'AC25068', name: 'SEPARATION FACILITY GC23,24 WATER INJECTION', client: 'SCHLUMBERGER', status: 'SUBMITTED', group: 'GES', lead: 'Ashwin', partner: '', classification: 'Tender', qualification: 'Qualified', dateRecd: '2024-11-22', planned: '2024-12-12', submitted: '2024-12-09', value: 640000 },
    { refNo: 'AC25069', name: 'PMC Services Ma\'an Development Area', client: 'HS INTERNATIONAL', status: 'SUBMITTED', group: 'GES', lead: 'Aseeb', partner: '', classification: 'EOI', qualification: 'Qualified', dateRecd: '2024-11-24', planned: '2024-12-14', submitted: '2024-12-11', value: 1100000 },
    { refNo: 'AC24195', name: 'DECOUPLING MODIFICATION', client: 'ASTRA', status: 'HOLD / CLOSED', group: 'GES', lead: '', partner: '', classification: 'Tender', qualification: '', dateRecd: '2024-04-15', planned: '2024-05-01', submitted: null, value: 180000 },
    { refNo: 'AC24196', name: 'Lab and Warehouse modification Engineering', client: 'APOGEE', status: 'REGRETTED', group: 'GES', lead: '', partner: '', classification: 'Tender', qualification: '', dateRecd: '2024-04-18', planned: '2024-05-05', submitted: null },
    { refNo: 'AC24197', name: 'ADNOC GAS STORAGE TANK 33-D-15', client: 'QATAR ENGINEERING', status: 'REGRETTED', group: 'GES', lead: '', partner: '', classification: 'Tender', qualification: '', dateRecd: '2024-04-20', planned: '2024-05-08', submitted: null },
    { refNo: 'AC24198', name: 'Sales Gas Pipeline Enhancement', client: 'GALFAR', status: 'SUBMITTED', group: 'GES', lead: '', partner: '', classification: 'Tender', qualification: '', dateRecd: '2024-04-22', planned: '2024-05-10', submitted: '2024-05-08', value: 350000 },
    { refNo: 'AC24199', name: 'Conceptual Study PAGA System ADOC', client: 'ADOC', status: 'REGRETTED', group: 'GES', lead: '', partner: '', classification: 'Tender', qualification: '', dateRecd: '2024-04-25', planned: '2024-05-12', submitted: null },
    { refNo: 'AC24200', name: 'ADNOC City Gas Control Room Al Jubail', client: 'ADNOC', status: 'REGRETTED', group: 'GES', lead: '', partner: '', classification: 'EOI', qualification: '', dateRecd: '2024-04-28', planned: '2024-05-15', submitted: null },
    { refNo: 'AC24201', name: 'Replacement of Crude Oil Header Das Island', client: 'PILCO', status: 'SUBMITTED', group: 'GES', lead: '', partner: '', classification: 'Tender', qualification: '', dateRecd: '2024-05-01', planned: '2024-05-18', submitted: '2024-05-16', value: 420000 },
    { refNo: 'AC24237', name: 'ADNOC LNG Fabric maintenance-Engineering', client: 'IMKK', status: 'LOST', group: 'GES', lead: 'Ashwin', partner: '', classification: 'Tender', qualification: '', dateRecd: '2024-05-20', planned: '2024-05-06', submitted: '2024-05-05', value: 280000 },
    { refNo: 'AC24240', name: 'SHUTDOWN TRANSCO SUBSTATION MERAM', client: 'AL GHURAIR', status: 'LOST', group: 'GES', lead: '', partner: '', classification: 'Tender', qualification: '', dateRecd: '2024-07-15', planned: '2024-08-05', submitted: '2024-08-03', value: 320000 },
    { refNo: 'AC24257', name: 'FRAMEWORK AGREEMENT ENGINEERING PMC', client: 'ADNOC REFINING', status: 'LOST', group: 'GES', lead: 'Vishnu/Aseeb', partner: '', classification: 'EOI', qualification: '', dateRecd: '2024-12-04', planned: '2025-02-26', submitted: '2025-02-25', value: 2500000 },
  ];

  const opportunities: Opportunity[] = rawData.map((item, index) => {
    const canonicalStatus = STATUS_MAPPING[item.status.toUpperCase()] || item.status;
    const canonicalLead = LEAD_MAPPING[item.lead] || item.lead || '';
    
    // Impute probability based on stage
    const probabilityImputed = !item.value;
    const probability = PROBABILITY_BY_STAGE[canonicalStatus] || 30;
    
    // Impute value using median for group if missing
    const medianValueByGroup: Record<string, number> = {
      'GES': 520000,
      'GDS': 350000,
      'GTN': 450000,
      'GTS': 280000,
    };
    const valueImputed = !item.value;
    const value = item.value || medianValueByGroup[item.group] || 400000;
    
    // Calculate expected value
    const expectedValue = value * (probability / 100);
    
    // Parse dates
    const dateRecd = parseDate(item.dateRecd);
    const plannedDate = parseDate(item.planned);
    const submittedDate = parseDate(item.submitted);
    
    // Impute planned date if missing
    let plannedDateImputed = false;
    let plannedDateImputationReason = '';
    let finalPlannedDate = plannedDate;
    if (!plannedDate && dateRecd) {
      finalPlannedDate = new Date(new Date(dateRecd).getTime() + 21 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      plannedDateImputed = true;
      plannedDateImputationReason = 'Set to date_tender_recd + 21 days (median days_to_submit for GES group)';
    }
    
    // Impute last contact date
    let lastContactDate = submittedDate || dateRecd;
    let lastContactImputed = false;
    let lastContactImputationReason = '';
    if (!lastContactDate && dateRecd) {
      lastContactDate = new Date(new Date(dateRecd).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      lastContactImputed = true;
      lastContactImputationReason = 'Set to date_tender_recd + 7 days (default follow-up period)';
    }
    
    // Calculate derived fields
    const daysSinceTenderReceived = dateRecd ? daysBetween(dateRecd, today) : 0;
    const daysToPlannedSubmission = finalPlannedDate ? daysBetween(today, finalPlannedDate) : 0;
    const agedDays = lastContactDate ? daysBetween(lastContactDate, today) : 0;
    
    // Calculate risk flags
    const willMissDeadline = finalPlannedDate && !submittedDate && daysToPlannedSubmission <= 7;
    const isAtRisk = (agedDays >= 30) || (item.qualification !== 'Qualified' && probability < 50);
    
    return {
      id: `OPP-${String(index + 1).padStart(4, '0')}`,
      opportunityRefNo: item.refNo,
      tenderNo: item.refNo,
      tenderName: item.name,
      clientName: item.client,
      clientType: item.client.includes('ADNOC') ? 'Current Client' : 'Potential Client',
      clientLead: '',
      opportunityClassification: item.classification,
      opportunityStatus: item.status,
      canonicalStage: canonicalStatus,
      qualificationStatus: item.qualification || 'Under Review',
      groupClassification: item.group,
      domainSubGroup: 'Detailed Engineering',
      internalLead: canonicalLead,
      opportunityValue: value,
      opportunityValue_imputed: valueImputed,
      opportunityValue_imputation_reason: valueImputed ? `Median value for ${item.group} group: ${medianValueByGroup[item.group]?.toLocaleString() || '400,000'} USD` : '',
      probability: probability,
      probability_imputed: probabilityImputed,
      probability_imputation_reason: probabilityImputed ? `Inferred from stage mapping: ${canonicalStatus} = ${probability}%` : '',
      expectedValue: expectedValue,
      dateTenderReceived: dateRecd,
      tenderPlannedSubmissionDate: finalPlannedDate,
      tenderPlannedSubmissionDate_imputed: plannedDateImputed,
      tenderPlannedSubmissionDate_imputation_reason: plannedDateImputationReason,
      tenderSubmittedDate: submittedDate,
      lastContactDate: lastContactDate,
      lastContactDate_imputed: lastContactImputed,
      lastContactDate_imputation_reason: lastContactImputationReason,
      daysSinceTenderReceived: daysSinceTenderReceived,
      daysToPlannedSubmission: daysToPlannedSubmission,
      agedDays: agedDays,
      willMissDeadline: willMissDeadline || false,
      isAtRisk: isAtRisk,
      partnerInvolvement: !!item.partner,
      partnerName: item.partner || '',
      country: 'UAE',
      remarks: '',
      awardStatus: canonicalStatus === 'Awarded' ? 'AWARDED' : canonicalStatus === 'Lost/Regretted' ? 'LOST' : '',
    };
  });
  
  return opportunities;
}

export { generateOpportunities };
export const opportunities = generateOpportunities();

// Calculate summary statistics
export function calculateSummaryStats(data: Opportunity[]) {
  const activeOpps = data.filter(o => !['Lost/Regretted', 'Closed', 'Lost', 'Regretted'].includes(o.canonicalStage));
  const wonOpps = data.filter(o => o.canonicalStage === 'Awarded');
  const lostOpps = data.filter(o => o.awardStatus === 'LOST' || o.canonicalStage === 'Lost');
  const regrettedOpps = data.filter(o => o.opportunityStatus?.toUpperCase() === 'REGRETTED' || o.canonicalStage === 'Regretted');
  const atRiskOpps = data.filter(o => o.isAtRisk);
  
  const totalPipelineValue = activeOpps.reduce((sum, o) => sum + o.opportunityValue, 0);
  const weightedPipeline = activeOpps.reduce((sum, o) => sum + o.expectedValue, 0);
  const wonValue = wonOpps.reduce((sum, o) => sum + o.opportunityValue, 0);
  const lostValue = lostOpps.reduce((sum, o) => sum + o.opportunityValue, 0);
  const regrettedValue = regrettedOpps.reduce((sum, o) => sum + o.opportunityValue, 0);
  
  const submittedOpps = data.filter(o => o.tenderSubmittedDate);
  const avgDaysToSubmission = submittedOpps.length > 0 
    ? submittedOpps.reduce((sum, o) => sum + (o.daysSinceTenderReceived - o.daysToPlannedSubmission), 0) / submittedOpps.length
    : 0;
  
  return {
    totalActive: activeOpps.length,
    totalPipelineValue,
    weightedPipeline,
    wonCount: wonOpps.length,
    wonValue,
    lostCount: lostOpps.length,
    lostValue,
    regrettedCount: regrettedOpps.length,
    regrettedValue,
    atRiskCount: atRiskOpps.length,
    avgDaysToSubmission: Math.round(avgDaysToSubmission),
  };
}

// Calculate funnel data
export function calculateFunnelData(data: Opportunity[]) {
  const stageCounts: Record<string, { count: number; value: number }> = {};
  
  STAGE_ORDER.forEach(stage => {
    const stageOpps = data.filter(o => o.canonicalStage === stage);
    stageCounts[stage] = {
      count: stageOpps.length,
      value: stageOpps.reduce((sum, o) => sum + o.opportunityValue, 0),
    };
  });
  
  // Calculate conversion rates
  const funnelData = STAGE_ORDER.map((stage, index) => {
    const current = stageCounts[stage];
    const previous = index > 0 ? stageCounts[STAGE_ORDER[index - 1]] : null;
    const conversionRate = previous && previous.count > 0 
      ? Math.round((current.count / previous.count) * 100) 
      : 100;
    
    return {
      stage,
      count: current.count,
      value: current.value,
      conversionRate,
    };
  });
  
  return funnelData;
}

// Get leaderboard data
export function getLeaderboardData(data: Opportunity[]) {
  const leadStats: Record<string, { count: number; value: number; won: number; lost: number }> = {};
  
  data.forEach(o => {
    if (!o.internalLead) return;
    
    if (!leadStats[o.internalLead]) {
      leadStats[o.internalLead] = { count: 0, value: 0, won: 0, lost: 0 };
    }
    
    leadStats[o.internalLead].count++;
    leadStats[o.internalLead].value += o.opportunityValue;
    
    if (o.canonicalStage === 'Awarded') leadStats[o.internalLead].won++;
    if (o.canonicalStage === 'Lost/Regretted') leadStats[o.internalLead].lost++;
  });
  
  return Object.entries(leadStats)
    .map(([name, stats]) => ({
      name,
      ...stats,
      winRate: stats.won + stats.lost > 0 
        ? Math.round((stats.won / (stats.won + stats.lost)) * 100) 
        : 0,
    }))
    .sort((a, b) => b.value - a.value);
}

// Get client data
export function getClientData(data: Opportunity[]) {
  const clientStats: Record<string, { count: number; value: number }> = {};
  
  data.forEach(o => {
    if (!clientStats[o.clientName]) {
      clientStats[o.clientName] = { count: 0, value: 0 };
    }
    clientStats[o.clientName].count++;
    clientStats[o.clientName].value += o.opportunityValue;
  });
  
  return Object.entries(clientStats)
    .map(([name, stats]) => ({ name, ...stats }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);
}

// Data health calculation
export function calculateDataHealth(data: Opportunity[]) {
  const mandatoryFields = ['internalLead', 'opportunityValue', 'tenderPlannedSubmissionDate'];
  let totalFields = data.length * mandatoryFields.length;
  let completedFields = 0;
  const missingRows: Array<{ id: string; refNo: string; missingFields: string[] }> = [];
  
  data.forEach(o => {
    const missing: string[] = [];
    
    if (!o.internalLead) missing.push('Internal Lead');
    else completedFields++;
    
    if (o.opportunityValue_imputed) missing.push('Opportunity Value (imputed)');
    else completedFields++;
    
    if (o.tenderPlannedSubmissionDate_imputed || !o.tenderPlannedSubmissionDate) {
      missing.push('Planned Submission Date');
    } else {
      completedFields++;
    }
    
    if (missing.length > 0) {
      missingRows.push({ id: o.id, refNo: o.opportunityRefNo, missingFields: missing });
    }
  });
  
  return {
    healthScore: Math.round((completedFields / totalFields) * 100),
    missingRows: missingRows.slice(0, 20),
    imputedCount: data.filter(o => 
      o.opportunityValue_imputed || 
      o.probability_imputed || 
      o.tenderPlannedSubmissionDate_imputed ||
      o.lastContactDate_imputed
    ).length,
  };
}
