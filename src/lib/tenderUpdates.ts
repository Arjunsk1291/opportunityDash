import type { Opportunity } from '@/data/opportunityData';

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
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updates));
};

const newId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `upd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
};

export const getTenderUpdates = (): TenderUpdate[] => {
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

export const seedTenderUpdates = (opportunities: Opportunity[]) => {
  if (getTenderUpdates().length > 0) return;
  const sampleTargets = opportunities.slice(0, 4);
  const today = new Date();
  const addDays = (days: number) => new Date(today.getTime() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const samples: TenderUpdate[] = [
    {
      id: newId(),
      opportunityId: sampleTargets[0]?.id || 'sample-1',
      type: 'subcontractor',
      subType: 'contacted',
      actor: 'A. Nair',
      date: addDays(-2),
      dueDate: addDays(5),
      details: 'Initial outreach sent to mechanical subcontractors.',
      attachments: [],
      createdBy: 'System',
      createdAt: new Date().toISOString(),
    },
    {
      id: newId(),
      opportunityId: sampleTargets[0]?.id || 'sample-1',
      type: 'client',
      subType: 'clarification',
      actor: 'R. Mathew',
      date: addDays(-1),
      dueDate: addDays(10),
      details: 'Requested clarification on scope boundaries for phase 2.',
      attachments: [],
      createdBy: 'System',
      createdAt: new Date().toISOString(),
    },
    {
      id: newId(),
      opportunityId: sampleTargets[1]?.id || 'sample-2',
      type: 'subcontractor',
      subType: 'response',
      actor: 'L. Pereira',
      date: addDays(-3),
      dueDate: addDays(3),
      details: 'Received pricing feedback for HVAC components.',
      attachments: [],
      createdBy: 'System',
      createdAt: new Date().toISOString(),
    },
    {
      id: newId(),
      opportunityId: sampleTargets[1]?.id || 'sample-2',
      type: 'client',
      subType: 'note',
      actor: 'S. Iyer',
      date: addDays(-6),
      dueDate: null,
      details: 'Client prefers staggered submission schedule.',
      attachments: [],
      createdBy: 'System',
      createdAt: new Date().toISOString(),
    },
    {
      id: newId(),
      opportunityId: sampleTargets[2]?.id || 'sample-3',
      type: 'client',
      subType: 'submission',
      actor: 'M. Thomas',
      date: addDays(-8),
      dueDate: addDays(14),
      details: 'Draft submission shared for client review.',
      attachments: [],
      createdBy: 'System',
      createdAt: new Date().toISOString(),
    },
    {
      id: newId(),
      opportunityId: sampleTargets[3]?.id || 'sample-4',
      type: 'subcontractor',
      subType: 'extension',
      actor: 'P. George',
      date: addDays(-4),
      dueDate: addDays(25),
      details: 'Requested extension for vendor quote validity.',
      attachments: [],
      createdBy: 'System',
      createdAt: new Date().toISOString(),
    },
  ];

  saveUpdates(samples);
};
