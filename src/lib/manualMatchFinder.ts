import type { BidDecisionRecord } from '@/lib/bidDecision';

export type TouchedOpportunity = {
  opportunityRefNo: string;
  tenderName: string;
};

export type UnmatchedPotentialRow = {
  id: string;
  opportunityRefNo: string;
  tenderName: string;
};

export type ManualMatchCandidate = {
  kind: 'bidDecision' | 'potential';
  recordId: string;
  manualRef: string;
  manualName: string;
  opportunityRefNo: string;
  opportunityName: string;
  confidence: 'high' | 'medium';
};

const STOPWORDS = new Set(['the', 'of', 'for', 'and', 'project', 'services', 'works', 'contract', 'a', 'an']);

export const normalizeRefForMatch = (ref: string): string => String(ref || '').trim().toLowerCase();

const tokenize = (value: string): Set<string> => {
  const tokens = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token && !STOPWORDS.has(token));
  return new Set(tokens);
};

export const tokenSimilarity = (a: string, b: string): number => {
  const setA = tokenize(a);
  const setB = tokenize(b);
  if (!setA.size || !setB.size) return 0;
  let intersection = 0;
  setA.forEach((token) => {
    if (setB.has(token)) intersection += 1;
  });
  const union = setA.size + setB.size - intersection;
  return union ? intersection / union : 0;
};

const DISMISSED_KEY = 'avenir_manual_match_dismissed';

export const readDismissedMatches = (): Set<string> => {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
};

export const dismissMatch = (recordId: string, opportunityRefNo: string) => {
  try {
    const dismissed = readDismissedMatches();
    dismissed.add(`${recordId}:${normalizeRefForMatch(opportunityRefNo)}`);
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(Array.from(dismissed)));
  } catch {}
};

const NAME_SIMILARITY_THRESHOLD = 0.55;

export const findManualMatches = (
  touchedOpportunities: TouchedOpportunity[],
  manualBidDecisions: BidDecisionRecord[],
  unmatchedPotentialRows: UnmatchedPotentialRow[],
): ManualMatchCandidate[] => {
  const dismissed = readDismissedMatches();
  const matches: ManualMatchCandidate[] = [];

  touchedOpportunities.forEach((opp) => {
    const oppRef = normalizeRefForMatch(opp.opportunityRefNo);
    const oppName = opp.tenderName || '';
    if (!oppRef) return;

    manualBidDecisions.forEach((record) => {
      const recordId = String(record._id || record.id || '');
      if (!recordId) return;
      const manualRef = normalizeRefForMatch(record.opportunityRefNo);
      if (manualRef === oppRef) return; // already linked under this ref
      if (dismissed.has(`${recordId}:${oppRef}`)) return;

      const refMatches = manualRef && manualRef === oppRef;
      const similarity = tokenSimilarity(record.projectName, oppName);
      if (refMatches) {
        matches.push({
          kind: 'bidDecision',
          recordId,
          manualRef: record.opportunityRefNo,
          manualName: record.projectName,
          opportunityRefNo: opp.opportunityRefNo,
          opportunityName: oppName,
          confidence: 'high',
        });
      } else if (similarity >= NAME_SIMILARITY_THRESHOLD) {
        matches.push({
          kind: 'bidDecision',
          recordId,
          manualRef: record.opportunityRefNo,
          manualName: record.projectName,
          opportunityRefNo: opp.opportunityRefNo,
          opportunityName: oppName,
          confidence: 'medium',
        });
      }
    });

    unmatchedPotentialRows.forEach((row) => {
      const recordId = String(row.id || '');
      if (!recordId) return;
      const manualRef = normalizeRefForMatch(row.opportunityRefNo);
      if (manualRef === oppRef) return;
      if (dismissed.has(`${recordId}:${oppRef}`)) return;

      const similarity = tokenSimilarity(row.tenderName, oppName);
      if (similarity >= NAME_SIMILARITY_THRESHOLD) {
        matches.push({
          kind: 'potential',
          recordId,
          manualRef: row.opportunityRefNo,
          manualName: row.tenderName,
          opportunityRefNo: opp.opportunityRefNo,
          opportunityName: oppName,
          confidence: 'medium',
        });
      }
    });
  });

  return matches;
};
