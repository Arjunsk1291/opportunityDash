const API_URL = import.meta.env.VITE_API_URL || '/api';

const authHeaders = (token: string) => ({
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
});

const normalizeExtraKeySlug = (v: string) => String(v || '').trim().toLowerCase().replace(/\s+/g, ' ').trim();

export const getExtrasTenderName = (extras: Record<string, unknown> | null | undefined): string => {
  if (!extras) return '';
  const found = Object.entries(extras).find(([k]) => ['tender name', 'tendername', 'tender'].includes(normalizeExtraKeySlug(k)));
  return String(found?.[1] || '').trim();
};

export type PotentialOpportunityRow = {
  id: string;
  opportunityRefNo: string;
  isPotential: boolean;
  extras: Record<string, unknown>;
  opportunity?: { tenderName?: string } | null;
};

export const fetchPotentialOpportunityRows = async (token: string): Promise<PotentialOpportunityRow[]> => {
  const response = await fetch(`${API_URL}/potential-opportunities?onlyPotential=false`, {
    headers: authHeaders(token),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || 'Failed to load potential opportunities');
  return Array.isArray(data?.rows) ? data.rows : [];
};

export const relinkPotentialOpportunity = async (token: string, id: string, opportunityRefNo: string) => {
  const response = await fetch(`${API_URL}/potential-opportunities/${encodeURIComponent(id)}/relink`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify({ opportunityRefNo }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || 'Failed to link potential opportunity');
  return data?.row;
};
