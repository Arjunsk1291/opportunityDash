import type { Opportunity } from '@/data/opportunityData';

const API_URL = import.meta.env.VITE_API_URL || '/api';

export interface AssistantQueryResult {
  ok: boolean;
  intent: string | null;
  confidence: number;
  scopeGroup: string | null;
  timeRange: string | null;
  drilldownKey: string | null;
  title: string;
  explanation: string;
}

export interface AssistantLossTheme {
  label: string;
  count: number;
  sample: { refNo: string; tenderName: string } | null;
}

export interface AssistantDrilldownSummary {
  ok: boolean;
  bullets: string[];
  stats: {
    totalRows: number;
    statusCounts: Record<string, number>;
    groupCounts: Record<string, number>;
    clientCounts: Record<string, number>;
  };
}

export interface AssistantMatchReview {
  refNo: string;
  tenderName: string;
  clientName: string;
  confidence: string;
  score: number;
  reasons: string[];
}

const authHeaders = (token: string) => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${token}`,
});

const toAssistantRow = (row: Opportunity) => ({
  opportunityRefNo: row.opportunityRefNo,
  tenderName: row.tenderName,
  clientName: row.clientName,
  groupClassification: row.groupClassification,
  opportunityClassification: row.opportunityClassification,
  dateTenderReceived: row.dateTenderReceived,
  tenderSubmittedDate: row.tenderSubmittedDate,
  postBidDetailType: row.postBidDetailType,
  remarksReason: row.remarksReason,
  comments: row.comments,
  avenirStatus: row.avenirStatus,
  canonicalStage: row.canonicalStage,
  tenderResult: row.tenderResult,
});

export async function queryAssistant(token: string, query: string): Promise<AssistantQueryResult> {
  const response = await fetch(API_URL + '/assistant/query', {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ query }),
  });
  return response.json();
}

export async function fetchLossThemes(token: string, rows: Opportunity[]): Promise<AssistantLossTheme[]> {
  const response = await fetch(API_URL + '/assistant/loss-themes', {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ rows: rows.map(toAssistantRow) }),
  });
  const payload = await response.json();
  return payload.themes || [];
}

export async function fetchDrilldownSummary(token: string, title: string, rows: Opportunity[]): Promise<AssistantDrilldownSummary> {
  const response = await fetch(API_URL + '/assistant/drilldown-summary', {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ title, rows: rows.map(toAssistantRow) }),
  });
  return response.json();
}

export async function fetchMatchReview(token: string, rows: Opportunity[]): Promise<AssistantMatchReview[]> {
  const response = await fetch(API_URL + '/assistant/match-review', {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ rows: rows.map(toAssistantRow) }),
  });
  const payload = await response.json();
  return payload.matches || [];
}
