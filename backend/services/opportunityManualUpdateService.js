export const MANUAL_UPDATE_FIELD_KEYS = [
  'adnocRftNo',
  'tenderName',
  'opportunityClassification',
  'clientName',
  'groupClassification',
  'internalLead',
  'opportunityValue',
  'avenirStatus',
  'dateTenderReceived',
  'tenderPlannedSubmissionDate',
];

export const MANUAL_UPDATE_COLUMN_ALIASES = {
  opportunityRefNo: ['AVENIR REF', 'REF NO', 'REF', 'TENDER NO'],
  adnocRftNo: ['CLIENT REF', 'ADNOC REF', 'ADNOC RFT NO', 'ADNOC RFT NO.'],
  tenderName: ['TENDER NAME'],
  opportunityClassification: ['TENDER TYPE', 'OPPORTUNITY CLASSIFICATION'],
  clientName: ['CLIENT'],
  groupClassification: ['GROUP'],
  internalLead: ['LEAD', 'INTERNAL LEAD'],
  opportunityValue: ['VALUE (AED)', 'VALUE', 'VALUE AED'],
  avenirStatus: ['STATUS', 'AVENIR STATUS'],
  dateTenderReceived: ['RFP RECEIVED', 'DATE TENDER RECD', 'DATE RECEIVED'],
  tenderPlannedSubmissionDate: ['SUBMISSION', 'SUBMISSION DATE'],
};

const normalizeText = (value) => String(value ?? '').trim();
export const normalizeRefKey = (value) => normalizeText(value).replace(/\s+/g, ' ').toUpperCase();
const normalizeComparisonText = (value) => normalizeText(value).replace(/\s+/g, ' ').toLowerCase();

const normalizeTenderType = (value) => {
  const raw = normalizeText(value);
  if (!raw) return '';
  const upper = raw.toUpperCase();
  if (upper === 'EOI') return 'EOI';
  if (upper === 'TENDER') return 'Tender';
  return raw;
};

const parseNumericValue = (value) => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const cleaned = String(value).replace(/[^0-9.-]+/g, '').trim();
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
};

const excelSerialToIsoDate = (serial) => {
  if (!Number.isFinite(serial)) return '';
  const wholeDays = Math.floor(serial);
  const utcDays = wholeDays - 25569;
  const utcValue = utcDays * 86400;
  const dateInfo = new Date(utcValue * 1000);
  if (Number.isNaN(dateInfo.getTime())) return '';
  return dateInfo.toISOString().slice(0, 10);
};

const parseDateValue = (value) => {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'number') {
    if (value > 20000 && value < 80000) return excelSerialToIsoDate(value);
    return '';
  }
  const raw = normalizeText(value);
  if (!raw) return '';
  if (/^\d{4}$/.test(raw)) return raw;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = Date.parse(raw);
  if (Number.isNaN(parsed)) return '';
  return new Date(parsed).toISOString().slice(0, 10);
};

const normalizeFieldValue = (fieldKey, value) => {
  switch (fieldKey) {
    case 'opportunityValue':
      return parseNumericValue(value);
    case 'dateTenderReceived':
    case 'tenderPlannedSubmissionDate':
      return parseDateValue(value);
    case 'opportunityClassification':
      return normalizeTenderType(value);
    default:
      return normalizeText(value);
  }
};

const hasValue = (fieldKey, value) => {
  if (fieldKey === 'opportunityValue') return value !== null && value !== undefined;
  return normalizeText(value) !== '';
};

const valuesMatch = (fieldKey, left, right) => {
  if (!hasValue(fieldKey, left) && !hasValue(fieldKey, right)) return true;
  if (fieldKey === 'opportunityValue') return Number(left) === Number(right);
  return normalizeComparisonText(left) === normalizeComparisonText(right);
};

