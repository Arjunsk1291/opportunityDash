export type BidDecisionState = 'BID' | 'NO BID' | 'BLANK';
export type BidDecisionSourceMode = 'dashboard' | 'manual';

export type BidDecisionCriterion = {
  key: string;
  label: string;
  rating: number | null;
  weight: number | null;
  notes: string;
  included: boolean;
};

export type BidDecisionRecord = {
  _id?: string;
  id?: string;
  opportunityRefNo: string;
  bidDecision: BidDecisionState;
  decisionScore: number;
  criteriaValues: BidDecisionCriterion[];
  sourceMode: BidDecisionSourceMode;
  createdBy: string;
  updatedBy: string;
  sourceOpportunitySyncedAt?: string | null;
  sourceOpportunityId?: string;
  createdAt: string;
  updatedAt: string;
};

export type BidDecisionSaveInput = {
  opportunityRefNo: string;
  bidDecision: BidDecisionState;
  decisionScore: number;
  criteriaValues: BidDecisionCriterion[];
  sourceMode: BidDecisionSourceMode;
};

export type BidDecisionOpportunity = {
  opportunityRefNo: string;
  tenderName: string;
  clientName: string;
  groupClassification: string;
  internalLead: string;
  opportunityClassification: string;
  dateTenderReceived: string | null;
  tenderPlannedSubmissionDate: string | null;
  tenderSubmittedDate: string | null;
  opportunityValue: number | null;
  avenirStatus: string;
  tenderResult: string;
  tenderStatusRemark: string;
  remarksReason: string;
  rawGraphData?: {
    rowSnapshot?: Record<string, unknown>;
    [key: string]: unknown;
  };
  syncedAt?: string | null;
};

const API_URL = import.meta.env.VITE_API_URL || '/api';

export const BID_DECISION_EXPORT_TEMPLATE_URL = String(
  import.meta.env.VITE_BID_DECISION_TEMPLATE_URL || '/bid-decision-template.xlsx',
).trim();

export const DEFAULT_CRITERIA_ROW: BidDecisionCriterion = {
  key: '',
  label: '',
  rating: null,
  weight: null,
  notes: '',
  included: true,
};

export const BID_DECISION_OPTIONS: BidDecisionState[] = ['BID', 'NO BID', 'BLANK'];
export const BID_DECISION_SOURCE_MODES: BidDecisionSourceMode[] = ['dashboard', 'manual'];

const authHeaders = (token: string) => ({
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
});

const normalizeText = (value: unknown) => String(value ?? '').trim();

export const normalizeBidDecisionState = (value: unknown): BidDecisionState => {
  const normalized = normalizeText(value).toUpperCase();
  if (normalized === 'BID') return 'BID';
  if (normalized === 'NO BID' || normalized === 'NOBID') return 'NO BID';
  return 'BLANK';
};

export const normalizeBidDecisionSourceMode = (value: unknown): BidDecisionSourceMode => (
  normalizeText(value).toLowerCase() === 'dashboard' ? 'dashboard' : 'manual'
);

const toFiniteNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const parsed = Number(raw.replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
};

export const normalizeBidDecisionCriterion = (input: Partial<BidDecisionCriterion> | null | undefined): BidDecisionCriterion => ({
  key: normalizeText(input?.key),
  label: normalizeText(input?.label),
  rating: toFiniteNumber(input?.rating),
  weight: toFiniteNumber(input?.weight),
  notes: normalizeText(input?.notes),
  included: input?.included ?? true,
});

export const normalizeBidDecisionRecord = (input: Partial<BidDecisionRecord> | null | undefined): BidDecisionRecord => ({
  _id: input?._id,
  id: normalizeText(input?.id || input?._id),
  opportunityRefNo: normalizeText(input?.opportunityRefNo),
  bidDecision: normalizeBidDecisionState(input?.bidDecision),
  decisionScore: Number.isFinite(Number(input?.decisionScore)) ? Number(input?.decisionScore) : 0,
  criteriaValues: Array.isArray(input?.criteriaValues)
    ? input.criteriaValues.map((criterion) => normalizeBidDecisionCriterion(criterion))
    : [],
  sourceMode: normalizeBidDecisionSourceMode(input?.sourceMode),
  createdBy: normalizeText(input?.createdBy),
  updatedBy: normalizeText(input?.updatedBy),
  sourceOpportunitySyncedAt: input?.sourceOpportunitySyncedAt || null,
  sourceOpportunityId: normalizeText(input?.sourceOpportunityId),
  createdAt: normalizeText(input?.createdAt || new Date().toISOString()),
  updatedAt: normalizeText(input?.updatedAt || new Date().toISOString()),
});

