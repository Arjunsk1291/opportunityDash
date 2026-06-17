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
  projectName: string;
  endUser: string;
  receivedFrom: string;
  enquiryDate: string;
  scopeOfWork: string;
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
  // Optional header fields stored alongside the decision
  projectName?: string;
  endUser?: string;
  receivedFrom?: string;
  enquiryDate?: string;
  scopeOfWork?: string;
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
export const BID_DECISION_THRESHOLD = 65; // % threshold: ≥65 = BID

export interface BidCriterionOption {
  label: string;
  score: number;
  hint?: string;
}

export interface BidCriterionDefinition {
  key: string;
  label: string;
  description: string;
  weight: number; // out of 100; 0 = informational only
  options: BidCriterionOption[];
}

export const BID_CRITERIA_DEFINITIONS: BidCriterionDefinition[] = [
  {
    key: 'technical_feasibility',
    label: 'Technical Feasibility',
    description: 'Scope of service is inline with Avenir Capabilities',
    weight: 20,
    options: [
      { label: 'YES – within capabilities', score: 100 },
      { label: 'NO – outside capabilities', score: 0 },
    ],
  },
  {
    key: 'strategic_fit',
    label: 'Strategic Fit',
    description: 'Company strategic development / market growth opportunity',
    weight: 10,
    options: [
      { label: 'YES – strategic value', score: 100 },
      { label: 'NO – no strategic value', score: 0 },
    ],
  },
  {
    key: 'resource_availability',
    label: 'Resource Availability',
    description: 'Lead availability when project is awarded',
    weight: 10,
    options: [
      { label: 'All leads available (≥100%)', score: 100 },
      { label: '~50% leads available', score: 50 },
      { label: 'Less than 50% leads', score: 25 },
    ],
  },
  {
    key: 'subcontract_portion',
    label: 'Sub-contract Work Portion',
    description: 'Percentage of work to be sub-contracted',
    weight: 15,
    options: [
      { label: '26% – 50% sub-contracted', score: 100 },
      { label: '51% – 79% sub-contracted', score: 50 },
      { label: '>80% sub-contracted', score: 25 },
    ],
  },
  {
    key: 'client_reputation',
    label: 'Client Reputation',
    description: 'Existing or new client, and payment history',
    weight: 10,
    options: [
      { label: 'Existing – good relationship', score: 100 },
      { label: 'Existing – not so good', score: 50 },
      { label: 'New client', score: 25 },
      { label: 'Bad payment history', score: 0 },
    ],
  },
  {
    key: 'location',
    label: 'Location',
    description: 'Project geographic location',
    weight: 10,
    options: [
      { label: 'UAE', score: 100 },
      { label: 'Saudi Arabia / Oman / Qatar', score: 50 },
      { label: 'Other location', score: 15 },
    ],
  },
  {
    key: 'win_ratio',
    label: 'Win Ratio with Client',
    description: 'Historical win rate with this client',
    weight: 7,
    options: [
      { label: 'Good win record', score: 100 },
      { label: 'Average win record', score: 50 },
      { label: 'Low win record', score: 20 },
    ],
  },
  {
    key: 'bid_bond',
    label: 'High Value Bid Bond',
    description: 'Is there a high value bid bond requirement?',
    weight: 0,
    options: [
      { label: 'No bid bond required', score: 0 },
      { label: 'Yes – high value bid bond', score: 0, hint: 'May impact cash flow — proceed with caution' },
    ],
  },
  {
    key: 'end_user_epc',
    label: 'End User / EPC',
    description: 'Direct end user or via EPC contractor',
    weight: 8,
    options: [
      { label: 'End User – direct from client', score: 100 },
      { label: 'EPC Contractor', score: 50 },
    ],
  },
  {
    key: 'single_source',
    label: 'Single Source Bid',
    description: 'Is this a single source bid (no open competition)?',
    weight: 10,
    options: [
      { label: 'Yes – single source (invited only)', score: 100 },
      { label: 'No – open competition', score: 40 },
    ],
  },
];

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
  projectName: String((input as Record<string, unknown>)?.projectName || ''),
  endUser: String((input as Record<string, unknown>)?.endUser || ''),
  receivedFrom: String((input as Record<string, unknown>)?.receivedFrom || ''),
  enquiryDate: String((input as Record<string, unknown>)?.enquiryDate || ''),
  scopeOfWork: String((input as Record<string, unknown>)?.scopeOfWork || ''),
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

export const relinkBidDecisionToOpportunity = async (token: string, id: string, opportunityRefNo: string) => {
  const response = await fetch(`${API_URL}/bid-decisions/${encodeURIComponent(id)}/relink`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify({ opportunityRefNo: normalizeText(opportunityRefNo) }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || 'Failed to link bid decision');
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