export const parseManualUpdateRows = (rows = []) => {
  const mergedByRef = new Map();

  rows.forEach((row) => {
    if (!row || typeof row !== 'object') return;
    const entries = Object.entries(row);
    const getFieldValue = (fieldKey) => {
      const aliases = MANUAL_UPDATE_COLUMN_ALIASES[fieldKey] || [];
      for (const alias of aliases) {
        const match = entries.find(([key]) => normalizeComparisonText(key) === normalizeComparisonText(alias));
        if (match) return match[1];
      }
      return '';
    };

    const refValue = getFieldValue('opportunityRefNo');
    const refKey = normalizeRefKey(refValue);
    if (!refKey) return;

    const current = mergedByRef.get(refKey) || { opportunityRefNo: normalizeText(refValue), refKey };
    for (const fieldKey of MANUAL_UPDATE_FIELD_KEYS) {
      const normalizedValue = normalizeFieldValue(fieldKey, getFieldValue(fieldKey));
      if (hasValue(fieldKey, normalizedValue)) current[fieldKey] = normalizedValue;
    }
    mergedByRef.set(refKey, current);
  });

  return Array.from(mergedByRef.values());
};

export const applyManualOverridesToOpportunity = (opportunity, manualSnapshot) => {
  if (!manualSnapshot) return { opportunity, staleFields: [] };

  const nextOpportunity = { ...opportunity };
  const staleFields = [];

  for (const fieldKey of MANUAL_UPDATE_FIELD_KEYS) {
    const syncedValue = normalizeFieldValue(fieldKey, opportunity?.[fieldKey]);
    const manualValue = normalizeFieldValue(fieldKey, manualSnapshot?.[fieldKey]);

    if (!hasValue(fieldKey, manualValue)) continue;

    if (hasValue(fieldKey, syncedValue)) {
      if (!valuesMatch(fieldKey, syncedValue, manualValue)) staleFields.push(fieldKey);
      continue;
    }

    nextOpportunity[fieldKey] = manualValue;
  }

  return { opportunity: nextOpportunity, staleFields };
};

export const buildManualUpdatePatch = (manualRow, existingOpportunity = null) => {
  const patch = {
    opportunityRefNo: manualRow.opportunityRefNo,
    refKey: manualRow.refKey,
  };

  for (const fieldKey of MANUAL_UPDATE_FIELD_KEYS) {
    const normalizedValue = normalizeFieldValue(fieldKey, manualRow[fieldKey]);
    if (!hasValue(fieldKey, normalizedValue)) continue;

    const existingValue = normalizeFieldValue(fieldKey, existingOpportunity?.[fieldKey]);
    if (!hasValue(fieldKey, existingValue) || !valuesMatch(fieldKey, existingValue, normalizedValue)) {
      patch[fieldKey] = normalizedValue;
    }
  }

  return patch;
};

export const buildManualOpportunityPatch = (manualRow, existingOpportunity = null, previousManualSnapshot = null) => {
  const patch = {};

  for (const fieldKey of MANUAL_UPDATE_FIELD_KEYS) {
    const manualValue = normalizeFieldValue(fieldKey, manualRow?.[fieldKey]);
    if (!hasValue(fieldKey, manualValue)) continue;

    const existingValue = normalizeFieldValue(fieldKey, existingOpportunity?.[fieldKey]);
    const previousManualValue = normalizeFieldValue(fieldKey, previousManualSnapshot?.[fieldKey]);

    if (!hasValue(fieldKey, existingValue)) {
      patch[fieldKey] = manualValue;
      continue;
    }

    if (hasValue(fieldKey, previousManualValue) && valuesMatch(fieldKey, existingValue, previousManualValue)) {
      patch[fieldKey] = manualValue;
    }
  }

  return patch;
};

export const getManualTemplateColumns = () => [
  { key: 'opportunityRefNo', label: 'Avenir Ref', required: true },
  { key: 'tenderName', label: 'Tender Name', required: true },
  { key: 'opportunityClassification', label: 'Tender Type', required: true },
  { key: 'clientName', label: 'Client', required: true },
  { key: 'groupClassification', label: 'Group', required: true },
  { key: 'dateTenderReceived', label: 'RFP Received', required: true },
  { key: 'tenderPlannedSubmissionDate', label: 'Submission', required: true },
  { key: 'internalLead', label: 'Lead', required: true },
  { key: 'opportunityValue', label: 'Value (AED)', required: true },
  { key: 'avenirStatus', label: 'Status', required: true },
  { key: 'adnocRftNo', label: 'CLIENT Ref', required: false },
];
