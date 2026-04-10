import { rankTextAgainstLabels } from './embeddingsService.js';
import { normalizeTextLower } from './utils.js';

const INTENT_CATALOG = [
  {
    key: 'submitted',
    drilldownKey: 'submitted',
    title: 'Submitted Tenders',
    description: 'Show tenders currently in submitted status.',
    examples: ['submitted tenders', 'show submitted bids', 'submitted rft list'],
  },
  {
    key: 'won',
    drilldownKey: 'won',
    title: 'Awarded Tenders',
    description: 'Show awarded tenders and wins.',
    examples: ['awarded tenders', 'show wins', 'won bids'],
  },
  {
    key: 'lost',
    drilldownKey: 'lost',
    title: 'Lost Tenders',
    description: 'Show tender rows that are marked as lost.',
    examples: ['lost tenders', 'show lost bids', 'losses'],
  },
  {
    key: 'regretted',
    drilldownKey: 'regretted',
    title: 'Regretted Tenders',
    description: 'Show tender rows that are regretted.',
    examples: ['regretted tenders', 'regretted bids'],
  },
  {
    key: 'hold',
    drilldownKey: 'hold',
    title: 'Hold Tenders',
    description: 'Show tender rows that are on hold or closed.',
    examples: ['hold tenders', 'on hold bids', 'hold closed tenders'],
  },
  {
    key: 'no_decision',
    drilldownKey: 'noDecision',
    title: 'No Decision Tenders',
    description: 'Show GTS submitted tenders with no post bid details.',
    examples: ['no decision tenders', 'gts no decision', 'submitted but no post bid'],
  },
  {
    key: 'pure_eoi',
    drilldownKey: 'pureEoi',
    title: 'Pure EOIs',
    description: 'Show EOI rows that have not become tenders.',
    examples: ['pure eoi', 'eoi waiting', 'stale eoi', 'eoi not converted'],
  },
  {
    key: 'became_tender',
    drilldownKey: 'becameTender',
    title: 'EOI Became Tender',
    description: 'Show EOI-origin opportunities that became tenders.',
    examples: ['became tender', 'converted eoi', 'eoi to tender'],
  },
  {
    key: 'direct_tenders',
    drilldownKey: 'directTenders',
    title: 'Direct Tenders',
    description: 'Show direct tender rows with no EOI origin.',
    examples: ['direct tenders', 'direct bids', 'non eoi tenders'],
  },
];

const GROUP_OPTIONS = ['GTS', 'GDS', 'GES'];
const RANGE_OPTIONS = ['30d', '60d', '90d', 'YTD', 'All'];

export async function parseAssistantQuery(query) {
  const text = normalizeTextLower(query);
  if (!text) {
    return {
      intent: null,
      confidence: 0,
      scopeGroup: null,
      timeRange: null,
      drilldownKey: null,
      title: '',
      explanation: 'Type a question to open a matching analytics drilldown.',
    };
  }

  const scopeGroup = GROUP_OPTIONS.find((group) => text.includes(group.toLowerCase())) || null;
  const timeRange = RANGE_OPTIONS.find((range) => text.includes(range.toLowerCase())) || null;

  const ranked = await rankTextAgainstLabels(
    text,
    INTENT_CATALOG.map((intent) => ({
      ...intent,
      label: intent.key,
      description: `${intent.description}. Examples: ${intent.examples.join(', ')}`,
    })),
  );

  const best = ranked[0] || null;
  const confidence = best ? Math.max(0, Math.min(1, Number(best.score || 0))) : 0;

  return {
    intent: best?.key || null,
    confidence,
    scopeGroup,
    timeRange,
    drilldownKey: best?.drilldownKey || null,
    title: best?.title || 'Assistant Result',
    explanation: best
      ? `Matched "${best.title}"${scopeGroup ? ` in ${scopeGroup}` : ''}${timeRange ? ` for ${timeRange}` : ''}.`
      : 'No close analytics intent match found.',
  };
}
