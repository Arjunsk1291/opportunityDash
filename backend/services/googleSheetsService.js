const GOOGLE_SHEETS_API_URL = 'https://sheets.googleapis.com/v4/spreadsheets';

function findHeaderRow(rows) {
  if (!rows || rows.length === 0) return 0;
  
  console.log(`🔍 Checking ${Math.min(5, rows.length)} rows for headers...`);
  
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    const row = rows[i];
    if (!row || row.length === 0) {
      console.log(`   Row ${i}: empty`);
      continue;
    }
    
    const nonEmptyCells = row.filter(cell => cell && cell.trim()).length;
    console.log(`   Row ${i}: ${nonEmptyCells} cells, first few: ${row.slice(0, 5).join(' | ')}`);
    
    if (nonEmptyCells >= 3) {
      console.log(`✅ Header row detected at index ${i}`);
      return i;
    }
  }
  
  console.log(`⚠️  No clear header row found, using row 0`);
  return 0;
}

export async function fetchGoogleSheetData(apiKey, spreadsheetId, sheetName) {
  try {
    console.log(`🔄 Fetching sheet: ${sheetName}`);
    const url = `${GOOGLE_SHEETS_API_URL}/${spreadsheetId}/values/${sheetName}?key=${apiKey}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ API Error:', errorText);
      throw new Error(`Google Sheets API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (data.error) {
      throw new Error(`Google Sheets error: ${data.error.message}`);
    }
    
    const rows = data.values || [];
    console.log(`📊 Total rows in sheet: ${rows.length}`);
    
    if (rows.length === 0) {
      throw new Error('Sheet is empty');
    }
    
    const headerRowIndex = findHeaderRow(rows);
    const headers = rows[headerRowIndex] || [];
    
    console.log(`📋 Headers at row ${headerRowIndex}: ${headers.length} columns`);
    console.log(`   ${headers.slice(0, 10).join(' | ')}`);
    
    return {
      headerRowIndex,
      rows: rows,
      headers: headers,
    };
  } catch (error) {
    console.error('❌ fetchGoogleSheetData error:', error.message);
    throw error;
  }
}

// ✅ Normalize status to canonical stage (case-insensitive, Lost vs Regretted separate)
function normalizeToCanonicalStage(status) {
  if (!status) return 'Pre-bid';
  
  const upper = status.toUpperCase().trim();
  
  // Exact matches
  if (upper === 'SUBMITTED' || upper === 'TENDER SUBMITTED') return 'Submitted';
  if (upper === 'AWARDED') return 'Awarded';
  
  // Lost and Regretted are DIFFERENT
  if (upper === 'LOST') return 'Lost';
  if (upper === 'REGRETTED') return 'Regretted';
  
  // Generic hold/paused/closed
  if (upper.includes('HOLD') || upper.includes('CLOSED') || upper.includes('PAUSED')) return 'On Hold/Paused';
  if (upper.includes('IN PROGRESS') || upper === 'ONGOING' || upper === 'WORKING') return 'In Progress';
  if (upper.includes('PRE') || upper === 'RFT' || upper === 'EOI' || upper === 'OPEN' || upper === 'BD') return 'Pre-bid';
  
  // Default
  return 'Pre-bid';
}

export function mapSheetRowToOpportunity(row, mapping) {
  const getCol = (fieldKey) => {
    const colIndex = mapping[fieldKey];
    if (colIndex === null || colIndex === undefined || colIndex === '') return null;
    const idx = parseInt(colIndex);
    if (isNaN(idx) || idx < 0 || idx >= row.length) return null;
    return row[idx]?.trim() || null;
  };

  const refNo = getCol('opportunityRefNo');
  const tenderName = getCol('tenderName') || 'N/A';
  const clientName = getCol('clientName') || 'N/A';
  const statusStr = getCol('canonicalStage') || 'Pre-bid';
  const valueStr = (getCol('opportunityValue') || '0').replace(/[,\s]/g, '');
  const probStr = (getCol('probability') || '20').replace(/[,\s]/g, '');
  
  // ✅ Normalize status to canonical stage
  const canonicalStage = normalizeToCanonicalStage(statusStr);
  
  const opportunityValue = parseFloat(valueStr) || 0;
  const probability = parseFloat(probStr) || 20;
  const expectedValue = (opportunityValue * probability) / 100;

  return {
    opportunityRefNo: refNo || 'UNKNOWN',
    tenderName: tenderName,
    clientName: clientName,
    internalLead: getCol('internalLead') || 'Unassigned',
    opportunityClassification: getCol('opportunityClassification') || 'General',
    opportunityStatus: statusStr,
    canonicalStage: canonicalStage,
    qualificationStatus: 'Under Review',
    groupClassification: getCol('groupClassification') || 'GES',
    domainSubGroup: 'Engineering',
    clientType: 'Client',
    
    opportunityValue: opportunityValue,
    probability: probability,
    expectedValue: expectedValue,
    opportunityValue_imputed: opportunityValue === 0,
    opportunityValue_imputation_reason: opportunityValue === 0 ? 'Value not mapped - using 0' : '',
    probability_imputed: false,
    probability_imputation_reason: '',
    
    dateTenderReceived: getCol('dateTenderReceived'),
    tenderPlannedSubmissionDate: getCol('tenderPlannedSubmissionDate'),
    tenderSubmittedDate: getCol('tenderSubmittedDate'),
    lastContactDate: getCol('lastContactDate'),
    tenderPlannedSubmissionDate_imputed: false,
    tenderPlannedSubmissionDate_imputation_reason: '',
    lastContactDate_imputed: false,
    lastContactDate_imputation_reason: '',
    
    daysSinceTenderReceived: 0,
    daysToPlannedSubmission: 0,
    agedDays: 0,
    willMissDeadline: false,
    isAtRisk: false,
    
    partnerInvolvement: false,
    partnerName: '',
    country: 'UAE',
    remarks: getCol('remarks') || '',
    awardStatus: '',
  };
}
