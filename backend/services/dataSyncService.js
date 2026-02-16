import { getWorksheetRows } from './graphExcelService.js';

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

const DEFAULT_MAPPING = {
  tenderNo: ['TENDER NO', 'REF NO'],
  tenderType: ['TENDER TYPE'],
  client: ['CLIENT'],
  tenderName: ['TENDER NAME', 'DESCRIPTION'],
  year: ['YEAR'],
  dateReceived: ['DATE TENDER RECD', 'DATE RECEIVED'],
  lead: ['ASSIGNED PERSON'],
  value: ['TENDER VALUE'],
  avenirStatus: ['AVENIR STATUS'],
  tenderResult: ['TENDER RESULT'],
  groupClassification: ['GDS/GES', 'GROUP'],
};

function findColumn(headers, candidates) {
  return headers.findIndex((h) => candidates.some((candidate) => h.includes(candidate.toUpperCase())));
}

function resolveMapping(fieldMapping = {}) {
  const normalized = {};
  for (const [key, value] of Object.entries({ ...DEFAULT_MAPPING, ...fieldMapping })) {
    if (Array.isArray(value)) {
      normalized[key] = value.map((v) => String(v).toUpperCase());
    } else if (typeof value === 'string' && value.trim()) {
      normalized[key] = [value.trim().toUpperCase()];
    } else {
      normalized[key] = DEFAULT_MAPPING[key] || [];
    }
  }
  return normalized;
}

export async function syncTendersFromGraph(config) {
  if (!config?.driveId || !config?.fileId || !config?.worksheetName) {
    throw new Error('Graph sync config missing driveId/fileId/worksheetName');
  }

  const rows = await getWorksheetRows({
    driveId: config.driveId,
    fileId: config.fileId,
    worksheetName: config.worksheetName,
  });

  if (!rows.length) {
    throw new Error('No data found in selected worksheet');
  }

  const headers = rows[0].map((h) => h?.toString().trim().toUpperCase() || '');
  const mapping = resolveMapping(config.fieldMapping || {});

  const colIndices = {
    tenderNo: findColumn(headers, mapping.tenderNo),
    tenderType: findColumn(headers, mapping.tenderType),
    client: findColumn(headers, mapping.client),
    tenderName: findColumn(headers, mapping.tenderName),
    year: findColumn(headers, mapping.year),
    dateReceived: findColumn(headers, mapping.dateReceived),
    lead: findColumn(headers, mapping.lead),
    value: findColumn(headers, mapping.value),
    avenirStatus: findColumn(headers, mapping.avenirStatus),
    tenderResult: findColumn(headers, mapping.tenderResult),
    groupClassification: findColumn(headers, mapping.groupClassification),
  };

  const tenders = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] || [];

    const hasContent = row.some((cell) => cell && cell.toString().trim() !== '');
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
      groupClassification: getValue(colIndices.groupClassification),
      syncedAt: new Date(),
    };

    if (tender.opportunityRefNo || tender.clientName || tender.tenderName) {
      tenders.push(tender);
    }
  }

  return tenders;
}

export async function transformTendersToOpportunities(tenders) {
  return tenders.map((tender) => ({
    ...tender,
    graphRowId: `graph-${tender.opportunityRefNo}`,
    qualificationStatus: 'Pending',
    tenderPlannedSubmissionDate: null,
    rawGraphData: { synced: new Date().toISOString() },
  }));
}
