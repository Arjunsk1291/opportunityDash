import type { BidDecisionRecord } from '@/lib/bidDecision';

export type TouchedOpportunity = {
  opportunityRefNo: string;
  tenderName: string;
  clientName?: string;
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
  // All candidates are name-similarity heuristics; there is no exact-ref
  // "high confidence" case (identical refs are the same tender and are skipped).
  confidence: 'medium';
};

const STOPWORDS = new Set(['the', 'of', 'for', 'and', 'project', 'services', 'works', 'contract', 'a', 'an']);

export const normalizeRefForMatch = (ref: string): string => String(ref || '').trim().toLowerCase();

// EOI-aware ref helpers — mirror the convention in
// src/components/Dashboard/ExportButton.tsx (getBaseRefNo / isEoiRefNo).
// A ref ending in `_EOI` denotes the EOI phase, which is a DIFFERENT tender from
// the same base ref without the suffix.
const EOI_SUFFIX = /_eoi$/i;
export const isEoiRef = (ref: string): boolean => EOI_SUFFIX.test(normalizeRefForMatch(ref));
export const getBaseRefForMatch = (ref: string): string => normalizeRefForMatch(ref).replace(EOI_SUFFIX, '');

const tokenize = (value: string): Set<string> => {
  const tokens = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token && !STOPWORDS.has(token));
  return new Set(tokens);
};

// ponytail: naive Jaccard over word tokens — no stemming, synonyms, or fuzzy
// edit-distance. Ceiling: "Pipeline"/"Pipelines" or "ADNOC"/"Abu Dhabi National
// Oil Co" read as unrelated. Upgrade path if false negatives bite: stem tokens
// or swap in a trigram/Dice similarity. Kept simple because a second signal
// (exact base-ref + client corroboration) already gates the matches.
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

// Do two client / end-user strings share at least one meaningful token?
const shareToken = (a: string, b: string): boolean => {
  const setA = tokenize(a);
  const setB = tokenize(b);
  if (!setA.size || !setB.size) return false;
  for (const token of setA) if (setB.has(token)) return true;
  return false;
};

const DISMISSED_KEY = 'avenir_manual_match_dismissed';

export const readDismissedMatches = (): Set<string> => {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    // Dismissals are now keyed by recordId alone. Legacy entries were stored as
    // `recordId:oppRef`; normalize them to their recordId prefix so previously
    // dismissed matches stay dismissed.
    const ids = (Array.isArray(arr) ? arr : []).map((entry) => String(entry).split(':')[0]);
    return new Set(ids);
  } catch {
    return new Set();
  }
};

// Dismissals are keyed by record id alone so that once a user marks an entry
// "not the same", it stays dismissed across future uploads (it no longer
// resurfaces just because a later sheet touches a different opportunity ref).
export const dismissMatch = (recordId: string) => {
  try {
    const dismissed = readDismissedMatches();
    dismissed.add(String(recordId));
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(Array.from(dismissed)));
  } catch {}
};

// Name-only similarity bar when we have a corroborating client/end-user signal.
const NAME_SIMILARITY_THRESHOLD = 0.7;
// Stricter bar when no client info is available to corroborate (e.g. potential rows).
const NAME_SIMILARITY_STRICT = 0.85;

const evaluateCandidate = (
  kind: ManualMatchCandidate['kind'],
  recordId: string,
  manualRef: string,
  manualName: string,
  manualClient: string,
  opp: TouchedOpportunity,
  dismissed: Set<string>,
): ManualMatchCandidate | null => {
  if (!recordId || dismissed.has(recordId)) return null;

  const manualRefNorm = normalizeRefForMatch(manualRef);
  const oppRefNorm = normalizeRefForMatch(opp.opportunityRefNo);
  if (!oppRefNorm) return null;

  // Case A — identical full ref: the manual entry already refers to this exact
  // opportunity; there is nothing to reconcile.
  if (manualRefNorm && manualRefNorm === oppRefNorm) return null;

  // Case B — same base ref but different EOI phase (one `_EOI`, the other not):
  // these are DISTINCT tenders and must never be flagged as duplicates.
  const manualBase = getBaseRefForMatch(manualRef);
  const oppBase = getBaseRefForMatch(opp.opportunityRefNo);
  if (manualBase && manualBase === oppBase && isEoiRef(manualRef) !== isEoiRef(opp.opportunityRefNo)) {
    return null;
  }

  // Case C — different tenders by ref: only a possible duplicate when the names
  // are similar. A strong name match (>= STRICT) stands on its own; a moderate
  // name match (>= THRESHOLD) is only accepted when a client/end-user token
  // corroborates it. Corroboration is additive — it rescues the moderate band,
  // it never suppresses a strong-name match (endUser and clientName often use
  // different wording for the same client). This stops generically-named
  // entries from matching on every upload without dropping real duplicates.
  const similarity = tokenSimilarity(manualName, opp.tenderName || '');
  if (similarity < NAME_SIMILARITY_STRICT) {
    if (similarity < NAME_SIMILARITY_THRESHOLD) return null;
    if (!shareToken(manualClient, opp.clientName || '')) return null;
  }

  return {
    kind,
    recordId,
    manualRef,
    manualName,
    opportunityRefNo: opp.opportunityRefNo,
    opportunityName: opp.tenderName || '',
    confidence: 'medium',
  };
};

export const findManualMatches = (
  touchedOpportunities: TouchedOpportunity[],
  manualBidDecisions: BidDecisionRecord[],
  unmatchedPotentialRows: UnmatchedPotentialRow[],
): ManualMatchCandidate[] => {
  const dismissed = readDismissedMatches();
  const matches: ManualMatchCandidate[] = [];
  // Surface each manual record at most once to keep the dialog focused.
  const matchedRecordIds = new Set<string>();

  touchedOpportunities.forEach((opp) => {
    manualBidDecisions.forEach((record) => {
      const recordId = String(record._id || record.id || '');
      if (!recordId || matchedRecordIds.has(recordId)) return;
      const candidate = evaluateCandidate(
        'bidDecision',
        recordId,
        record.opportunityRefNo,
        record.projectName,
        record.endUser || '',
        opp,
        dismissed,
      );
      if (candidate) {
        matches.push(candidate);
        matchedRecordIds.add(recordId);
      }
    });

    unmatchedPotentialRows.forEach((row) => {
      const recordId = String(row.id || '');
      if (!recordId || matchedRecordIds.has(recordId)) return;
      const candidate = evaluateCandidate(
        'potential',
        recordId,
        row.opportunityRefNo,
        row.tenderName,
        '',
        opp,
        dismissed,
      );
      if (candidate) {
        matches.push(candidate);
        matchedRecordIds.add(recordId);
      }
    });
  });

  return matches;
};
