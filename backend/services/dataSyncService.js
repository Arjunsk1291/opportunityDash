import { getWorksheetRows } from './graphExcelService.js';
import { deriveOpportunityStatusFields } from './opportunityStatusService.js';

function normalizeStatus(status) {
  if (!status) return '';
  return status.toString().trim().toUpperCase();
}

function extractYear(yearValue) {
  const raw = String(yearValue || '').trim();
  const match = raw.match(/\b(19|20)\d{2}\b/);
  return match ? match[0] : '';
}

function normalizeDateText(value) {
  return String(value || '')
    .replace(/\u00A0/g, ' ')
    .replace(/[–—]/g, '-')
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseDate(year, dateValue) {
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

  const raw = normalizeDateText(dateValue);
  const resolvedYear = extractYear(year);

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

  const dayMonthTextWithYear = raw.match(/^(\d{1,2})[-/\s](\w+)[-/\s](\d{2,4})$/i);
  if (dayMonthTextWithYear) {
    const day = dayMonthTextWithYear[1];
    const monthKey = dayMonthTextWithYear[2].toLowerCase().substring(0, 3);
    const month = monthMap[monthKey];
    const yy = dayMonthTextWithYear[3].length === 2 ? `20${dayMonthTextWithYear[3]}` : dayMonthTextWithYear[3];
    if (month) return toIso(yy, month, day);
  }

  const monthDayTextWithYear = raw.match(/^(\w+)[-/\s](\d{1,2})[-/\s](\d{2,4})$/i);
  if (monthDayTextWithYear) {
    const monthKey = monthDayTextWithYear[1].toLowerCase().substring(0, 3);
    const month = monthMap[monthKey];
    const day = monthDayTextWithYear[2];
    const yy = monthDayTextWithYear[3].length === 2 ? `20${monthDayTextWithYear[3]}` : monthDayTextWithYear[3];
    if (month) return toIso(yy, month, day);
  }

  const dayMonthNumeric = raw.match(/^(\d{1,2})[-/](\d{1,2})$/);
  if (dayMonthNumeric && resolvedYear) {
    return toIso(resolvedYear, dayMonthNumeric[2], dayMonthNumeric[1]);
  }

  const dayMonthText = raw.match(/^(\d{1,2})[\s-](\w+)$/i);
  if (dayMonthText) {
    const day = dayMonthText[1];
    const monthKey = dayMonthText[2].toLowerCase().substring(0, 3);
    const month = monthMap[monthKey];
    if (month && resolvedYear) return toIso(resolvedYear, month, day);
  }

  const monthDayText = raw.match(/^(\w+)[\s-](\d{1,2})$/i);
  if (monthDayText) {
    const monthKey = monthDayText[1].toLowerCase().substring(0, 3);
    const month = monthMap[monthKey];
    const day = monthDayText[2];
    if (month && resolvedYear) return toIso(resolvedYear, month, day);
  }

  const parsed = (raw.match(/[a-z]/i) && resolvedYear) ? new Date(`${raw} ${resolvedYear}`) : null;
  if (parsed && !Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return null;
}

export function buildDateDisplay(year, dateValue, isoDate) {
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

  const rawDate = normalizeDateText(dateValue);
  const rawYear = extractYear(year);

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
  year: ['Year ', 'Year'],
  dateReceived: ['date tender recd', 'DATE RECEIVED', 'DATE TENDER RECD'],
  lead: ['Assigned Person'],
  value: ['Tender value', 'TENDER VALUE ', 'TENDER VALUE (AED)', 'VALUE', 'PROJECT VALUE', 'ESTIMATED VALUE', 'TENDER AMOUNT', 'AMOUNT'],
  avenirStatus: ['AVENIR STATUS'],
  tenderResult: ['TENDER RESULT'],
  groupClassification: ['GDS/GES', 'GROUP'],
  // Keep these tolerant: client sheets use many variants for this field.
  remarksReason: [
    'REMARKS/REASON',
    'REMARKS / REASON',
    'REMARKS & REASON',
    'REMARKS AND REASON',
    'REASON',
    'REASON FOR LOSS',
    'LOSS REASON',
    'REMARKS',
  ],
  comments: [
    'COMMENTS',
    'COMMENT',
    'REMARKS',
    'NOTES',
    'OBSERVATIONS',
  ],
  tenderStatusRemark: ['TENDER STATUS -', 'TENDER STATUS-', 'TENDER STATUS'],
  country: ['COUNTRY', 'REGION', 'LOCATION'],
  probability: ['PROBABILITY', 'WIN %', 'CHANCE'],
  submissionDeadline: ['SUBMISSION DEADLINE', 'DUE DATE', 'TENDER PLANNED SUBMISSION DATE', 'TENDER DUE DATE', 'TENDER DUE  DATE'],
  tenderSubmittedDate: ['TENDER SUBMITTED DATE', 'TENDER SUBMITTED', 'TENDER  SUBMITTED', 'SUBMITTED DATE', 'TENDER SUBMITTED  DATE'],
};

function normalizeHeader(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/[_-]+/g, ' ')
    .replace(/[()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function canonicalizeHeader(value) {
  return normalizeHeader(value).replace(/[^A-Z0-9]+/g, '');
}

function tokenizeHeader(value) {
  return normalizeHeader(value).split(' ').filter(Boolean);
}

function findColumn(headers, candidates, options = {}) {
  const normalizedCandidates = (candidates || []).map((candidate) => normalizeHeader(candidate)).filter(Boolean);
  const canonicalCandidates = normalizedCandidates.map((candidate) => canonicalizeHeader(candidate));
  if (!normalizedCandidates.length) return -1;

  const exactMatchIdx = headers.findIndex((header) => {
    const normalizedHeader = normalizeHeader(header);
    return normalizedCandidates.some((candidate) => normalizedHeader === candidate);
  });
  if (exactMatchIdx >= 0) return exactMatchIdx;
  if (options.exactOnly) return -1;

  const includesMatchIdx = headers.findIndex((header) => {
    const normalizedHeader = normalizeHeader(header);
    const canonicalHeader = canonicalizeHeader(header);
    return normalizedCandidates.some((candidate, index) => (
      normalizedHeader.includes(candidate)
      || candidate.includes(normalizedHeader)
      || canonicalHeader.includes(canonicalCandidates[index])
      || canonicalCandidates[index].includes(canonicalHeader)
    ));
  });
  if (includesMatchIdx >= 0) return includesMatchIdx;

  return headers.findIndex((header) => {
    const headerTokens = tokenizeHeader(header);
    if (!headerTokens.length) return false;

    return normalizedCandidates.some((candidate) => {
      const candidateTokens = tokenizeHeader(candidate);
      if (!candidateTokens.length) return false;
      const overlapCount = candidateTokens.filter((token) => headerTokens.includes(token)).length;
      const overlapRatio = overlapCount / candidateTokens.length;
      return overlapRatio >= 0.6;
    });
  });
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

function isMostlyNumericRow(row = []) {
  const filled = row
    .map((cell) => String(cell ?? '').trim())
    .filter(Boolean);
  if (!filled.length) return false;
  const numericLike = filled.filter((cell) => /^[-(]?\d[\d\s,./-]*\)?$/.test(cell)).length;
  return numericLike / filled.length >= 0.6;
}

function scoreHeaderRow(row = [], mapping = {}) {
  const headers = row.map((cell) => String(cell ?? '').trim());
  const nonEmptyCount = headers.filter(Boolean).length;
  if (!nonEmptyCount) return -1;

  let matchCount = 0;
  for (const candidates of Object.values(mapping)) {
    if (findColumn(headers, candidates) >= 0) matchCount += 1;
  }

  const textualCount = headers.filter((header) => {
    const value = normalizeHeader(header);
    return value && /[A-Z]/.test(value);
  }).length;

  const numericPenalty = isMostlyNumericRow(headers) ? 5 : 0;
  return (matchCount * 10) + textualCount - numericPenalty;
}

function chooseHeaderRowIndex(rows = [], preferredOffset = 0, mapping = {}) {
  const safePreferredOffset = Math.max(0, Math.min(Number(preferredOffset || 0), Math.max(rows.length - 1, 0)));
  const maxCandidates = Math.min(rows.length, 12);

  let bestIndex = safePreferredOffset;
  let bestScore = scoreHeaderRow(rows[safePreferredOffset] || [], mapping);

  for (let idx = 0; idx < maxCandidates; idx += 1) {
    const score = scoreHeaderRow(rows[idx] || [], mapping);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = idx;
    }
  }

  return bestIndex;
}

function validateResolvedColumns(headers = [], colIndices = {}) {
  const criticalKeys = ['tenderNo', 'tenderName', 'client', 'lead', 'value', 'avenirStatus', 'tenderResult', 'groupClassification'];
  const grouped = new Map();

  criticalKeys.forEach((key) => {
    const idx = colIndices[key];
    if (typeof idx !== 'number' || idx < 0) return;
    const list = grouped.get(idx) || [];
    list.push(key);
    grouped.set(idx, list);
  });

  const suspicious = Array.from(grouped.entries())
    .filter(([, keys]) => keys.length >= 4)
    .sort((a, b) => b[1].length - a[1].length)[0];

  if (!suspicious) return;

  const [columnIndex, keys] = suspicious;
  const header = headers[columnIndex] || `COLUMN_${columnIndex + 1}`;
  throw new Error(
    `Graph column mapping looks incorrect. ${keys.join(', ')} all resolved to the same column: ${header}. Check Header Row Offset, Data Range, and Custom Field Mapping.`
  );
}

const MONTH_INDEX = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};
const AWARD_KEYWORD_REGEX = /(award(?:ed)?|aw[ae]red)/i;

function parseYearToken(value, fallbackYear = '') {
  const raw = String(value || '').trim();
  if (!raw) return Number(fallbackYear) || null;
  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) return Number(fallbackYear) || null;
  if (numeric >= 1000) return numeric;
  if (numeric >= 0 && numeric < 100) return 2000 + numeric;
  return Number(fallbackYear) || null;
}

function parseMonthToken(value) {
  const raw = String(value || '').trim().toLowerCase().replace(/\.$/, '');
  if (!raw) return null;
  if (/^\d{1,2}$/.test(raw)) {
    const numeric = Number(raw);
    return numeric >= 1 && numeric <= 12 ? numeric : null;
  }
  return MONTH_INDEX[raw] || null;
}

function toIsoDate(year, month, day) {
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (
    dt.getUTCFullYear() !== year
    || dt.getUTCMonth() + 1 !== month
    || dt.getUTCDate() !== day
  ) return null;
  return dt.toISOString().slice(0, 10);
}

function findAwardedDateInText(text, fallbackYear = '') {
  const normalized = String(text || '')
    .replace(/\u00a0/g, ' ')
    .replace(/(\d{1,2})(st|nd|rd|th)\b/gi, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return null;

  const patterns = [
    /(?:award(?:ed)?|aw[ae]red)[^0-9a-z]{0,25}(?:on\s*)?(\d{1,2})[\/\-. ]+([a-z]{3,9}|\d{1,2})(?:[\/\-. ,]+(\d{2,4}))?/ig,
    /(\d{1,2})[\/\-. ]+([a-z]{3,9}|\d{1,2})(?:[\/\-. ,]+(\d{2,4}))?/ig,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(normalized)) !== null) {
      const day = Number(match[1]);
      const month = parseMonthToken(match[2]);
      const year = parseYearToken(match[3], fallbackYear);
      if (!Number.isFinite(day) || day < 1 || day > 31 || !month || !year) continue;
      const iso = toIsoDate(year, month, day);
      if (iso) return iso;
    }
  }

  return null;
}

function inferAwardedDateFromPartialText(text, fallbackYear = '') {
  const normalized = String(text || '')
    .replace(/\u00a0/g, ' ')
    .replace(/(\d{1,2})(st|nd|rd|th)\b/gi, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return null;

  const fullYear = parseYearToken(fallbackYear, '');

  // month + year (e.g., "awarded jan 2026", "awarded-sep-25")
  const monthYearPatterns = [
    /([a-z]{3,9})[\/\-. ,]+(\d{2,4})/ig,
    /(\d{2,4})[\/\-. ,]+([a-z]{3,9})/ig,
  ];
  for (const pattern of monthYearPatterns) {
    let match;
    while ((match = pattern.exec(normalized)) !== null) {
      const month = parseMonthToken(pattern === monthYearPatterns[0] ? match[1] : match[2]);
      const year = parseYearToken(pattern === monthYearPatterns[0] ? match[2] : match[1], fallbackYear);
      if (!month || !year) continue;
      const iso = toIsoDate(year, month, 1);
      if (iso) return iso;
    }
  }

  // month only (e.g., "awarded-oct") => day defaults to 1, year from sheet "Year"
  const monthOnlyMatch = normalized.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i);
  if (monthOnlyMatch && fullYear) {
    const month = parseMonthToken(monthOnlyMatch[1]);
    const iso = month ? toIsoDate(fullYear, month, 1) : null;
    if (iso) return iso;
  }

  // year only (e.g., "awarded 2026" or "awarded 26") => defaults to Jan 1
  const yearOnlyMatch = normalized.match(/\b(20\d{2}|\d{2})\b/);
  if (yearOnlyMatch) {
    const year = parseYearToken(yearOnlyMatch[1], fallbackYear);
    if (year) {
      const iso = toIsoDate(year, 1, 1);
      if (iso) return iso;
    }
  }

  // day only (e.g., "awarded on 24") => defaults to Jan + year fallback
  const dayOnlyMatch = normalized.match(/\b([0-2]?\d|3[01])\b/);
  if (dayOnlyMatch && fullYear) {
    const day = Number(dayOnlyMatch[1]);
    const iso = toIsoDate(fullYear, 1, day);
    if (iso) return iso;
  }

  return null;
}

function parseAwardedDateFromRemarks({ remarksReason = '', comments = '', tenderStatusRemark = '', year = '', status = '' }) {
  const text = [remarksReason, comments, tenderStatusRemark].map((v) => String(v || '').trim()).filter(Boolean).join(' | ');
  if (!text) return null;

  const isAwardedStatus = String(status || '').trim().toUpperCase() === 'AWARDED';
  const segments = text
    .split(/\r?\n|[|;]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const awardedSegments = segments.filter((segment) => AWARD_KEYWORD_REGEX.test(segment));

  for (const segment of awardedSegments) {
    const iso = findAwardedDateInText(segment, year);
    if (iso) return iso;
    const partialIso = inferAwardedDateFromPartialText(segment, year);
    if (partialIso) return partialIso;
  }

  if (isAwardedStatus) {
    for (const segment of segments) {
      const iso = findAwardedDateInText(segment, year);
      if (iso) return iso;
      const partialIso = inferAwardedDateFromPartialText(segment, year);
      if (partialIso) return partialIso;
    }
  }

  return null;
}

export async function syncTendersFromGraph(config) {
  if (!config?.driveId || !config?.fileId || !config?.worksheetName) {
    throw new Error('Graph sync config missing driveId/fileId/worksheetName');
  }

  const worksheetData = await getWorksheetRows({
    driveId: config.driveId,
    fileId: config.fileId,
    worksheetName: config.worksheetName,
    rangeAddress: config.dataRange || undefined,
    config,
  });
  const valueRows = Array.isArray(worksheetData?.values) ? worksheetData.values : [];
  const textRows = Array.isArray(worksheetData?.text) ? worksheetData.text : [];
  const totalRowCount = Math.max(valueRows.length, textRows.length);
  const rows = Array.from({ length: totalRowCount }, (_, rowIndex) => {
    const row = valueRows[rowIndex] || [];
    const textRow = textRows[rowIndex] || [];
    const maxLength = Math.max(row.length || 0, textRow.length || 0);
    return Array.from({ length: maxLength }, (_, colIndex) => {
      const textValue = textRow[colIndex];
      if (textValue !== null && textValue !== undefined && String(textValue).trim() !== '') {
        return textValue;
      }
      return row[colIndex] ?? '';
    });
  });

  if (!rows.length) {
    throw new Error('No data found in selected worksheet');
  }

  const headerRowOffset = Number(config.headerRowOffset || 0);
  if (headerRowOffset < 0 || headerRowOffset >= rows.length) {
    throw new Error(`Invalid headerRowOffset (${headerRowOffset}) for ${rows.length} rows`);
  }

  const mapping = resolveMapping(config.fieldMapping || {});
  const detectedHeaderRowOffset = chooseHeaderRowIndex(rows, headerRowOffset, mapping);
  const headers = (rows[detectedHeaderRowOffset] || []).map((h) => h?.toString().trim().toUpperCase() || '');

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
    tenderStatusRemark: findColumn(headers, mapping.tenderStatusRemark),
    country: findColumn(headers, mapping.country),
    probability: findColumn(headers, mapping.probability),
    submissionDeadline: findColumn(headers, mapping.submissionDeadline),
    tenderSubmittedDate: findColumn(headers, mapping.tenderSubmittedDate),
  };

  validateResolvedColumns(headers, colIndices);

  if (colIndices.value < 0) {
    const availableHeaders = headers.filter(Boolean).slice(0, 20).join(', ');
    throw new Error(`Required column not found: Tender value. Available headers: ${availableHeaders}`);
  }

  const tenders = [];

  for (let i = detectedHeaderRowOffset + 1; i < rows.length; i++) {
    const row = rows[i] || [];
    const rawRow = valueRows[i] || [];
    const textRow = textRows[i] || [];

    const hasContent = row.some((cell) => cell && cell.toString().trim() !== '');
    if (!hasContent) continue;

    const getCellValue = (sourceRow, colIdx) => {
      if (!Array.isArray(sourceRow) || colIdx < 0 || colIdx >= sourceRow.length) return '';
      return sourceRow[colIdx] ?? '';
    };

    const getRawValue = (colIdx) => {
      const textValue = getCellValue(textRow, colIdx);
      if (textValue !== null && textValue !== undefined && String(textValue).trim() !== '') {
        return textValue;
      }
      return getCellValue(rawRow, colIdx);
    };

    const getUnderlyingValue = (colIdx) => {
      return getCellValue(rawRow, colIdx);
    };

    const getValue = (colIdx) => {
      const value = getRawValue(colIdx);
      if (value === null || value === undefined) return '';
      return value.toString().trim();
    };

    const getNumericValue = (colIdx) => {
      const rawValue = getValue(colIdx);
      if (!rawValue) return null;

      const normalized = rawValue.replace(/,/g, '').trim();
      const accountingMatch = normalized.match(/^\((.*)\)$/);
      const candidate = accountingMatch ? `-${accountingMatch[1]}` : normalized;
      const numeric = Number(candidate.replace(/[^0-9.-]/g, ''));
      return Number.isFinite(numeric) ? numeric : null;
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
    const rfpReceivedDisplay = buildDateDisplay(year, dateReceived, rfpDate);
    const plannedSubmissionDisplay = buildDateDisplay(year, submissionDeadlineRaw, plannedSubmissionDate);
    const tenderSubmittedDisplay = buildDateDisplay(year, tenderSubmittedRaw, tenderSubmittedDate);

    const derivedStatuses = deriveOpportunityStatusFields({
      rawAvenirStatus: normalizeStatus(getValue(colIndices.avenirStatus)),
      rawTenderResult: normalizeStatus(getValue(colIndices.tenderResult)),
    });
    const remarksReason = getValue(colIndices.remarksReason);
    const comments = getValue(colIndices.comments);
    const tenderStatusRemark = getValue(colIndices.tenderStatusRemark);
    const awardedDate = parseAwardedDateFromRemarks({
      remarksReason,
      comments,
      tenderStatusRemark,
      year,
      status: derivedStatuses?.canonicalStage || '',
    });

    const tender = {
      opportunityRefNo: getValue(colIndices.tenderNo),
      tenderName: getValue(colIndices.tenderName),
      clientName: getValue(colIndices.client),
      opportunityClassification: getValue(colIndices.tenderType),
      internalLead: getValue(colIndices.lead),
      opportunityValue: getNumericValue(colIndices.value),
      probability: getNumericValue(colIndices.probability),
      country: getValue(colIndices.country),
      rawSheetYear: year,
      rawDateReceived: dateReceived,
      rawSubmissionDeadline: submissionDeadlineRaw,
      rawTenderSubmittedDate: tenderSubmittedRaw,
      dateTenderReceived: rfpDate || null,
      tenderPlannedSubmissionDate: plannedSubmissionDate || null,
      tenderSubmittedDate: tenderSubmittedDate || null,
      ...derivedStatuses,
      groupClassification: getValue(colIndices.groupClassification),
      remarksReason,
      comments,
      tenderStatusRemark,
      awardedDate: awardedDate || null,
      rawGraphData: {
        year,
        dateReceived,
        dateReceivedRawValue: getUnderlyingValue(colIndices.dateReceived),
        rfpReceivedDisplay,
        submissionDeadlineRaw,
        submissionDeadlineRawValue: getUnderlyingValue(colIndices.submissionDeadline),
        plannedSubmissionDisplay,
        tenderSubmittedRaw,
        tenderSubmittedRawValue: getUnderlyingValue(colIndices.tenderSubmittedDate),
        tenderSubmittedDisplay,
        rowSnapshot,
      },
      syncedAt: new Date(),
    };

    // Backward compatibility: many workbooks have a single remarks column.
    // If one of remarks/comments is blank, mirror the available value.
    if (!tender.remarksReason && tender.comments) {
      tender.remarksReason = tender.comments;
    } else if (!tender.comments && tender.remarksReason) {
      tender.comments = tender.remarksReason;
    }

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
