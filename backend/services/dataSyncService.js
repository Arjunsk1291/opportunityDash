import { getWorksheetRows } from './graphExcelService.js';

function normalizeStatus(status) {
  if (!status) return '';
  return status.toString().trim().toUpperCase();
}

function parseDate(year, dateValue) {
  if (dateValue === null || dateValue === undefined || String(dateValue).trim() === '' || String(dateValue).trim() === '-') {
    return null;
  }

  if (dateValue instanceof Date && !Number.isNaN(dateValue.getTime())) {
    return dateValue.toISOString().slice(0, 10);
  }

  if (typeof dateValue === 'object' && dateValue !== null && typeof dateValue.toISOString === 'function') {
    try {
      return dateValue.toISOString().slice(0, 10);
    } catch {
      // continue with string parsing fallback
    }
  }

  const raw = String(dateValue).trim();
  const normalizedYear = String(year || '').trim();
  const fallbackYear = normalizedYear || String(new Date().getFullYear());

  const monthMap = {
    jan: '01', feb: '02', mar: '03', apr: '04',
    may: '05', jun: '06', jul: '07', aug: '08',
    sep: '09', oct: '10', nov: '11', dec: '12',
  };

  const toIso = (y, m, d) => {
    if (!y || !m || !d) return null;
    const yearNum = Number(y);
    const monthNum = Number(m);
    const dayNum = Number(d);
    if (!Number.isInteger(yearNum) || !Number.isInteger(monthNum) || !Number.isInteger(dayNum)) return null;
    if (monthNum < 1 || monthNum > 12 || dayNum < 1 || dayNum > 31) return null;
    return `${String(yearNum).padStart(4, '0')}-${String(monthNum).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
  };

  const numericValue = Number(raw);
  if (!Number.isNaN(numericValue) && numericValue > 40000 && numericValue < 60000) {
    const excelEpoch = new Date(1899, 11, 30);
    const excelDate = new Date(excelEpoch.getTime() + numericValue * 24 * 60 * 60 * 1000);
    if (!Number.isNaN(excelDate.getTime())) {
      return excelDate.toISOString().slice(0, 10);
    }
  }

  const fullDate = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (fullDate) {
    return toIso(fullDate[1], fullDate[2], fullDate[3]);
  }

  const withYearLast = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (withYearLast) {
    const yy = withYearLast[3].length === 2 ? `20${withYearLast[3]}` : withYearLast[3];
    return toIso(yy, withYearLast[2], withYearLast[1]);
  }

  const dayMonthNumeric = raw.match(/^(\d{1,2})[-/](\d{1,2})$/);
  if (dayMonthNumeric) {
    return toIso(fallbackYear, dayMonthNumeric[2], dayMonthNumeric[1]);
  }

  const dayMonthText = raw.match(/^(\d{1,2})[\s-](\w+)$/i);
  if (dayMonthText) {
    const day = dayMonthText[1];
    const monthKey = dayMonthText[2].toLowerCase().substring(0, 3);
    const month = monthMap[monthKey];
    if (month) return toIso(fallbackYear, month, day);
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return null;
}

function buildRfpReceivedDisplay(year, dateValue, isoDate) {
  if (isoDate) return isoDate;

  if (dateValue instanceof Date && !Number.isNaN(dateValue.getTime())) {
    return dateValue.toISOString().slice(0, 10);
  }

  if (typeof dateValue === 'object' && dateValue !== null && typeof dateValue.toISOString === 'function') {
    try {
      return dateValue.toISOString().slice(0, 10);
    } catch {
      // continue with fallback formatting
    }
  }

  const rawDate = String(dateValue || '').trim();
  const rawYear = String(year || '').trim();

  if (rawDate && rawDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
    return rawDate;
  }

  if (rawDate && rawYear && rawDate !== rawYear) return `${rawDate} ${rawYear}`;
  return rawDate || rawYear || '';
}


const DEFAULT_MAPPING = {
  tenderNo: ['Tender no', 'REF NO'],
  tenderType: ['Tender Type ', 'Type'],
  client: ['Client'],
  tenderName: ['Tender name', 'DESCRIPTION'],
  year: ['Year '],
  dateReceived: ['date tender recd', 'DATE RECEIVED'],
  lead: ['Assigned Person'],
  value: [' Tender value ', 'Tender value', 'TENDER VALUE', 'VALUE'],
  avenirStatus: ['AVENIR STATUS'],
  tenderResult: ['TENDER RESULT'],
  groupClassification: ['GDS/GES', 'GROUP'],
  remarksReason: ['REMARKS/REASON'],
  comments: ['REMARKS'],
  country: ['COUNTRY', 'REGION', 'LOCATION'],
  probability: ['PROBABILITY', 'WIN %', 'CHANCE'],
  submissionDeadline: ['SUBMISSION DEADLINE', 'DUE DATE', 'TENDER PLANNED SUBMISSION DATE'],
  tenderSubmittedDate: ['TENDER SUBMITTED DATE', 'TENDER SUBMITTED', 'SUBMITTED DATE'],
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
    rangeAddress: config.dataRange || 'B4:Z2000',
    config,
  });

  if (!rows.length) {
    throw new Error('No data found in selected worksheet');
  }

  const headerRowOffset = Number(config.headerRowOffset || 0);
  if (headerRowOffset < 0 || headerRowOffset >= rows.length) {
    throw new Error(`Invalid headerRowOffset (${headerRowOffset}) for ${rows.length} rows`);
  }

  const headers = (rows[headerRowOffset] || []).map((h) => h?.toString().trim().toUpperCase() || '');
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
    remarksReason: findColumn(headers, mapping.remarksReason),
    comments: findColumn(headers, mapping.comments),
    country: findColumn(headers, mapping.country),
    probability: findColumn(headers, mapping.probability),
    submissionDeadline: findColumn(headers, mapping.submissionDeadline),
    tenderSubmittedDate: findColumn(headers, mapping.tenderSubmittedDate),
  };

  const tenders = [];

  for (let i = headerRowOffset + 1; i < rows.length; i++) {
    const row = rows[i] || [];

    const hasContent = row.some((cell) => cell && cell.toString().trim() !== '');
    if (!hasContent) continue;

    const getRawValue = (colIdx) => {
      if (colIdx < 0 || colIdx >= row.length) return '';
      return row[colIdx] ?? '';
    };

    const getValue = (colIdx) => {
      const value = getRawValue(colIdx);
      if (value === null || value === undefined) return '';
      return value.toString().trim();
    };

    const getNumericValue = (colIdx) => {
      const val = getValue(colIdx).replace(/[^0-9.-]/g, '');
      return parseFloat(val) || 0;
    };

    const rowSnapshot = {};
    headers.forEach((header, idx) => {
      const key = header || `COLUMN_${idx + 1}`;
      rowSnapshot[key] = row[idx] ?? '';
    });

    const year = getValue(colIndices.year);
    const dateReceived = getRawValue(colIndices.dateReceived);
    const submissionDeadlineRaw = getRawValue(colIndices.submissionDeadline);
    const tenderSubmittedRaw = getRawValue(colIndices.tenderSubmittedDate);
    const rfpDate = parseDate(year, dateReceived);
    const plannedSubmissionDate = parseDate(year, submissionDeadlineRaw);
    const tenderSubmittedDate = parseDate(year, tenderSubmittedRaw);
    const rfpReceivedDisplay = buildRfpReceivedDisplay(year, dateReceived, rfpDate);

    const tender = {
      opportunityRefNo: getValue(colIndices.tenderNo),
      tenderName: getValue(colIndices.tenderName),
      clientName: getValue(colIndices.client),
      opportunityClassification: getValue(colIndices.tenderType),
      internalLead: getValue(colIndices.lead),
      opportunityValue: getNumericValue(colIndices.value),
      probability: getNumericValue(colIndices.probability),
      country: getValue(colIndices.country),
      canonicalStage: normalizeStatus(getValue(colIndices.avenirStatus)),
      dateTenderReceived: rfpDate || null,
      tenderPlannedSubmissionDate: plannedSubmissionDate || null,
      tenderSubmittedDate: tenderSubmittedDate || null,
      avenirStatus: normalizeStatus(getValue(colIndices.avenirStatus)),
      tenderResult: normalizeStatus(getValue(colIndices.tenderResult)),
      groupClassification: getValue(colIndices.groupClassification),
      remarksReason: getValue(colIndices.remarksReason),
      comments: getValue(colIndices.comments),
      rawGraphData: {
        year,
        dateReceived,
        rfpReceivedDisplay,
        submissionDeadlineRaw,
        tenderSubmittedRaw,
        rowSnapshot,
      },
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
    tenderPlannedSubmissionDate: tender.tenderPlannedSubmissionDate || null,
    rawGraphData: { ...(tender.rawGraphData || {}), synced: new Date().toISOString() },
  }));
}
