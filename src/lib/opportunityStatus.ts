import type { Opportunity } from '@/data/opportunityData';

export const normalizeStatusValue = (value: string | null | undefined) => String(value || '').trim().toUpperCase();

export const isEoiNormalizedOpportunity = (opp: Partial<Opportunity>) => (
  normalizeStatusValue(opp.rawAvenirStatus) === 'EOI'
);

export const getDisplayStatus = (opp: Partial<Opportunity>) => {
  const tenderResult = normalizeStatusValue(opp.tenderResult);
  if (tenderResult && tenderResult !== 'UNKNOWN') return tenderResult;
  return normalizeStatusValue(opp.avenirStatus || opp.canonicalStage || '');
};

export const getDisplayResult = (opp: Partial<Opportunity>) => {
  const tenderResult = normalizeStatusValue(opp.tenderResult);
  if (tenderResult) return tenderResult;
  if (isEoiNormalizedOpportunity(opp)) return 'UNKNOWN';
  return '';
};

export const getRawAvenirStatus = (opp: Partial<Opportunity>) => (
  normalizeStatusValue(opp.rawAvenirStatus || opp.avenirStatus || opp.canonicalStage || '')
);

export const getRawTenderResult = (opp: Partial<Opportunity>) => (
  normalizeStatusValue(opp.rawTenderResult || opp.tenderResult || '')
);
