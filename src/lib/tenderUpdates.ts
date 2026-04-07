export type ProjectUpdateType =
  | 'vendor_contacted'
  | 'vendor_response'
  | 'vendor_finalized'
  | 'extension_requested'
  | 'due_date_changed'
  | 'status_update'
  | 'general_note';

export type FinalDecision = 'accepted' | 'rejected' | 'negotiating';

export type ProjectUpdate = {
  id: string;
  tenderId: string;
  tenderRefNo: string;
  updateType: ProjectUpdateType;
  vendorName?: string;
  parentUpdateId?: string;
  responseDetails?: string;
  contactDate?: string;
  responseDate?: string;
  extensionDate?: string;
  finalizedDate?: string;
  finalDecision?: FinalDecision;
  finalInstructions?: string;
  finalPrice?: number;
  notes?: string;
  updatedBy: string;
  createdAt: string;
};

type CreateProjectUpdateInput = Omit<ProjectUpdate, 'id' | 'createdAt' | 'updatedBy'>;

const API_URL = import.meta.env.VITE_API_URL || '/api';

const normalizeUpdate = (input: ProjectUpdate): ProjectUpdate => ({
  ...input,
  tenderRefNo: input.tenderRefNo?.trim() || '',
  vendorName: input.vendorName?.trim() || '',
  parentUpdateId: input.parentUpdateId?.trim() || '',
  responseDetails: input.responseDetails?.trim() || '',
  contactDate: input.contactDate || '',
  responseDate: input.responseDate || '',
  extensionDate: input.extensionDate || '',
  finalizedDate: input.finalizedDate || '',
  finalDecision: input.finalDecision || undefined,
  finalInstructions: input.finalInstructions?.trim() || '',
  finalPrice: typeof input.finalPrice === 'number' && Number.isFinite(input.finalPrice) ? input.finalPrice : undefined,
  notes: input.notes?.trim() || '',
  updatedBy: input.updatedBy?.trim() || 'unknown',
});

const authHeaders = (token: string) => ({
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
});

export const getProjectUpdates = async (token: string): Promise<ProjectUpdate[]> => {
  const response = await fetch(`${API_URL}/project-updates?limit=1000`, {
    headers: authHeaders(token),
  });
  const data = await response.json().catch(() => []);
  if (!response.ok) {
    throw new Error(data?.error || 'Failed to load project updates');
  }
  return (Array.isArray(data) ? data : [])
    .map((item) => normalizeUpdate(item as ProjectUpdate))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
};

export const createProjectUpdate = async (token: string, input: CreateProjectUpdateInput): Promise<ProjectUpdate> => {
  const response = await fetch(`${API_URL}/project-updates`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(input),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || 'Failed to create project update');
  }
  return normalizeUpdate(data as ProjectUpdate);
};

export const getTenderProjectUpdates = (tenderId: string, tenderRefNo: string, updates: ProjectUpdate[]): ProjectUpdate[] => (
  updates
    .filter((update) => update.tenderRefNo === tenderRefNo || update.tenderId === tenderId)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
);

export const getUpdateCount = (tenderId: string, tenderRefNo: string, updates?: ProjectUpdate[]): number => {
  const source = updates || [];
  return source.filter((update) => update.tenderRefNo === tenderRefNo || update.tenderId === tenderId).length;
};

export const getLastUpdate = (tenderId: string, tenderRefNo: string, updates?: ProjectUpdate[]): ProjectUpdate | null => {
  const source = updates || [];
  const matches = source
    .filter((update) => update.tenderRefNo === tenderRefNo || update.tenderId === tenderId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return matches[0] || null;
};
