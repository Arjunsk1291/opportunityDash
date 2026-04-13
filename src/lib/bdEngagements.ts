export const BD_ENGAGEMENTS_STORAGE_KEY = 'bd_engagements_v3';

export type BDEngagement = {
  id: string;
  ref: string;
  date: string;
  clientName: string;
  meetingType: string;
  status: string;
  discussionPoints: string;
  reportSubmitted: boolean;
  leadGenerated: boolean;
  leadDescription: string;
  nextSteps: string;
  lastContact: string;
  createdAt: string;
  updatedAt: string;
};

const CLIENT_NAMES = [
  'Penspen',
  'SLB',
  'IMECO',
  'Wood Group',
  'Petrofac',
  'Al Masaood PESD',
  'Bonatti',
  'Euro Mechanical',
  'Baker Hughes',
  'Siemens Energy',
  'Shell',
  'BP',
  'TotalEnergies',
  'Samsung Engineering',
  'Fluor',
  'KBR',
  'Saipem',
  'McDermott',
  'NPCC',
  'ADNOC',
  'Cegelec',
  'Saudi Aramco',
  'QatarEnergy',
  'Technip Energies',
  'JGC',
  'Linde Engineering',
  'Kent',
  'Worley',
  'CCC',
  'Target Engineering',
];

export const MEETING_TYPES = [
  'Capability Meeting',
  'Client Visit',
  'Technical Workshop',
  'Proposal Discussion',
  'Follow-Up Review',
  'PM Meeting',
  'Commercial Meeting',
  'Site Visit',
] as const;

const DISCUSSION_SNIPPETS = [
  'Reviewed upcoming EPC package and shared delivery credentials.',
  'Discussed resourcing, execution readiness, and client procurement timeline.',
  'Aligned on lead follow-up actions and technical clarifications.',
  'Presented recent project references and local execution model.',
  'Captured concerns around schedule confidence and reporting cadence.',
  'Explored framework agreement opportunities and plant maintenance support.',
];

const LEAD_SNIPPETS = [
  'Brownfield upgrade opportunity',
  'Shutdown services package',
  'Owner’s engineer support',
  'PMC expansion scope',
  'Asset integrity campaign',
  'Digitalization and analytics pilot',
];

const NEXT_STEP_SNIPPETS = [
  'Send capability deck and proposed org chart.',
  'Schedule detailed technical review next month.',
  'Share case studies and budgetary estimate.',
  'Arrange leadership follow-up with operations team.',
  'Prepare visit summary and update opportunity tracker.',
  'Coordinate with proposal team for a warm lead conversion.',
];

const pad = (value: number) => String(value).padStart(2, '0');

const dateToIso = (year: number, month: number, day: number) => `${year}-${pad(month)}-${pad(day)}`;

const buildSeedEngagements = (): BDEngagement[] => {
  const rows: BDEngagement[] = [];

  for (let index = 0; index < 84; index += 1) {
    const clientName = CLIENT_NAMES[index % CLIENT_NAMES.length];
    const meetingType = MEETING_TYPES[index % MEETING_TYPES.length];
    const year = 2023 + Math.floor(index / 28);
    const month = (index % 12) + 1;
    const day = ((index * 3) % 27) + 1;
    const date = dateToIso(year, month, day);
    const lastContactDay = Math.min(day + (index % 4), 28);
    const lastContact = dateToIso(year, month, lastContactDay);
    const reportSubmitted = index % 4 !== 0;
    const leadGenerated = index % 3 === 0 || index % 7 === 0;
    const ref = `BD-${year}-${pad(index + 1)}`;
    const createdAt = `${date}T09:00:00.000Z`;
    const updatedAt = `${lastContact}T14:30:00.000Z`;

    rows.push({
      id: ref,
      ref,
      date,
      clientName,
      meetingType,
      status: 'Open',
      discussionPoints: DISCUSSION_SNIPPETS[index % DISCUSSION_SNIPPETS.length],
      reportSubmitted,
      leadGenerated,
      leadDescription: leadGenerated ? LEAD_SNIPPETS[index % LEAD_SNIPPETS.length] : '',
      nextSteps: NEXT_STEP_SNIPPETS[index % NEXT_STEP_SNIPPETS.length],
      lastContact,
      createdAt,
      updatedAt,
    });
  }

  return rows;
};

export const BD_ENGAGEMENTS_SEED: BDEngagement[] = [];

const safeWindow = () => typeof window !== 'undefined';

export const loadBDEngagements = (): BDEngagement[] => {
  if (!safeWindow()) return BD_ENGAGEMENTS_SEED;
  const raw = window.localStorage.getItem(BD_ENGAGEMENTS_STORAGE_KEY);
  if (!raw) {
    window.localStorage.setItem(BD_ENGAGEMENTS_STORAGE_KEY, JSON.stringify(BD_ENGAGEMENTS_SEED));
    return BD_ENGAGEMENTS_SEED;
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      window.localStorage.setItem(BD_ENGAGEMENTS_STORAGE_KEY, JSON.stringify(BD_ENGAGEMENTS_SEED));
      return BD_ENGAGEMENTS_SEED;
    }
    return parsed;
  } catch {
    window.localStorage.setItem(BD_ENGAGEMENTS_STORAGE_KEY, JSON.stringify(BD_ENGAGEMENTS_SEED));
    return BD_ENGAGEMENTS_SEED;
  }
};

export const saveBDEngagements = (rows: BDEngagement[]) => {
  if (!safeWindow()) return;
  window.localStorage.setItem(BD_ENGAGEMENTS_STORAGE_KEY, JSON.stringify(rows));
};

export const resetBDEngagements = () => {
  saveBDEngagements([]);
  return [];
};

export const createBDEngagementId = () => `bd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
