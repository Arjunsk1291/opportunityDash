export type TenderUpdateType = 'subcontractor' | 'client';
export type TenderUpdateSubType = 'contacted' | 'response' | 'note' | 'submission' | 'extension' | 'clarification';

export type TenderUpdate = {
  id: string;
  opportunityId: string;
  type: TenderUpdateType;
  subType: TenderUpdateSubType;
  actor: string;
  date: string;
  dueDate: string | null;
  details: string;
  attachments: string[];
  createdBy: string;
  createdAt: string;
};

export type DueDateStatus = 'overdue' | 'urgent' | 'upcoming' | 'safe';

const STORAGE_KEY = 'tender_updates_v1';
const SEEDED_KEY = 'tender_updates_seeded_v1';

const canUseStorage = () => typeof window !== 'undefined' && typeof localStorage !== 'undefined';

const safeParse = (value: string | null) => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveUpdates = (updates: TenderUpdate[]) => {
  if (!canUseStorage()) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updates));
};

const newId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `upd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
};

type TenderUpdateSeed = Omit<TenderUpdate, 'id' | 'opportunityId' | 'createdAt'> & { refNo: string; createdAt?: string };

const normalizeRefNo = (value: string) => String(value || '').trim().toUpperCase();

export const getTenderUpdates = (): TenderUpdate[] => {
  if (!canUseStorage()) return [];
  const raw = safeParse(localStorage.getItem(STORAGE_KEY)) as TenderUpdate[];
  return raw.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
};

export const addTenderUpdate = (input: Omit<TenderUpdate, 'id' | 'createdAt'>): TenderUpdate => {
  const updates = getTenderUpdates();
  const next: TenderUpdate = {
    ...input,
    id: newId(),
    createdAt: new Date().toISOString(),
  };
  updates.unshift(next);
  saveUpdates(updates);
  return next;
};

export const deleteTenderUpdate = (id: string) => {
  const updates = getTenderUpdates().filter((update) => update.id !== id);
  saveUpdates(updates);
};

export const seedTenderUpdates = (
  opportunities: Array<{ id: string; opportunityRefNo?: string }>,
  seeds: TenderUpdateSeed[],
) => {
  if (!canUseStorage()) return { seeded: false, count: 0 };
  if (localStorage.getItem(SEEDED_KEY)) return { seeded: false, count: 0 };
  if (getTenderUpdates().length > 0) {
    localStorage.setItem(SEEDED_KEY, 'true');
    return { seeded: false, count: 0 };
  }

  const updates: TenderUpdate[] = [];
  const oppMap = new Map(
    opportunities
      .filter((opp) => opp.opportunityRefNo)
      .map((opp) => [normalizeRefNo(opp.opportunityRefNo || ''), opp.id]),
  );

  seeds.forEach((seed) => {
    const oppId = oppMap.get(normalizeRefNo(seed.refNo));
    if (!oppId) return;
    updates.push({
      ...seed,
      id: newId(),
      opportunityId: oppId,
      createdAt: seed.createdAt || new Date().toISOString(),
    });
  });

  if (updates.length) saveUpdates(updates);
  localStorage.setItem(SEEDED_KEY, 'true');
  return { seeded: updates.length > 0, count: updates.length };
};

export const getNextDueDate = (opportunityId: string, updates?: TenderUpdate[]) => {
  const list = updates ?? getTenderUpdates();
  const dueDates = list
    .filter((update) => update.opportunityId === opportunityId && update.dueDate)
    .map((update) => update.dueDate as string)
    .sort();
  if (dueDates.length === 0) return null;
  const date = dueDates[0];
  return { date, status: resolveDueStatus(date) };
};

export const resolveDueStatus = (date: string, now = new Date()): DueDateStatus => {
  const due = new Date(date);
  const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 'overdue';
  if (diffDays <= 7) return 'urgent';
  if (diffDays <= 30) return 'upcoming';
  return 'safe';
};
