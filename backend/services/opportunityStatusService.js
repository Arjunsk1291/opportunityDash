function normalizeStatusValue(value) {
  return String(value || '').trim().toUpperCase();
}

export function deriveOpportunityStatusFields({
  rawAvenirStatus = '',
  rawTenderResult = '',
  fallbackAvenirStatus = '',
  fallbackTenderResult = '',
  fallbackCanonicalStage = '',
} = {}) {
  const sourceAvenirStatus = normalizeStatusValue(rawAvenirStatus || fallbackAvenirStatus || fallbackCanonicalStage);
  const sourceTenderResult = normalizeStatusValue(rawTenderResult || fallbackTenderResult);

  if (sourceAvenirStatus === 'EOI') {
    return {
      rawAvenirStatus: sourceAvenirStatus,
      rawTenderResult: sourceTenderResult,
      avenirStatus: 'SUBMITTED',
      canonicalStage: 'SUBMITTED',
      tenderResult: 'UNKNOWN',
      combinedStatuses: ['SUBMITTED', 'UNKNOWN'],
    };
  }

  const effectiveAvenirStatus = sourceAvenirStatus;
  const effectiveTenderResult = sourceTenderResult;
  const effectiveCanonicalStage = effectiveAvenirStatus || normalizeStatusValue(fallbackCanonicalStage);

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
    }),
  };
}

export function getEffectiveMergedStatus(item = {}) {
  const tenderResult = normalizeStatusValue(item?.tenderResult);
  if (tenderResult && tenderResult !== 'UNKNOWN') return tenderResult;
  return normalizeStatusValue(item?.avenirStatus || item?.canonicalStage || item?.status);
}
