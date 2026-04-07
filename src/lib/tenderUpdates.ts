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

type CreateProjectUpdateInput = Omit<ProjectUpdate, 'id' | 'createdAt'>;

const STORAGE_KEY = 'project_tracker_updates_v2';

const canUseStorage = () => typeof window !== 'undefined' && typeof localStorage !== 'undefined';

const safeParse = (value: string | null): ProjectUpdate[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveUpdates = (updates: ProjectUpdate[]) => {
  if (!canUseStorage()) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updates));
};

const newId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `project_update_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
};

const normalizeUpdate = (input: ProjectUpdate): ProjectUpdate => ({
  ...input,
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

export const getProjectUpdates = (): ProjectUpdate[] => {
  if (!canUseStorage()) return [];
  const raw = safeParse(localStorage.getItem(STORAGE_KEY));
  return raw
    .map((item) => normalizeUpdate(item))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 1000);
};

export const createProjectUpdate = (input: CreateProjectUpdateInput): ProjectUpdate => {
  const updates = getProjectUpdates();
  const next: ProjectUpdate = normalizeUpdate({
    ...input,
    id: newId(),
    createdAt: new Date().toISOString(),
  } as ProjectUpdate);
  updates.unshift(next);
  saveUpdates(updates);
  return next;
};

export const getTenderProjectUpdates = (tenderId: string): ProjectUpdate[] => (
  getProjectUpdates()
    .filter((update) => update.tenderId === tenderId)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
);

export const getUpdateCount = (tenderId: string, updates?: ProjectUpdate[]): number => {
  const source = updates || getProjectUpdates();
  return source.filter((update) => update.tenderId === tenderId).length;
};

export const getLastUpdate = (tenderId: string, updates?: ProjectUpdate[]): ProjectUpdate | null => {
  const source = updates || getProjectUpdates();
  const matches = source
    .filter((update) => update.tenderId === tenderId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return matches[0] || null;
};
