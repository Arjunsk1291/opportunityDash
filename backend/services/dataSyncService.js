import https from 'https';

const GOOGLE_API_KEY = 'AIzaSyCrcexNBXPTaclKhCzkONVwCngRij837j0';
const SPREADSHEET_ID = '1DrnoJDytUd3_2uL5C3yyHT4yX4kleonTXaxiLgPCYK4';
const SHEET_NAME = 'MASTER TENDER LIST AVENIR';

function fetchGoogleSheets() {
  return new Promise((resolve, reject) => {
    const range = `${SHEET_NAME}!B4:Z1000`;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}?key=${GOOGLE_API_KEY}`;

    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('Failed to parse Google Sheets response'));
        }
      });
    }).on('error', reject);
  });
}

function normalizeStatus(status) {
  if (!status) return '';
  return status.toString().trim().toUpperCase();
}

function parseDate(year, dateStr) {
  if (!dateStr || dateStr === '' || dateStr === '-') return null;
  if (!year || year === '') year = new Date().getFullYear().toString();

  const monthMap = {
    jan: '01', feb: '02', mar: '03', apr: '04',
    may: '05', jun: '06', jul: '07', aug: '08',
    sep: '09', oct: '10', nov: '11', dec: '12',
  };

  const dayMonthMatch = dateStr.toString().match(/^(\d{1,2})[\s-](\w+)$/i);
  if (dayMonthMatch) {
    const day = dayMonthMatch[1].padStart(2, '0');
    const monthKey = dayMonthMatch[2].toLowerCase().substring(0, 3);
    const month = monthMap[monthKey];
    if (month) return `${year}-${month}-${day}`;
  }
  return null;
}

export async function syncTendersFromGoogleSheets() {
  try {
    console.log('🔔 [dataSyncService] Fetching from Google Sheets...');
    
    const response = await fetchGoogleSheets();
    const rows = response.values || [];

    if (rows.length < 2) {
      throw new Error('No data found in Google Sheet');
    }

    const headers = rows[0].map(h => h?.toString().trim().toUpperCase() || '');

    const findColumn = (keywords) => {
      return headers.findIndex(h => keywords.some(k => h.includes(k.toUpperCase())));
    };

    const colIndices = {
      tenderNo: findColumn(['TENDER NO', 'REF NO']),
      tenderType: findColumn(['TENDER TYPE']),
      client: findColumn(['CLIENT']),
      tenderName: findColumn(['TENDER NAME', 'DESCRIPTION']),
      year: findColumn(['YEAR']),
      dateReceived: findColumn(['DATE TENDER RECD', 'DATE RECEIVED']),
      lead: findColumn(['ASSIGNED PERSON']),
      value: findColumn(['TENDER VALUE']),
      avenirStatus: findColumn(['AVENIR STATUS']),
      tenderResult: findColumn(['TENDER RESULT']),
      groupClassification: findColumn(['GDS/GES']),  // ✅ NEW: Map GDS/GES column
    };

    console.log(`✅ Found ${rows.length} rows, parsing data...`);

    const tenders = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;

      const hasContent = row.some(cell => cell && cell.toString().trim() !== '');
      if (!hasContent) continue;

      const getValue = (colIdx) => {
        if (colIdx < 0 || colIdx >= row.length) return '';
        return row[colIdx]?.toString().trim() || '';
      };

      const getNumericValue = (colIdx) => {
        const val = getValue(colIdx).replace(/[^0-9.-]/g, '');
        return parseFloat(val) || 0;
      };

      const year = getValue(colIndices.year);
      const dateReceived = getValue(colIndices.dateReceived);
      const rfpDate = parseDate(year, dateReceived);

      const tender = {
        opportunityRefNo: getValue(colIndices.tenderNo),
        tenderName: getValue(colIndices.tenderName),
        clientName: getValue(colIndices.client),
        opportunityClassification: getValue(colIndices.tenderType),
        internalLead: getValue(colIndices.lead),
        opportunityValue: getNumericValue(colIndices.value),
        canonicalStage: normalizeStatus(getValue(colIndices.avenirStatus)),
        dateTenderReceived: rfpDate,
        avenirStatus: normalizeStatus(getValue(colIndices.avenirStatus)),
        tenderResult: normalizeStatus(getValue(colIndices.tenderResult)),
        groupClassification: getValue(colIndices.groupClassification),  // ✅ NEW: Map from GDS/GES column
        syncedAt: new Date(),
      };

      if (tender.opportunityRefNo || tender.clientName || tender.tenderName) {
        tenders.push(tender);
      }
    }

    console.log(`✅ Parsed ${tenders.length} tenders from Google Sheets`);
    return tenders;

  } catch (error) {
    console.error('❌ [dataSyncService] Error:', error.message);
    throw error;
  }
}

export async function transformTendersToOpportunities(tenders) {
  return tenders.map(tender => ({
    ...tender,
    googleSheetRowId: `sheet-${tender.opportunityRefNo}`,
    qualificationStatus: 'Pending',
    tenderPlannedSubmissionDate: null,
    rawGoogleData: { synced: new Date().toISOString() },
  }));
}
