// Shared API client + types for Tender Follow-Ups.
// Used by the Follow-Ups page and the OpportunityDetailDialog so both stay in sync.

const API = import.meta.env.VITE_API_URL || '/api';

export interface TenderFollowUp {
  id: string;
  opportunityRefNo: string;
  tenderName: string;
  clientName: string;
  date: string;
  note: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface FollowUpInput {
  opportunityRefNo: string;
  tenderName?: string;
  clientName?: string;
  date?: string;
  note?: string;
}

// Mirrors the backend DEFAULT_ACTION_ROLE_ACCESS.tender_follow_ups_write list.
// Backend enforces for real; this only decides whether write UI is shown.
export const FOLLOW_UP_WRITE_ROLES = ['Master', 'Admin', 'ProposalHead', 'SVP', 'BDTeam'];
export const canWriteFollowUps = (role?: string | null): boolean =>
  !!role && FOLLOW_UP_WRITE_ROLES.includes(role);

const authHeaders = (token: string, json = false): Record<string, string> => ({
  Authorization: `Bearer ${token}`,
  ...(json ? { 'Content-Type': 'application/json' } : {}),
});

export async function getFollowUps(token: string, opportunityRefNo?: string): Promise<TenderFollowUp[]> {
  const q = opportunityRefNo ? `?opportunityRefNo=${encodeURIComponent(opportunityRefNo)}` : '';
  const res = await fetch(`${API}/tender-follow-ups${q}`, { headers: authHeaders(token) });
  const data = await res.json().catch(() => []);
  if (!res.ok) throw new Error((data as { error?: string })?.error || 'Failed to load follow-ups');
  return Array.isArray(data) ? (data as TenderFollowUp[]) : [];
}

export async function createFollowUp(token: string, input: FollowUpInput): Promise<TenderFollowUp> {
  const res = await fetch(`${API}/tender-follow-ups`, {
    method: 'POST',
    headers: authHeaders(token, true),
    body: JSON.stringify(input),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string })?.error || 'Failed to create follow-up');
  return (data as { row: TenderFollowUp }).row;
}

export async function updateFollowUp(token: string, id: string, input: FollowUpInput): Promise<TenderFollowUp> {
  const res = await fetch(`${API}/tender-follow-ups/${id}`, {
    method: 'PUT',
    headers: authHeaders(token, true),
    body: JSON.stringify(input),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string })?.error || 'Failed to update follow-up');
  return (data as { row: TenderFollowUp }).row;
}

export async function deleteFollowUp(token: string, id: string): Promise<void> {
  const res = await fetch(`${API}/tender-follow-ups/${id}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string })?.error || 'Failed to delete follow-up');
  }
}

// Deterministic accent color per tender ref so cards for the same tender look related.
const ACCENTS = [
  { bar: 'bg-indigo-500', chip: 'bg-indigo-50 text-indigo-700 ring-indigo-200', dot: 'bg-indigo-500' },
  { bar: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-700 ring-emerald-200', dot: 'bg-emerald-500' },
  { bar: 'bg-amber-500', chip: 'bg-amber-50 text-amber-700 ring-amber-200', dot: 'bg-amber-500' },
  { bar: 'bg-rose-500', chip: 'bg-rose-50 text-rose-700 ring-rose-200', dot: 'bg-rose-500' },
  { bar: 'bg-sky-500', chip: 'bg-sky-50 text-sky-700 ring-sky-200', dot: 'bg-sky-500' },
  { bar: 'bg-violet-500', chip: 'bg-violet-50 text-violet-700 ring-violet-200', dot: 'bg-violet-500' },
  { bar: 'bg-teal-500', chip: 'bg-teal-50 text-teal-700 ring-teal-200', dot: 'bg-teal-500' },
];
export const accentFor = (key: string) => {
  let h = 0;
  for (let i = 0; i < key.length; i += 1) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return ACCENTS[h % ACCENTS.length];
};

export const initialsOf = (value: string): string => {
  const name = String(value || '').split('@')[0].replace(/[._-]+/g, ' ').trim();
  if (!name) return '?';
  const parts = name.split(/\s+/);
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
};
