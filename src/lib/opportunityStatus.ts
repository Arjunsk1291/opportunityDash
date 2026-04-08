import type { Opportunity } from '@/data/opportunityData';

export const normalizeStatusValue = (value: string | null | undefined) => String(value || '').trim().toUpperCase();

export const STATUS_BADGE_CLASSES: Record<string, string> = {
  WORKING: 'border border-amber-300 bg-amber-100 text-amber-900',
  SUBMITTED: 'border border-violet-300 bg-violet-100 text-violet-900',
  AWARDED: 'border border-emerald-300 bg-emerald-100 text-emerald-900',
  LOST: 'border border-rose-300 bg-rose-100 text-rose-900',
  REGRETTED: 'border border-slate-300 bg-slate-200 text-slate-900',
  'TO START': 'border border-cyan-300 bg-cyan-100 text-cyan-900',
  ONGOING: 'border border-blue-300 bg-blue-100 text-blue-900',
  'HOLD / CLOSED': 'border border-zinc-300 bg-zinc-200 text-zinc-900',
  'HOLD/CLOSED': 'border border-zinc-300 bg-zinc-200 text-zinc-900',
};

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

export const getStatusBadgeClass = (status: string | null | undefined, opp?: Partial<Opportunity>) => {
  if (opp && isEoiNormalizedOpportunity(opp)) {
    return 'border border-violet-300 bg-gradient-to-r from-violet-100 to-fuchsia-100 text-violet-900';
  }

  return STATUS_BADGE_CLASSES[normalizeStatusValue(status)] || 'border border-slate-200 bg-slate-100 text-slate-700';
};
