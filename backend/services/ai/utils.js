export const normalizeText = (value) => String(value || '').trim();
export const normalizeTextLower = (value) => normalizeText(value).toLowerCase();
export const normalizeRefNo = (value) => normalizeText(value).toUpperCase();
export const getBaseRefNo = (value) => normalizeRefNo(value).replace(/_EOI$/i, '');
export const isEoiRefNo = (value) => /_EOI$/i.test(normalizeRefNo(value));

export const getDisplayStatus = (row = {}) => {
  const tenderResult = normalizeRefNo(row?.tenderResult);
  if (tenderResult && tenderResult !== 'UNKNOWN') return tenderResult;
  return normalizeRefNo(row?.avenirStatus || row?.canonicalStage || '');
};

export const cosineSimilarity = (left = [], right = []) => {
  if (!left.length || !right.length || left.length !== right.length) return 0;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    const a = Number(left[index] || 0);
    const b = Number(right[index] || 0);
    dot += a * b;
    leftNorm += a * a;
    rightNorm += b * b;
  }
  if (!leftNorm || !rightNorm) return 0;
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
};

export const toPercent = (value) => Math.round(Math.max(0, Math.min(1, value)) * 100);

export const parseTimestamp = (value) => {
  const raw = normalizeText(value);
  if (!raw) return 0;
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? 0 : parsed;
};

export const groupBy = (rows, keyFn) => rows.reduce((acc, row, index) => {
  const key = keyFn(row, index);
  const current = acc.get(key) || [];
  current.push(row);
  acc.set(key, current);
  return acc;
}, new Map());

export const buildBusinessKey = (row, fallbackIndex = 0) => {
  const ref = getBaseRefNo(row?.opportunityRefNo);
  const tenderName = normalizeTextLower(row?.tenderName);
  if (ref && tenderName) return `${ref}::${tenderName}`;
  if (ref) return ref;
  if (tenderName) return tenderName;
  return `untitled-${fallbackIndex}`;
};

export const isTenderRecord = (row = {}) => normalizeRefNo(row?.opportunityClassification) === 'TENDER';
export const isEoiRecord = (row = {}) => normalizeRefNo(row?.opportunityClassification) === 'EOI' || isEoiRefNo(row?.opportunityRefNo);
