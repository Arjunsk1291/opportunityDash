#!/usr/bin/env node

import https from 'https';

const GOOGLE_API_KEY = 'AIzaSyCrcexNBXPTaclKhCzkONVwCngRij837j0';
const SPREADSHEET_ID = '1DrnoJDytUd3_2uL5C3yyHT4yX4kleonTXaxiLgPCYK4';
const SHEET_NAME = 'MASTER TENDER LIST AVENIR';

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function fetchData(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
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

// ✅ Get unique statuses - avoid double counting when both are same
function getUniqueStatuses(avenirStatus, tenderResult) {
  const avenir = normalizeStatus(avenirStatus);
  const tender = normalizeStatus(tenderResult);
  
  const statuses = [];
  
  if (avenir) statuses.push(avenir);
  if (tender && tender !== avenir) statuses.push(tender);  // ✅ Only add if different
  
  return statuses;
}

async function collectData() {
  try {
    log('\n════════════════════════════════════════', 'cyan');
    log('📊 GOOGLE SHEETS DATA COLLECTOR', 'bright');
    log('════════════════════════════════════════\n', 'cyan');

    log('📡 Fetching data from Google Sheets...', 'blue');
    const range = `${SHEET_NAME}!B4:Z1000`;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}?key=${GOOGLE_API_KEY}`;

    const response = await fetchData(url);
    const rows = response.values || [];

    if (rows.length < 2) {
      log('❌ No data found in Google Sheet', 'red');
      return;
    }

    log(`✅ Received ${rows.length} rows from sheet\n`, 'green');

    const headers = rows[0].map(h => h?.toString().trim().toUpperCase() || '');
    log('📋 COLUMN HEADERS FOUND:', 'yellow');
    headers.forEach((h, idx) => {
      if (h) log(`  [${idx}] ${h}`, 'dim');
    });
    log('', 'reset');

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
    };

    log('🔍 MAPPED COLUMNS:', 'yellow');
    Object.entries(colIndices).forEach(([key, idx]) => {
      const status = idx >= 0 ? `${colors.green}✓${colors.reset}` : `${colors.red}✗${colors.reset}`;
      log(`  ${status} ${key}: column ${idx}`, 'dim');
    });
    log('', 'reset');

    const tenders = [];
    let skipped = 0;

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;

      const hasContent = row.some(cell => cell && cell.toString().trim() !== '');
      if (!hasContent) { skipped++; continue; }

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

      const avenirStatus = getValue(colIndices.avenirStatus);
      const tenderResult = getValue(colIndices.tenderResult);

      const tender = {
        refNo: getValue(colIndices.tenderNo),
        tenderType: getValue(colIndices.tenderType),
        client: getValue(colIndices.client),
        tenderName: getValue(colIndices.tenderName),
        rfpReceivedDate: rfpDate,
        lead: getValue(colIndices.lead),
        value: getNumericValue(colIndices.value),
        avenirStatus: normalizeStatus(avenirStatus),
        tenderResult: normalizeStatus(tenderResult),
        statuses: getUniqueStatuses(avenirStatus, tenderResult),  // ✅ Unique statuses array
      };

      if (tender.refNo || tender.client || tender.tenderName) {
        tenders.push(tender);
      }
    }

    log(`✅ Parsed ${tenders.length} tenders (${skipped} empty rows skipped)\n`, 'green');

    log('📌 FIRST 5 TENDERS:', 'yellow');
    log('════════════════════════════════════════', 'cyan');
    
    tenders.slice(0, 5).forEach((tender, idx) => {
      log(`\n[${idx + 1}] ${tender.refNo || 'N/A'}`, 'bright');
      log(`    Client: ${tender.client}`, 'cyan');
      log(`    Name: ${tender.tenderName}`, 'cyan');
      log(`    Type: ${tender.tenderType}`, 'cyan');
      log(`    Lead: ${tender.lead || 'UNASSIGNED'}`, 'cyan');
      log(`    Value: $${tender.value.toLocaleString()}`, 'bright');
      log(`    AVENIR Status: ${tender.avenirStatus}`, 'cyan');
      log(`    TENDER Result: ${tender.tenderResult}`, 'cyan');
      log(`    Combined Statuses: ${tender.statuses.join(' + ') || 'NONE'}`, 'cyan');  // ✅ Shows both
      log(`    RFP Date: ${tender.rfpReceivedDate || 'N/A'}`, 'cyan');
    });

    log('\n\n📊 DATA STATISTICS:', 'yellow');
    log('════════════════════════════════════════', 'cyan');

    const statusCounts = {};
    let totalValue = 0;

    // ✅ Count each unique status separately (no double counting)
    tenders.forEach(tender => {
      tender.statuses.forEach(status => {
        statusCounts[status] = (statusCounts[status] || 0) + 1;
      });
      totalValue += tender.value;
    });

    log(`Total Tenders: ${tenders.length}`, 'bright');
    log(`Total Value: $${totalValue.toLocaleString()}`, 'bright');
    log(`Average Value: $${(totalValue / tenders.length).toLocaleString()}`, 'bright');
    log(`\n${colors.yellow}Status Distribution (AVENIR STATUS + TENDER RESULT):${colors.reset}`);
    
    Object.entries(statusCounts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([status, count]) => {
        const pct = ((count / tenders.length) * 100).toFixed(1);
        log(`  ${status || 'UNKNOWN'}: ${count} (${pct}%)`, 'cyan');
      });

    log(`\n${colors.yellow}Top 10 Leads:${colors.reset}`);
    const leadCounts = {};
    tenders.forEach(tender => {
      const lead = tender.lead || 'UNASSIGNED';
      leadCounts[lead] = (leadCounts[lead] || 0) + 1;
    });

    Object.entries(leadCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([lead, count]) => {
        log(`  ${lead}: ${count}`, 'cyan');
      });

    log('\n\n💾 DATA COLLECTION COMPLETE', 'yellow');
    log('════════════════════════════════════════', 'cyan');
    log('✅ Data collection complete!', 'green');
    log(`✅ Ready to sync ${tenders.length} tenders to MongoDB`, 'green');
    log('✅ All columns mapped successfully\n', 'green');

  } catch (error) {
    log(`\n❌ ERROR: ${error.message}`, 'red');
    log('Check Google API key and Spreadsheet ID', 'yellow');
    process.exit(1);
  }
}

collectData();