export const createEmptyBidDecisionRecord = (opportunityRefNo = '', sourceMode: BidDecisionSourceMode = 'dashboard'): BidDecisionRecord => normalizeBidDecisionRecord({
  opportunityRefNo,
  bidDecision: 'BLANK',
  decisionScore: 0,
  criteriaValues: [],
  sourceMode,
  createdBy: '',
  updatedBy: '',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

export const calculateDecisionScore = (criteriaValues: BidDecisionCriterion[]): number => {
  const active = criteriaValues.filter((criterion) => criterion.included !== false);
  const scored = active
    .map((criterion) => {
      const rating = Number(criterion.rating);
      const weight = Number(criterion.weight);
      if (!Number.isFinite(rating) || !Number.isFinite(weight) || weight <= 0) return null;
      return { rating, weight };
    })
    .filter((item): item is { rating: number; weight: number } => Boolean(item));

  if (!scored.length) return 0;

  const weightedScore = scored.reduce((sum, item) => sum + item.rating * item.weight, 0);
  const totalWeight = scored.reduce((sum, item) => sum + item.weight, 0);
  if (!totalWeight) return 0;

  return Math.round((weightedScore / totalWeight) * 100) / 100;
};

export const formatDecisionScore = (value: number | null | undefined) => {
  const score = Number(value || 0);
  if (!Number.isFinite(score)) return '0.00';
  return score.toFixed(2);
};

export const getOpportunityBidDecision = (opportunity: BidDecisionOpportunity) => {
  const snapshot = opportunity.rawGraphData?.rowSnapshot;
  if (!snapshot || typeof snapshot !== 'object') return 'BLANK';

  const entries = Object.entries(snapshot).map(([key, value]) => [normalizeText(key).toUpperCase(), value] as const);
  const match = entries.find(([key]) => key === 'BID / NO BID DECISION' || key === 'BID/NO BID DECISION');
  return normalizeBidDecisionState(match?.[1]);
};

export const getOpportunityBidDecisionCandidate = (opportunity: BidDecisionOpportunity) => {
  const snapshot = opportunity.rawGraphData?.rowSnapshot || {};
  const entries = Object.entries(snapshot)
    .filter(([, value]) => normalizeText(value) !== '')
    .map(([label, value]) => ({ label, value: normalizeText(value) }));

  return {
    opportunityRefNo: normalizeText(opportunity.opportunityRefNo),
    tenderName: normalizeText(opportunity.tenderName),
    clientName: normalizeText(opportunity.clientName),
    internalLead: normalizeText(opportunity.internalLead),
    groupClassification: normalizeText(opportunity.groupClassification),
    opportunityClassification: normalizeText(opportunity.opportunityClassification),
    dateTenderReceived: opportunity.dateTenderReceived || null,
    tenderPlannedSubmissionDate: opportunity.tenderPlannedSubmissionDate || null,
    tenderSubmittedDate: opportunity.tenderSubmittedDate || null,
    opportunityValue: opportunity.opportunityValue ?? null,
    avenirStatus: normalizeText(opportunity.avenirStatus),
    tenderResult: normalizeText(opportunity.tenderResult),
    tenderStatusRemark: normalizeText(opportunity.tenderStatusRemark),
    remarksReason: normalizeText(opportunity.remarksReason),
    sourceSnapshotEntries: entries,
    sourceMode: 'dashboard' as const,
    sourceOpportunitySyncedAt: opportunity.syncedAt || null,
  };
};

export const fetchBidDecisionRecords = async (token: string) => {
  const response = await fetch(`${API_URL}/bid-decisions`, {
    headers: authHeaders(token),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || 'Failed to load bid decisions');
  }
  return Array.isArray(data?.records) ? data.records.map((record) => normalizeBidDecisionRecord(record)) : [];
};

export const fetchBidDecisionByRef = async (token: string, opportunityRefNo: string) => {
  const ref = normalizeText(opportunityRefNo);
  if (!ref) throw new Error('opportunityRefNo is required');
  const response = await fetch(`${API_URL}/bid-decisions/${encodeURIComponent(ref)}`, {
    headers: authHeaders(token),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || 'Failed to load bid decision');
  }
  return normalizeBidDecisionRecord(data?.record || null);
};

export const saveBidDecision = async (token: string, payload: BidDecisionSaveInput) => {
  const response = await fetch(`${API_URL}/bid-decisions`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({
      ...payload,
      opportunityRefNo: normalizeText(payload.opportunityRefNo),
      bidDecision: normalizeBidDecisionState(payload.bidDecision),
      sourceMode: normalizeBidDecisionSourceMode(payload.sourceMode),
      criteriaValues: Array.isArray(payload.criteriaValues)
        ? payload.criteriaValues.map((criterion) => normalizeBidDecisionCriterion(criterion))
        : [],
      decisionScore: Number.isFinite(Number(payload.decisionScore)) ? Number(payload.decisionScore) : 0,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || 'Failed to save bid decision');
  }
  return normalizeBidDecisionRecord(data?.record || null);
};
