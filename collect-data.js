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
  if (tender && tender !== avenir) statuses.push(tender);
  
  return statuses;
}

async function main() {
  log('\n════════════════════════════════════════', 'cyan');
  log('📊 GOOGLE SHEETS DATA COLLECTOR', 'bright');
  log('════════════════════════════════════════\n', 'cyan');

  try {
    log('📡 Fetching data from Google Sheets...', 'blue');
    
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(SHEET_NAME)}?key=${GOOGLE_API_KEY}`;
    const response = await fetchData(url);
    
    if (!response.values || response.values.length < 4) {
      log('❌ No data found in sheet', 'red');
      process.exit(1);
    }

    const allRows = response.values;
    log(`✅ Received ${allRows.length} rows from sheet\n`, 'green');

    const headerRow = allRows[3];
    log('📋 COLUMN HEADERS FOUND:', 'bright');
    headerRow.forEach((header, idx) => {
      log(`  [${idx}] ${header}`);
    });

    log('\n🔍 MAPPED COLUMNS:', 'bright');
    
    const columnMap = {
      tenderNo: headerRow.indexOf('TENDER NO'),
      tenderType: headerRow.indexOf('TENDER TYPE'),
      client: headerRow.indexOf('CLIENT'),
      tenderName: headerRow.indexOf('TENDER NAME'),
      year: headerRow.indexOf('YEAR'),
      dateReceived: headerRow.indexOf('DATE TENDER RECD'),
      lead: headerRow.indexOf('ASSIGNED PERSON'),
      value: headerRow.indexOf('TENDER VALUE'),
      avenirStatus: headerRow.indexOf('AVENIR STATUS'),
      tenderResult: headerRow.indexOf('TENDER RESULT'),
      groupClassification: headerRow.indexOf('GDS/GES'),  // ✅ NEW: Map GDS/GES column
    };

    Object.entries(columnMap).forEach(([key, idx]) => {
      const symbol = idx >= 0 ? '✓' : '✗';
      const color = idx >= 0 ? 'green' : 'red';
      log(`  ${symbol} ${key}: column ${idx}`, color);
    });

    const tenders = [];
    let emptyRowsSkipped = 0;

    for (let i = 4; i < allRows.length; i++) {
      const row = allRows[i];
      if (!row || !row[columnMap.tenderNo]) {
        emptyRowsSkipped++;
        continue;
      }

      const getValue = (colIdx) => {
        if (colIdx < 0 || colIdx >= row.length) return '';
        return row[colIdx]?.toString().trim() || '';
      };

      const getNumericValue = (colIdx) => {
        const val = getValue(colIdx).replace(/[^0-9.-]/g, '');
        return parseFloat(val) || 0;
      };

      const year = getValue(columnMap.year);
      const dateReceived = getValue(columnMap.dateReceived);
      const rfpDate = parseDate(year, dateReceived);
      
      const avenirStatus = normalizeStatus(getValue(columnMap.avenirStatus));
      const tenderResult = normalizeStatus(getValue(columnMap.tenderResult));

      const tender = {
        refNo: getValue(columnMap.tenderNo),
        tenderType: getValue(columnMap.tenderType),
        client: getValue(columnMap.client),
        tenderName: getValue(columnMap.tenderName),
        rfpReceivedDate: rfpDate,
        lead: getValue(columnMap.lead),
        value: getNumericValue(columnMap.value),
        avenirStatus: avenirStatus,
        tenderResult: tenderResult,
        groupClassification: getValue(columnMap.groupClassification),  // ✅ NEW: Capture GDS/GES
        statuses: getUniqueStatuses(avenirStatus, tenderResult),
      };

      if (tender.refNo || tender.client || tender.tenderName) {
        tenders.push(tender);
      }
    }

    log(`\n✅ Parsed ${tenders.length} tenders (${emptyRowsSkipped} empty rows skipped)\n`, 'green');

    log('📌 FIRST 5 TENDERS:', 'bright');
    log('════════════════════════════════════════\n', 'cyan');

    tenders.slice(0, 5).forEach((t, idx) => {
      log(`[${idx + 1}] ${t.refNo}`, 'yellow');
      log(`    Client: ${t.client}`);
      log(`    Name: ${t.tenderName}`);
      log(`    Type: ${t.tenderType}`);
      log(`    Lead: ${t.lead}`);
      log(`    Group: ${t.groupClassification || 'N/A'}`);  // ✅ NEW: Show GDS/GES
      log(`    Value: $${parseFloat(t.value).toLocaleString()}`);
      log(`    AVENIR Status: ${t.avenirStatus}`);
      log(`    TENDER Result: ${t.tenderResult}`);
      log(`    Combined Statuses: ${t.statuses.join(' + ') || 'NONE'}`);
      log(`    RFP Date: ${t.rfpReceivedDate || 'N/A'}\n`);
    });

    const totalValue = tenders.reduce((sum, t) => sum + (parseFloat(t.value) || 0), 0);
    const avgValue = totalValue / tenders.length;

    const statusCounts = {};
    tenders.forEach(t => {
      t.statuses.forEach(status => {
        statusCounts[status] = (statusCounts[status] || 0) + 1;
      });
    });

    const groupCounts = {};  // ✅ NEW: Count by group classification
    tenders.forEach(t => {
      const group = t.groupClassification || 'UNASSIGNED';
      groupCounts[group] = (groupCounts[group] || 0) + 1;
    });

    const leadCounts = {};
    tenders.forEach(t => {
      const l = t.lead || 'UNASSIGNED';
      leadCounts[l] = (leadCounts[l] || 0) + 1;
    });

    const topLeads = Object.entries(leadCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10);

    log('📊 DATA STATISTICS:', 'bright');
    log('════════════════════════════════════════', 'cyan');
    log(`Total Tenders: ${tenders.length}`);
    log(`Total Value: $${totalValue.toLocaleString('en-US', { maximumFractionDigits: 2 })}`);
    log(`Average Value: $${avgValue.toLocaleString('en-US', { maximumFractionDigits: 2 })}\n`);

    log('Status Distribution:', 'yellow');
    Object.entries(statusCounts)
      .sort(([, a], [, b]) => b - a)
      .forEach(([status, count]) => {
        const percentage = ((count / tenders.length) * 100).toFixed(1);
        log(`  ${status}: ${count} (${percentage}%)`);
      });

    log('\nGroup Classification Distribution:', 'yellow');  // ✅ NEW: Show group distribution
    Object.entries(groupCounts)
      .sort(([, a], [, b]) => b - a)
      .forEach(([group, count]) => {
        const percentage = ((count / tenders.length) * 100).toFixed(1);
        log(`  ${group}: ${count} (${percentage}%)`);
      });

    log('\nTop 10 Leads:', 'yellow');
    topLeads.forEach(([lead, count]) => {
      log(`  ${lead}: ${count}`);
    });

    log('\n💾 DATA COLLECTION COMPLETE', 'bright');
    log('════════════════════════════════════════', 'cyan');
    log('✅ Data collection complete!', 'green');
    log('✅ Ready to sync ' + tenders.length + ' tenders to MongoDB', 'green');
    log('✅ All columns mapped successfully\n', 'green');

  } catch (error) {
    log('\n❌ ERROR: ' + error.message, 'red');
    process.exit(1);
  }
}

main();
