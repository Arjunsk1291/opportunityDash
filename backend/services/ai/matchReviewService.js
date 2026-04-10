import { getEmbedding } from './embeddingsService.js';
import {
  buildBusinessKey,
  cosineSimilarity,
  getBaseRefNo,
  groupBy,
  isEoiRecord,
  isTenderRecord,
  normalizeText,
  parseTimestamp,
  toPercent,
} from './utils.js';

export async function buildMatchReview(rows = []) {
  const grouped = Array.from(groupBy(rows, (row, index) => buildBusinessKey(row, index)).values());
  const results = [];

  for (const group of grouped) {
    const eoiRows = group.filter(isEoiRecord);
    const tenderRows = group.filter(isTenderRecord);
    if (!eoiRows.length || !tenderRows.length) continue;

    const eoi = eoiRows[0];
    const tender = tenderRows[0];
    const reasons = [];
    let score = 0.35;

    if (normalizeText(getBaseRefNo(eoi.opportunityRefNo)) && normalizeText(getBaseRefNo(eoi.opportunityRefNo)) === normalizeText(tender.opportunityRefNo)) {
      score += 0.3;
      reasons.push('Base ref number aligns.');
    }

    const eoiName = normalizeText(eoi.tenderName);
    const tenderName = normalizeText(tender.tenderName);
    const [eoiEmbedding, tenderEmbedding] = await Promise.all([
      getEmbedding(eoiName),
      getEmbedding(tenderName),
    ]);
    const nameSimilarity = cosineSimilarity(eoiEmbedding, tenderEmbedding);
    score += Math.max(0, nameSimilarity) * 0.25;
    reasons.push(`Tender name similarity ${toPercent(nameSimilarity)}%.`);

    if (normalizeText(eoi.clientName) && normalizeText(eoi.clientName) === normalizeText(tender.clientName)) {
      score += 0.1;
      reasons.push('Client name matches.');
    }

    const eoiDate = parseTimestamp(eoi.dateTenderReceived || eoi.tenderSubmittedDate);
    const tenderDate = parseTimestamp(tender.dateTenderReceived || tender.tenderSubmittedDate);
    if (eoiDate && tenderDate && tenderDate >= eoiDate) {
      score += 0.1;
      reasons.push('Tender date follows EOI date.');
    }

    const clamped = Math.max(0, Math.min(1, score));
    const confidence = clamped >= 0.82 ? 'Strong match' : clamped >= 0.65 ? 'Check match' : 'Needs review';

    results.push({
      refNo: tender.opportunityRefNo || eoi.opportunityRefNo || '',
      tenderName: tender.tenderName || eoi.tenderName || 'Untitled',
      clientName: tender.clientName || eoi.clientName || 'Unknown',
      confidence,
      score: toPercent(clamped),
      reasons,
    });
  }

  return results
    .sort((a, b) => a.score - b.score)
    .slice(0, 8);
}
