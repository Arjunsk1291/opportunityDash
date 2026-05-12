import SyncedOpportunity from '../models/SyncedOpportunity.js';

const normalizeHeader = (value) => String(value ?? '').trim().toUpperCase().replace(/\s+/g, ' ');

// Keep aligned with the existing Opportunities "Spreadsheet" view headers.
// Do not interpret/transform mapping logic here: just render current DB values + raw snapshots.
const MASTER_HEADERS = [
  'Sr.no',
  'Year',
  'Tender no',
  'Tender name',
  'Client',
  'END USER',
  'ADNOC RFT NO',
  'Tender Location (Execution)',
  'GDS/GES',
  'Assigned Person',
  'Stage of project, Concept, FEED, DE',
  'Tender Type',
  'date tender recd',
  'Tender Due  date',
  'Tender  Submitted  date',
  'AVENIR STATUS',
  'REMARKS/REASON',
  'TENDER RESULT',
  'TENDER STATUS -',
  'Currency, USD/AED',
  'GM%',
  'Tender value',
  'Sub-contract value',
  'GM Value',
  'Go%',
  'Get %',
  'GO/Get %',
  'go/get value',
  'USD to AED',
  'who was awarded the project',
  'final awarded price',
];

function snapshotLookup(rawGraphData, headerLabel) {
  const snapshot = rawGraphData?.rowSnapshot;
  if (!snapshot || typeof snapshot !== 'object') return '';
  const target = normalizeHeader(headerLabel);
  for (const [key, rawValue] of Object.entries(snapshot)) {
    if (normalizeHeader(key) !== target) continue;
    return rawValue === null || rawValue === undefined ? '' : String(rawValue).trim();
  }
  return '';
}

function cellText(value) {
  if (value === null || value === undefined) return '';
  return String(value);
}

function buildMasterRow(opportunity, indexFromTop) {
  const row = [];
  for (const header of MASTER_HEADERS) {
    const h = normalizeHeader(header);
    switch (h) {
      case 'SR.NO':
        row.push(cellText(indexFromTop + 1));
        break;
      case 'YEAR':
        row.push(cellText(opportunity?.rawSheetYear || opportunity?.rawGraphData?.year || ''));
        break;
      case 'TENDER NO':
      case 'REF NO':
        row.push(cellText(opportunity?.tenderNo || opportunity?.opportunityRefNo || ''));
        break;
      case 'TENDER NAME':
        row.push(cellText(opportunity?.tenderName || ''));
        break;
      case 'CLIENT':
        row.push(cellText(opportunity?.clientName || ''));
        break;
      case 'GDS/GES':
        row.push(cellText(opportunity?.groupClassification || ''));
        break;
      case 'ASSIGNED PERSON':
        row.push(cellText(opportunity?.internalLead || ''));
        break;
      case 'TENDER TYPE':
        row.push(cellText(opportunity?.opportunityClassification || ''));
        break;
      case 'DATE TENDER RECD':
        row.push(cellText(opportunity?.dateTenderReceived || opportunity?.rawGraphData?.rfpReceivedDisplay || ''));
        break;
      case 'TENDER DUE DATE':
      case 'TENDER DUE  DATE':
        row.push(cellText(opportunity?.tenderPlannedSubmissionDate || opportunity?.rawGraphData?.plannedSubmissionDisplay || ''));
        break;
      case 'TENDER SUBMITTED DATE':
      case 'TENDER  SUBMITTED  DATE':
        row.push(cellText(opportunity?.tenderSubmittedDate || opportunity?.rawGraphData?.tenderSubmittedDisplay || ''));
        break;
      case 'AVENIR STATUS':
        row.push(cellText(opportunity?.avenirStatus || opportunity?.rawAvenirStatus || ''));
        break;
      case 'REMARKS/REASON':
        row.push(cellText(opportunity?.remarksReason || ''));
        break;
      case 'TENDER RESULT':
        row.push(cellText(opportunity?.tenderResult || opportunity?.rawTenderResult || ''));
        break;
      case 'TENDER STATUS -':
      case 'TENDER STATUS-':
      case 'TENDER STATUS':
        row.push(cellText(opportunity?.tenderStatusRemark || ''));
        break;
      case 'ADNOC RFT NO':
        row.push(cellText(opportunity?.adnocRftNo || ''));
        break;
      case 'TENDER VALUE':
        row.push(opportunity?.opportunityValue === null || opportunity?.opportunityValue === undefined ? '' : String(opportunity.opportunityValue));
        break;
      default:
        row.push(snapshotLookup(opportunity?.rawGraphData, header));
        break;
    }
  }
  return row;
}

function defaultColumnWidthsPx() {
  const widths = {};
  // Conservative defaults; frontend can refine and persist.
  MASTER_HEADERS.forEach((header, idx) => {
    const h = normalizeHeader(header);
    let px = 120;
    if (h === 'SR.NO') px = 72;
    if (h === 'YEAR') px = 80;
    if (h === 'TENDER NO') px = 140;
    if (h === 'TENDER NAME') px = 320;
    if (h === 'CLIENT') px = 220;
    if (h === 'ADNOC RFT NO') px = 160;
    if (h === 'REMARKS/REASON') px = 340;
    widths[String(idx)] = px;
  });
  return widths;
}

export async function buildOpportunitiesWorkbookForSpreadsheet() {
  const opportunities = await SyncedOpportunity.find().sort({ createdAt: -1 }).lean();

  // Sheet shape matches the "MASTER" requirements: 4 frozen rows.
  const sheetName = 'MASTER TENDER LIST AVENIR';
  const rows = [];
  // Row 1: blank
  rows.push([]);
  // Row 2: banner (merged L2:V2 in the real XLSX; frontend handles merges)
  rows.push(['', '', '', '', '', '', '', '', '', '', '', 'Tender Information']);
  // Row 3: blank spacer
  rows.push([]);
  // Row 4: headers
  rows.push(MASTER_HEADERS.slice());
  // Data rows
  opportunities.forEach((opp, idx) => rows.push(buildMasterRow(opp, idx)));

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    workbook: {
      name: 'AVENIR Master Tender List (OpportunityDash)',
      sheets: [
        {
          id: 'master',
          name: sheetName,
          rowCount: rows.length,
          colCount: MASTER_HEADERS.length,
          freezeRows: 4,
          columnWidthsPx: defaultColumnWidthsPx(),
          rowHeightsPx: { '3': 80 }, // header band row (0-based index 3)
          merges: [
            { start: 'L2', end: 'V2' },
          ],
          cells: rows,
        },
      ],
    },
  };
}

