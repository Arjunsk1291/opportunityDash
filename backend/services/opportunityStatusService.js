function normalizeStatusValue(value) {
  return String(value || '').trim().toUpperCase();
}

export const CANONICAL_STATUS = {
  WORKING: 'WORKING',
  SUBMITTED: 'SUBMITTED',
  AWARDED: 'AWARDED',
  LOST: 'LOST',
  REGRETTED: 'REGRETTED',
  TO_START: 'TO START',
  ONGOING: 'ONGOING',
  HOLD_CLOSED: 'HOLD / CLOSED',
  UNKNOWN: 'UNKNOWN',
};

const STATUS_ALIASES = {
  'TOSTART': CANONICAL_STATUS.TO_START,
  'HOLD/CLOSED': CANONICAL_STATUS.HOLD_CLOSED,
  'HOLD - CLOSED': CANONICAL_STATUS.HOLD_CLOSED,
  'HOLD- CLOSED': CANONICAL_STATUS.HOLD_CLOSED,
  'HOLD -CLOSED': CANONICAL_STATUS.HOLD_CLOSED,
  HOLDCLOSED: CANONICAL_STATUS.HOLD_CLOSED,
};

function normalizeCanonicalStatus(value) {
  const normalized = normalizeStatusValue(value);
  if (!normalized) return '';
  return STATUS_ALIASES[normalized] || normalized;
}

function parseDateSafe(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isFutureDate(value, now = new Date()) {
  const parsed = parseDateSafe(value);
  if (!parsed) return false;
  return parsed.getTime() > now.getTime();
}

function looksPlannedText(value) {
  const text = String(value || '').trim().toUpperCase();
  if (!text) return false;
  return /\b(PLAN|PLANNED|FORECAST|EXPECTED|TENTATIVE|PIPELINE)\b/.test(text);
}

export function deriveOpportunityStatusFields({
  rawAvenirStatus = '',
  rawTenderResult = '',
  fallbackAvenirStatus = '',
  fallbackTenderResult = '',
  fallbackCanonicalStage = '',
  dateTenderReceived = '',
  tenderPlannedSubmissionDate = '',
  tenderSubmittedDate = '',
  awardedDate = '',
  remarksReason = '',
  comments = '',
  tenderStatusRemark = '',
} = {}) {
  const sourceAvenirStatus = normalizeCanonicalStatus(rawAvenirStatus || fallbackAvenirStatus || fallbackCanonicalStage);
  const sourceTenderResult = normalizeCanonicalStatus(rawTenderResult || fallbackTenderResult);

  if (sourceAvenirStatus === 'EOI') {
    return {
      rawAvenirStatus: sourceAvenirStatus,
      rawTenderResult: sourceTenderResult,
      avenirStatus: CANONICAL_STATUS.SUBMITTED,
      canonicalStage: CANONICAL_STATUS.SUBMITTED,
      tenderResult: CANONICAL_STATUS.UNKNOWN,
      combinedStatuses: [CANONICAL_STATUS.SUBMITTED, CANONICAL_STATUS.UNKNOWN],
    };
  }

  const effectiveAvenirStatus = sourceAvenirStatus;
  let effectiveTenderResult = sourceTenderResult;
  let effectiveCanonicalStage = effectiveAvenirStatus || normalizeCanonicalStatus(fallbackCanonicalStage);

  if (effectiveTenderResult === CANONICAL_STATUS.HOLD_CLOSED || effectiveAvenirStatus === CANONICAL_STATUS.HOLD_CLOSED) {
    effectiveCanonicalStage = CANONICAL_STATUS.HOLD_CLOSED;
  } else if (
    effectiveTenderResult === CANONICAL_STATUS.AWARDED
    || effectiveAvenirStatus === CANONICAL_STATUS.AWARDED
    || effectiveCanonicalStage === CANONICAL_STATUS.AWARDED
  ) {
    effectiveCanonicalStage = CANONICAL_STATUS.AWARDED;
  }

  const awardedCandidate = (
    effectiveCanonicalStage === CANONICAL_STATUS.AWARDED
    || effectiveTenderResult === CANONICAL_STATUS.AWARDED
  );
  const hasPlannedSignals = looksPlannedText(remarksReason)
    || looksPlannedText(comments)
    || looksPlannedText(tenderStatusRemark);
  const hasFutureSignals = isFutureDate(awardedDate)
    || isFutureDate(tenderSubmittedDate)
    || isFutureDate(tenderPlannedSubmissionDate)
    || isFutureDate(dateTenderReceived);

  if (awardedCandidate && (hasPlannedSignals || hasFutureSignals)) {
    effectiveCanonicalStage = tenderSubmittedDate
      ? CANONICAL_STATUS.SUBMITTED
      : CANONICAL_STATUS.WORKING;
    if (effectiveTenderResult === CANONICAL_STATUS.AWARDED) {
      effectiveTenderResult = CANONICAL_STATUS.UNKNOWN;
    }
  }

  return {
    rawAvenirStatus: sourceAvenirStatus,
    rawTenderResult: sourceTenderResult,
    avenirStatus: effectiveAvenirStatus,
    canonicalStage: effectiveCanonicalStage,
    tenderResult: effectiveTenderResult,
    combinedStatuses: [effectiveAvenirStatus, effectiveTenderResult].filter(Boolean),
  };
}

export function applyOpportunityStatusFields(opportunity = {}) {
  return {
    ...opportunity,
    ...deriveOpportunityStatusFields({
      rawAvenirStatus: opportunity.rawAvenirStatus,
      rawTenderResult: opportunity.rawTenderResult,
      fallbackAvenirStatus: opportunity.avenirStatus,
      fallbackTenderResult: opportunity.tenderResult,
      fallbackCanonicalStage: opportunity.canonicalStage,
      dateTenderReceived: opportunity.dateTenderReceived,
      tenderPlannedSubmissionDate: opportunity.tenderPlannedSubmissionDate,
      tenderSubmittedDate: opportunity.tenderSubmittedDate,
      awardedDate: opportunity.awardedDate,
      remarksReason: opportunity.remarksReason,
      comments: opportunity.comments,
      tenderStatusRemark: opportunity.tenderStatusRemark,
    }),
  };
}

export function getEffectiveMergedStatus(item = {}) {
  const tenderResult = normalizeCanonicalStatus(item?.tenderResult);
  if (tenderResult && tenderResult !== CANONICAL_STATUS.UNKNOWN) return tenderResult;
  return normalizeCanonicalStatus(item?.avenirStatus || item?.canonicalStage || item?.status);
}
