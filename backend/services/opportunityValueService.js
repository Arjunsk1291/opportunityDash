export const toFiniteNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const getEffectiveOpportunityValue = (item = {}) => {
  const legacyBase = toFiniteNumber(item?.opportunityValue) || 0;
  const frameworkTotal = toFiniteNumber(item?.frameworkTotalValue);
  const callOffActual = toFiniteNumber(item?.callOffActualValue);
  const variationDelta = toFiniteNumber(item?.variationDeltaValue) || 0;

  if (callOffActual !== null) return callOffActual;
  if (frameworkTotal !== null) return frameworkTotal + variationDelta;
  return legacyBase + variationDelta;
};
