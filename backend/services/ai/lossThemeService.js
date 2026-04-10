import { rankTextAgainstLabels } from './embeddingsService.js';
import { normalizeText } from './utils.js';

const THEME_CATALOG = [
  { key: 'pricing', label: 'Pricing Pressure', description: 'Price too high, cost issue, budget gap, commercial concern, rate not competitive.' },
  { key: 'technical', label: 'Technical Gap', description: 'Technical issue, specification gap, compliance issue, qualification problem, capability concern.' },
  { key: 'competitor', label: 'Competitor Pressure', description: 'Competitor won, incumbent advantage, alternate vendor selected, stronger competition.' },
  { key: 'timeline', label: 'Timeline Risk', description: 'Delay, timeline issue, deadline concern, delivery timing problem.' },
  { key: 'silence', label: 'Client Silence', description: 'No response, no update, silent client, awaiting feedback, pending with no movement.' },
  { key: 'other', label: 'Other', description: 'General other reason with no clear pricing, technical, competitor, timeline, or silence theme.' },
];

export async function buildLossThemes(rows = []) {
  const counts = new Map();
  const samples = new Map();

  for (const row of rows) {
    const text = normalizeText(row?.remarksReason || row?.comments);
    if (!text) continue;

    const ranked = await rankTextAgainstLabels(text, THEME_CATALOG);
    const winner = ranked[0] || THEME_CATALOG[THEME_CATALOG.length - 1];
    const label = winner.label;

    counts.set(label, (counts.get(label) || 0) + 1);
    if (!samples.has(label)) {
      samples.set(label, {
        refNo: row?.opportunityRefNo || '',
        tenderName: row?.tenderName || 'Untitled',
      });
    }
  }

  return Array.from(counts.entries())
    .map(([label, count]) => ({
      label,
      count,
      sample: samples.get(label) || null,
    }))
    .sort((a, b) => b.count - a.count);
}
