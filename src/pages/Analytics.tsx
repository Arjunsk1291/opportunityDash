import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  Building2,
  Clock3,
  RefreshCcw,
  Send,
  TimerReset,
  Trophy,
  Waves,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { OpportunitiesTable } from '@/components/Dashboard/OpportunitiesTable';
import { OpportunityDetailDialog } from '@/components/Dashboard/OpportunityDetailDialog';
import { AdvancedFilters, applyFilters, defaultFilters, type FilterState } from '@/components/Dashboard/AdvancedFilters';
import { useData } from '@/contexts/DataContext';
import { useCurrency } from '@/contexts/CurrencyContext';
import type { Opportunity } from '@/data/opportunityData';
import { getDisplayStatus } from '@/lib/opportunityStatus';

type OpportunityGroup = {
  key: string;
  eoiRows: Opportunity[];
  tenderRows: Opportunity[];
  primary: Opportunity | null;
};

type GroupBucket = {
  key: string;
  label: string;
  count: number;
  percent: number;
  tone: string;
};

type DrilldownState = {
  title: string;
  rows: Opportunity[];
};

const TIME_RANGE_OPTIONS = [
  { label: '30d', value: 30 },
  { label: '60d', value: 60 },
  { label: '90d', value: 90 },
  { label: 'YTD', value: 365 },
  { label: 'All', value: 3650 },
] as const;

const JOURNEY_NODE_TONES = {
  primary: 'border-sky-200 bg-sky-50 text-sky-800',
  info: 'border-cyan-200 bg-cyan-50 text-cyan-800',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
  danger: 'border-rose-200 bg-rose-50 text-rose-800',
  muted: 'border-slate-200 bg-slate-50 text-slate-700',
} as const;

const POST_BID_TYPE_LABELS: Record<string, string> = {
  TECHNICAL_CLARIFICATION_MEETING: 'Technical Clarification Meeting',
  TECHNICAL_PRESENTATION: 'Technical Presentation',
  NO_RESPONSE: 'No Activity',
  OTHER: 'Other',
};

const LOSS_REASON_THEMES = [
  { label: 'Price / Commercial', patterns: ['price', 'pricing', 'commercial', 'cost', 'budget', 'rate', 'too high', 'higher', 'lowest bidder', 'l1', 'quote'] },
  { label: 'Technical / Compliance', patterns: ['technical', 'specification', 'spec', 'compliance', 'non compliant', 'qualification', 'qualified', 'experience', 'methodology', 'tbe'] },
  { label: 'Client / Internal Decision', patterns: ['client decision', 'internal', 'management decision', 'business decision', 'strategy', 'strategic', 'not shortlisted', 'shortlist', 'not selected', 'selected other'] },
  { label: 'Competitor / Incumbent', patterns: ['competitor', 'competition', 'incumbent', 'alternate vendor', 'other bidder', 'existing contractor'] },
  { label: 'Schedule / Timeline', patterns: ['timeline', 'delay', 'deadline', 'time', 'late', 'postponed', 'deferred', 'rescheduled', 'expired'] },
  { label: 'Scope / Resource Fit', patterns: ['scope', 'resource', 'resourcing', 'capacity', 'bandwidth', 'manpower', 'fit', 'not in scope', 'outside scope'] },
  { label: 'No Response / Dormant', patterns: ['no response', 'silent', 'no update', 'awaiting', 'pending response', 'dormant', 'not reverted'] },
  { label: 'Cancelled / On Hold', patterns: ['cancel', 'cancelled', 'hold', 'closed', 'stopped', 'suspended'] },
] as const;

const POST_BID_THEMES = [
  { label: 'Technical Clarification Meeting', patterns: ['clarification', 'tcm', 'clarification meeting', 'technical clarification'] },
  { label: 'Technical Presentation', patterns: ['presentation', 'technical presentation', 'demo', 'demonstration', 'workshop'] },
  { label: 'Site Visit', patterns: ['site visit', 'visit', 'inspection', 'walkdown', 'survey'] },
  { label: 'Commercial Negotiation', patterns: ['commercial', 'negotiation', 'price discussion', 'pricing discussion', 'commercial clarification'] },
  { label: 'Best & Final Offer', patterns: ['best and final', 'best & final', 'bafo', 'final offer'] },
  { label: 'Document Resubmission', patterns: ['resubmit', 'resubmission', 'clarification response', 're-submit', 're submission'] },
  { label: 'Client Follow-Up', patterns: ['follow up', 'follow-up', 'meeting', 'discussion', 'client call', 'client feedback'] },
  { label: 'No Activity', patterns: ['no activity', 'no response', 'silent', 'awaiting', 'pending'] },
] as const;

const normalizeText = (value: string | null | undefined) => String(value || '').trim();
const normalizeTextLower = (value: string | null | undefined) => normalizeText(value).toLowerCase();
const normalizeRefNo = (value: string | null | undefined) => normalizeText(value).toUpperCase();
const getBaseRefNo = (value: string | null | undefined) => normalizeRefNo(value).replace(/_EOI$/i, '');
const isEoiRefNo = (value: string | null | undefined) => /_EOI$/i.test(normalizeRefNo(value));
const normalizeComparisonText = (value: string | null | undefined) => normalizeText(value).toLowerCase();
const safePercent = (numerator: number, denominator: number) => (denominator > 0 ? (numerator / denominator) * 100 : 0);
const clampPercent = (value: number) => Math.max(0, Math.min(100, value));

const parseFlexibleTimestamp = (value: string | null | undefined) => {
  const raw = normalizeText(value);
  if (!raw) return 0;
  if (/^\d{4}$/.test(raw)) {
    return Date.UTC(Number(raw), 0, 1);
  }
  if (/^\d{4}-\d{2}$/.test(raw)) {
    const [year, month] = raw.split('-').map(Number);
    return Date.UTC(year, month - 1, 1);
  }
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const formatCompactNumber = (value: number) => new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: value >= 1000 ? 1 : 0,
}).format(value || 0);

const formatPercent = (value: number) => `${Number.isFinite(value) ? value.toFixed(1) : '0.0'}%`;
const QUICK_RANGE_CUSTOM = -1;

const formatMonthLabel = (value: string) => {
  if (!value || value.length < 7) return 'Unknown';
  const parsed = new Date(`${value}-01T00:00:00`);
  return parsed.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
};

const getMonthKey = (value: string | null | undefined) => {
  const timestamp = parseFlexibleTimestamp(value);
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
};

const getQuickRangeDateConfig = (days: number): Pick<FilterState, 'datePreset' | 'dateRange'> => {
  if (days >= 3650) {
    return {
      datePreset: 'all',
      dateRange: { from: undefined, to: undefined },
    };
  }

  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  return {
    datePreset: 'custom',
    dateRange: { from, to },
  };
};

const getNormalizedDisplayStatus = (opp: Partial<Opportunity>) => normalizeText(getDisplayStatus(opp)).toUpperCase();
const getAnalyticsJourneyType = (opp: Opportunity) => {
  const type = normalizeText(opp.opportunityClassification).toUpperCase();
  if (type === 'TENDER') return 'tender';
  if (type.includes('EOI') || isEoiRefNo(opp.opportunityRefNo)) return 'eoi';
  return 'tender';
};
const isTenderRecord = (opp: Opportunity) => getAnalyticsJourneyType(opp) === 'tender';
const isEoiRecord = (opp: Opportunity) => getAnalyticsJourneyType(opp) === 'eoi';
const isLifecycleTenderStatus = (status: string) => ['SUBMITTED', 'AWARDED', 'LOST', 'REGRETTED', 'HOLD / CLOSED', 'HOLD/CLOSED'].includes(status);
const isHoldStatus = (status: string) => status === 'HOLD / CLOSED' || status === 'HOLD/CLOSED';
const hasPostBidDetails = (opp: Partial<Opportunity>) => Boolean(normalizeText(opp.postBidDetailType));
const hasRemarks = (opp: Partial<Opportunity>) => Boolean(normalizeText(opp.remarksReason || opp.comments));

const getStageRank = (opp: Opportunity) => {
  const status = getDisplayStatus(opp);
  if (status === 'AWARDED') return 6;
  if (status === 'LOST' || status === 'REGRETTED') return 5;
  if (status === 'SUBMITTED') return 4;
  if (status === 'ONGOING') return 3;
  if (status === 'WORKING') return 2;
  if (status === 'TO START') return 1;
  return 0;
};

const hideConvertedEoiDuplicates = (data: Opportunity[]) => (
  data.filter((opp) => {
    if (!isEoiRefNo(opp.opportunityRefNo)) return true;

    const baseRefNo = normalizeComparisonText(getBaseRefNo(opp.opportunityRefNo));
    const tenderName = normalizeComparisonText(opp.tenderName);
    if (!baseRefNo || !tenderName) return true;

    const convertedTenderExists = data.some((candidate) => (
      candidate.id !== opp.id
      && getAnalyticsJourneyType(candidate) === 'tender'
      && normalizeComparisonText(candidate.opportunityRefNo) === baseRefNo
      && normalizeComparisonText(candidate.tenderName) === tenderName
    ));

    return !convertedTenderExists;
  })
);

const pickPrimaryOpportunity = (items: Opportunity[]) => {
  if (!items.length) return null;
  return [...items].sort((a, b) => {
    const tenderDiff = Number(isTenderRecord(b)) - Number(isTenderRecord(a));
    if (tenderDiff !== 0) return tenderDiff;

    const stageDiff = getStageRank(b) - getStageRank(a);
    if (stageDiff !== 0) return stageDiff;

    return parseFlexibleTimestamp(b.tenderSubmittedDate || b.dateTenderReceived) - parseFlexibleTimestamp(a.tenderSubmittedDate || a.dateTenderReceived);
  })[0];
};

const getBusinessKey = (opp: Opportunity, index: number) => {
  const ref = getBaseRefNo(opp.opportunityRefNo);
  const tenderName = normalizeTextLower(opp.tenderName);
  const clientName = normalizeTextLower(opp.clientName);
  if (ref) return `ref::${ref}`;
  if (clientName && tenderName) return `client::${clientName}::${tenderName}`;
  if (ref) return ref;
  if (tenderName) return tenderName;
  return `untitled-${index}`;
};

const buildOpportunityGroups = (opportunities: Opportunity[]) => {
  const grouped = new Map<string, OpportunityGroup>();

  opportunities.forEach((opp, index) => {
    const key = getBusinessKey(opp, index);
    const current = grouped.get(key) || { key, eoiRows: [], tenderRows: [], primary: null };
    if (isEoiRecord(opp)) current.eoiRows.push(opp);
    if (isTenderRecord(opp)) current.tenderRows.push(opp);
    current.primary = pickPrimaryOpportunity([...current.eoiRows, ...current.tenderRows]);
    grouped.set(key, current);
  });

  return Array.from(grouped.values());
};

const getRepresentativeRow = (items: Opportunity[]) => pickPrimaryOpportunity(items);
const getGroupStatus = (group: OpportunityGroup) => getNormalizedDisplayStatus(group.primary || {});
const getGroupClient = (group: OpportunityGroup) => normalizeText(group.primary?.clientName || group.eoiRows[0]?.clientName || group.tenderRows[0]?.clientName) || 'Unknown';
const getGroupValue = (group: OpportunityGroup) => Number(group.primary?.opportunityValue || group.tenderRows[0]?.opportunityValue || 0);
const getEarliestEoiTimestamp = (group: OpportunityGroup) => {
  const timestamps = group.eoiRows.map((row) => parseFlexibleTimestamp(row.dateTenderReceived || row.tenderSubmittedDate)).filter(Boolean);
  return timestamps.length ? Math.min(...timestamps) : 0;
};
const getEarliestTenderTimestamp = (group: OpportunityGroup) => {
  const timestamps = group.tenderRows.map((row) => parseFlexibleTimestamp(row.dateTenderReceived || row.tenderSubmittedDate)).filter(Boolean);
  return timestamps.length ? Math.min(...timestamps) : 0;
};
const getSubmittedTimestamp = (group: OpportunityGroup) => {
  const timestamps = group.tenderRows.map((row) => parseFlexibleTimestamp(row.tenderSubmittedDate)).filter(Boolean);
  return timestamps.length ? Math.min(...timestamps) : 0;
};
const getDayDiff = (fromTimestamp: number, toTimestamp: number) => {
  if (!fromTimestamp || !toTimestamp || toTimestamp < fromTimestamp) return 0;
  return Math.round((toTimestamp - fromTimestamp) / (1000 * 60 * 60 * 24));
};
const average = (values: number[]) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0);

const getMatchedTenderRows = (group: OpportunityGroup) => {
  if (!group.eoiRows.length) return group.tenderRows;
  return group.tenderRows.filter((row) => isTenderRecord(row));
};

const getLifecycleTenderRows = (group: OpportunityGroup) => group.tenderRows.filter((row) => isLifecycleTenderStatus(getNormalizedDisplayStatus(row)));
const getAwardedRows = (group: OpportunityGroup) => group.tenderRows.filter((row) => getNormalizedDisplayStatus(row) === 'AWARDED');
const getLostRows = (group: OpportunityGroup) => group.tenderRows.filter((row) => getNormalizedDisplayStatus(row) === 'LOST');
const getRegrettedRows = (group: OpportunityGroup) => group.tenderRows.filter((row) => getNormalizedDisplayStatus(row) === 'REGRETTED');
const getHoldRows = (group: OpportunityGroup) => group.tenderRows.filter((row) => isHoldStatus(getNormalizedDisplayStatus(row)));
const getSubmittedOnlyRows = (group: OpportunityGroup) => group.tenderRows.filter((row) => getNormalizedDisplayStatus(row) === 'SUBMITTED');
const hasConvertedTender = (group: OpportunityGroup) => getMatchedTenderRows(group).length > 0;
const hasSubmittedTender = (group: OpportunityGroup) => getSubmittedOnlyRows(group).length > 0;
const isAwardedGroup = (group: OpportunityGroup) => getAwardedRows(group).length > 0;
const isLostGroup = (group: OpportunityGroup) => getLostRows(group).length > 0;
const isRegrettedGroup = (group: OpportunityGroup) => getRegrettedRows(group).length > 0;
const isHoldGroup = (group: OpportunityGroup) => getHoldRows(group).length > 0;
const hasLifecycleTender = (group: OpportunityGroup) => getLifecycleTenderRows(group).length > 0;
const getNoDecisionSubmittedRows = (group: OpportunityGroup) => (
  getSubmittedOnlyRows(group).filter((row) => !hasPostBidDetails(row) && !hasRemarks(row))
);
const isNoDecisionGroup = (group: OpportunityGroup, selectedGroup: string) => (
  selectedGroup === 'GTS'
  && getNoDecisionSubmittedRows(group).length > 0
);
const getPureEoiRow = (group: OpportunityGroup) => getRepresentativeRow(group.eoiRows) || group.primary;
const getConvertedTenderRow = (group: OpportunityGroup) => getRepresentativeRow(getMatchedTenderRows(group)) || getRepresentativeRow(group.tenderRows);
const getLifecycleTenderRow = (group: OpportunityGroup) => getRepresentativeRow(getLifecycleTenderRows(group)) || getConvertedTenderRow(group);
const getSubmittedRow = (group: OpportunityGroup) => getRepresentativeRow(getSubmittedOnlyRows(group)) || getConvertedTenderRow(group);
const getAwardedRow = (group: OpportunityGroup) => getRepresentativeRow(getAwardedRows(group)) || getSubmittedRow(group);
const getLostRow = (group: OpportunityGroup) => getRepresentativeRow(getLostRows(group)) || getSubmittedRow(group);
const getRegrettedRow = (group: OpportunityGroup) => getRepresentativeRow(getRegrettedRows(group)) || getSubmittedRow(group);
const getHoldRow = (group: OpportunityGroup) => getRepresentativeRow(getHoldRows(group)) || getSubmittedRow(group);
const getNoDecisionRow = (group: OpportunityGroup) => getRepresentativeRow(getNoDecisionSubmittedRows(group)) || getSubmittedRow(group);

const resolveThemeFromText = (
  text: string,
  themes: ReadonlyArray<{ label: string; patterns: readonly string[] }>,
  fallbackLabel: string,
) => {
  const normalized = normalizeTextLower(text);
  if (!normalized) return fallbackLabel;

  let bestLabel = fallbackLabel;
  let bestScore = 0;

  for (const theme of themes) {
    const score = theme.patterns.reduce((sum, pattern) => (
      normalized.includes(pattern) ? sum + Math.max(pattern.split(' ').length, 1) : sum
    ), 0);
    if (score > bestScore) {
      bestScore = score;
      bestLabel = theme.label;
    }
  }

  return bestLabel;
};

const categorizeLossReason = (text: string) => resolveThemeFromText(text, LOSS_REASON_THEMES, 'Other / Unspecified');

const getEoiAgingBucket = (days: number) => {
  if (days <= 15) return '0-15';
  if (days <= 30) return '16-30';
  if (days <= 60) return '31-60';
  return '60+';
};

const getTenderAgingBucket = (days: number) => {
  if (days <= 30) return '0-30';
  if (days <= 60) return '31-60';
  return '60+';
};

const getPostBidAnalysisText = (opp: Partial<Opportunity>) => (
  [
    opp.postBidDetailType,
    opp.postBidDetailOther,
    opp.remarksReason,
    opp.comments,
  ].map((value) => normalizeText(value)).filter(Boolean).join(' ')
);

const getPostBidLabel = (opp: Partial<Opportunity>) => {
  const normalizedType = normalizeText(opp.postBidDetailType).toUpperCase();
  if (normalizedType && normalizedType !== 'OTHER') {
    return POST_BID_TYPE_LABELS[normalizedType] || normalizedType;
  }

  const inferred = resolveThemeFromText(getPostBidAnalysisText(opp), POST_BID_THEMES, '');
  if (inferred) return inferred;
  if (normalizedType === 'OTHER' || normalizeText(opp.postBidDetailOther)) return 'Other';
  return 'No Activity';
};

const buildSparklinePoints = (values: number[]) => {
  if (!values.length) return '0,18 100,18';
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  return values.map((value, index) => {
    const x = (index / Math.max(values.length - 1, 1)) * 100;
    const y = 20 - (((value - min) / range) * 18 + 1);
    return `${x},${y}`;
  }).join(' ');
};

const AnimatedCounter = ({
  value,
  format = (next) => String(Math.round(next)),
  duration = 1000,
  animateKey,
}: {
  value: number;
  format?: (value: number) => string;
  duration?: number;
  animateKey: number | string;
}) => {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    let frame = 0;
    const start = performance.now();

    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(value * eased);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration, animateKey]);

  return <>{format(displayValue)}</>;
};

const Sparkline = ({ values, className = '' }: { values: number[]; className?: string }) => (
  <svg viewBox="0 0 100 24" className={className} preserveAspectRatio="none">
    <polyline
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      points={buildSparklinePoints(values)}
    />
  </svg>
);

const GaugeCard = ({
  label,
  value,
  colorClass,
  description,
  animateKey,
}: {
  label: string;
  value: number;
  colorClass: string;
  description: string;
  animateKey: number;
}) => {
  const circumference = 2 * Math.PI * 42;
  const dashOffset = circumference - (clampPercent(value) / 100) * circumference;

  return (
    <div className="analytics-card relative overflow-hidden p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="dash-label">{label}</div>
        <div className={`h-2 w-2 rounded-full ${colorClass} animate-pulse`} />
      </div>
      <div className="flex items-center gap-5">
        <div className="relative h-28 w-28 shrink-0">
          <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
            <circle cx="50" cy="50" r="42" stroke="hsl(var(--muted))" strokeWidth="6" fill="transparent" />
            <circle
              cx="50"
              cy="50"
              r="42"
              stroke="currentColor"
              strokeWidth="6"
              fill="transparent"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              className={colorClass}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center text-center">
            <div>
              <div className="text-2xl font-extrabold tracking-tight text-slate-950">
                <AnimatedCounter value={value} format={(next) => `${next.toFixed(1)}%`} animateKey={animateKey} />
              </div>
              <div className="text-[10px] uppercase tracking-[0.24em] text-slate-400">Rate</div>
            </div>
          </div>
        </div>
        <p className="text-sm leading-6 text-slate-500">{description}</p>
      </div>
    </div>
  );
};

const FlowNode = ({
  label,
  count,
  percent,
  tone,
}: {
  label: string;
  count: number;
  percent?: number;
  tone: keyof typeof JOURNEY_NODE_TONES;
}) => (
  <div className={`analytics-flow-node ${JOURNEY_NODE_TONES[tone]}`}>
    <div className="text-[11px] font-semibold uppercase tracking-[0.18em]">{label}</div>
    <div className="mt-3 text-3xl font-extrabold tracking-tight">{formatCompactNumber(count)}</div>
    {percent !== undefined && <div className="mt-2 text-xs opacity-80">{formatPercent(percent)}</div>}
  </div>
);

const Analytics = () => {
  const { opportunities, isLoading, error } = useData();
  const { formatCurrency } = useCurrency();
  const initialQuickRange = 3650;
  const [filters, setFilters] = useState<FilterState>(() => ({
    ...defaultFilters,
    ...getQuickRangeDateConfig(initialQuickRange),
  }));
  const [quickRange, setQuickRange] = useState<number>(initialQuickRange);
  const [refreshKey, setRefreshKey] = useState(0);
  const [drilldown, setDrilldown] = useState<DrilldownState | null>(null);
  const [selectedOpportunity, setSelectedOpportunity] = useState<Opportunity | null>(null);
  const [heatmapYear, setHeatmapYear] = useState('ALL');
  const [heatmapSearch, setHeatmapSearch] = useState('');

  const groupOptions = useMemo(() => {
    const groups = Array.from(new Set(opportunities.map((opp) => normalizeText(opp.groupClassification)).filter(Boolean))).sort((a, b) => a.localeCompare(b));
    return ['ALL', ...groups];
  }, [opportunities]);

  const scopedOpportunities = useMemo(() => applyFilters(opportunities, filters), [opportunities, filters]);

  const groupedOpportunities = useMemo(() => buildOpportunityGroups(scopedOpportunities), [scopedOpportunities]);

  const analytics = useMemo(() => {
    const eoiOriginGroups = groupedOpportunities.filter((group) => group.eoiRows.length > 0);
    const pureEoiGroups = eoiOriginGroups.filter((group) => !hasConvertedTender(group));
    const eoiOriginTenderGroups = eoiOriginGroups.filter(hasConvertedTender);
    const eoiOriginSubmittedGroups = eoiOriginTenderGroups.filter(hasSubmittedTender);
    const eoiOriginAwardedGroups = eoiOriginTenderGroups.filter(isAwardedGroup);
    const eoiOriginLostGroups = eoiOriginTenderGroups.filter(isLostGroup);
    const eoiOriginRegrettedGroups = eoiOriginTenderGroups.filter(isRegrettedGroup);
    const eoiOriginHoldGroups = eoiOriginTenderGroups.filter(isHoldGroup);
    const selectedSingleGroup = filters.groups.length === 1 ? filters.groups[0] : 'ALL';
    const eoiOriginOpenDecisionGroups = eoiOriginTenderGroups.filter((group) => isNoDecisionGroup(group, selectedSingleGroup));
    const eoiOriginLifecycleGroups = eoiOriginTenderGroups.filter(hasLifecycleTender);

    const directTenderGroups = groupedOpportunities.filter((group) => group.eoiRows.length === 0 && group.tenderRows.length > 0);
    const directSubmittedGroups = directTenderGroups.filter(hasSubmittedTender);
    const directAwardedGroups = directTenderGroups.filter(isAwardedGroup);
    const directLostGroups = directTenderGroups.filter(isLostGroup);
    const directRegrettedGroups = directTenderGroups.filter(isRegrettedGroup);
    const directHoldGroups = directTenderGroups.filter(isHoldGroup);
    const directOpenDecisionGroups = directTenderGroups.filter((group) => isNoDecisionGroup(group, selectedSingleGroup));
    const directLifecycleGroups = directTenderGroups.filter(hasLifecycleTender);

    const flattenRows = (groups: OpportunityGroup[], selector: (group: OpportunityGroup) => Opportunity[]) => groups.flatMap(selector);
    const flattenAllRows = (groups: OpportunityGroup[]) => groups.flatMap((group) => [...group.eoiRows, ...group.tenderRows]);

    const eoiOriginSubmittedRows = flattenRows(eoiOriginTenderGroups, getSubmittedOnlyRows);
    const eoiOriginWonRows = flattenRows(eoiOriginTenderGroups, getAwardedRows);
    const eoiOriginLostRows = flattenRows(eoiOriginTenderGroups, getLostRows);
    const eoiOriginRegrettedRows = flattenRows(eoiOriginTenderGroups, getRegrettedRows);
    const eoiOriginHoldRows = flattenRows(eoiOriginTenderGroups, getHoldRows);
    const eoiOriginNoDecisionRows = flattenRows(eoiOriginTenderGroups, getNoDecisionSubmittedRows);

    const directSubmittedRows = flattenRows(directTenderGroups, getSubmittedOnlyRows);
    const directWonRows = flattenRows(directTenderGroups, getAwardedRows);
    const directLostRows = flattenRows(directTenderGroups, getLostRows);
    const directRegrettedRows = flattenRows(directTenderGroups, getRegrettedRows);
    const directHoldRows = flattenRows(directTenderGroups, getHoldRows);
    const directNoDecisionRows = flattenRows(directTenderGroups, getNoDecisionSubmittedRows);
    const eoiOriginAllRows = flattenAllRows(eoiOriginGroups);
    const directAllRows = flattenAllRows(directTenderGroups);
    const eoiOriginReceivedRows = flattenRows(eoiOriginGroups, (group) => group.eoiRows);
    const directReceivedRows = flattenRows(directTenderGroups, (group) => group.tenderRows);
    const eoiOriginBecameTenderRows = flattenRows(eoiOriginTenderGroups, (group) => group.tenderRows);

    const submittedRows = [...eoiOriginSubmittedRows, ...directSubmittedRows];
    const wonRows = [...eoiOriginWonRows, ...directWonRows];
    const lostRows = [...eoiOriginLostRows, ...directLostRows];
    const regrettedRows = [...eoiOriginRegrettedRows, ...directRegrettedRows];
    const holdRows = [...eoiOriginHoldRows, ...directHoldRows];
    const noDecisionRows = [...eoiOriginNoDecisionRows, ...directNoDecisionRows];

    const submittedGroups = [...eoiOriginSubmittedGroups, ...directSubmittedGroups];
    const wonGroups = [...eoiOriginAwardedGroups, ...directAwardedGroups];
    const lostGroups = [...eoiOriginLostGroups, ...directLostGroups];
    const noDecisionGroups = [...eoiOriginOpenDecisionGroups, ...directOpenDecisionGroups];
    const lifecycleGroups = [...eoiOriginLifecycleGroups, ...directLifecycleGroups];

    const submittedValue = submittedRows.reduce((sum, row) => sum + Number(row.opportunityValue || 0), 0);
    const wonValue = wonRows.reduce((sum, row) => sum + Number(row.opportunityValue || 0), 0);
    const lifecycleRows = flattenRows(lifecycleGroups, getLifecycleTenderRows);
    const lifecycleValue = lifecycleRows.reduce((sum, row) => sum + Number(row.opportunityValue || 0), 0);

    const conversionLagDays = eoiOriginTenderGroups
      .map((group) => getDayDiff(getEarliestEoiTimestamp(group), getEarliestTenderTimestamp(group)))
      .filter((days) => days > 0);

    const clientRows = Object.values(
      eoiOriginGroups.reduce((acc, group) => {
        const client = getGroupClient(group);
        if (!acc[client]) {
          acc[client] = {
            client,
            eoiCount: 0,
            tenderCount: 0,
            wonCount: 0,
            conversionRate: 0,
            winRate: 0,
          };
        }
        acc[client].eoiCount += 1;
        if (hasConvertedTender(group)) acc[client].tenderCount += 1;
        if (isAwardedGroup(group)) acc[client].wonCount += 1;
        return acc;
      }, {} as Record<string, { client: string; eoiCount: number; tenderCount: number; wonCount: number; conversionRate: number; winRate: number }>),
    )
      .map((row) => ({
        ...row,
        conversionRate: safePercent(row.tenderCount, row.eoiCount),
        winRate: safePercent(row.wonCount, row.tenderCount),
      }))
      .sort((a, b) => b.conversionRate - a.conversionRate || b.eoiCount - a.eoiCount)
      .slice(0, 12);

    const eoiAgingBuckets = Object.entries(
      pureEoiGroups.reduce<Record<string, number>>((acc, group) => {
        const ageDays = getDayDiff(getEarliestEoiTimestamp(group), Date.now());
        const bucket = getEoiAgingBucket(ageDays);
        acc[bucket] = (acc[bucket] || 0) + 1;
        return acc;
      }, { '0-15': 0, '16-30': 0, '31-60': 0, '60+': 0 }),
    ).map(([key, count]) => ({
      key,
      label: key === '0-15' ? 'Warm' : key === '16-30' ? 'Cooling' : key === '31-60' ? 'Cold' : 'Stale',
      count,
      percent: safePercent(count, pureEoiGroups.length),
      tone: key === '0-15' ? 'bg-sky-500' : key === '16-30' ? 'bg-slate-400' : key === '31-60' ? 'bg-amber-500' : 'bg-rose-500',
    })) satisfies GroupBucket[];

    const tenderAgingBuckets = Object.entries(
      noDecisionGroups.reduce<Record<string, number>>((acc, group) => {
        const ageDays = getDayDiff(getSubmittedTimestamp(group), Date.now());
        const bucket = getTenderAgingBucket(ageDays);
        acc[bucket] = (acc[bucket] || 0) + 1;
        return acc;
      }, { '0-30': 0, '31-60': 0, '60+': 0 }),
    ).map(([key, count]) => ({
      key,
      label: key === '0-30' ? 'Fresh' : key === '31-60' ? 'Warming' : 'Overdue',
      count,
      percent: safePercent(count, noDecisionGroups.length),
      tone: key === '0-30' ? 'bg-emerald-500' : key === '31-60' ? 'bg-amber-500' : 'bg-rose-500',
    })) satisfies GroupBucket[];

    const lossReasons = Object.entries(
      lostRows.reduce<Record<string, number>>((acc, lostRow) => {
        const category = categorizeLossReason(normalizeText(lostRow?.remarksReason || lostRow?.comments));
        acc[category] = (acc[category] || 0) + 1;
        return acc;
      }, {}),
    )
      .map(([label, count]) => ({ label, count, percent: safePercent(count, Math.max(lostRows.length, 1)) }))
      .sort((a, b) => b.count - a.count);

    const postBidBreakdown = Object.entries(
      lifecycleGroups.reduce<Record<string, number>>((acc, group) => {
        const tenderRow = getLifecycleTenderRow(group);
        const label = getPostBidLabel(tenderRow || {});
        acc[label] = (acc[label] || 0) + 1;
        return acc;
      }, {
        'Technical Clarification Meeting': 0,
        'Technical Presentation': 0,
        'Site Visit': 0,
        'Commercial Negotiation': 0,
        'Best & Final Offer': 0,
        'Document Resubmission': 0,
        'Client Follow-Up': 0,
        'No Activity': 0,
        Other: 0,
      }),
    )
      .map(([label, count]) => ({ label, count, percent: safePercent(count, Math.max(lifecycleGroups.length, 1)) }))
      .filter((row) => row.count > 0 || row.label === 'No Activity')
      .map((row) => {
        if (row.label === 'Technical Clarification Meeting') return { ...row, color: 'bg-cyan-500' };
        if (row.label === 'Technical Presentation') return { ...row, color: 'bg-blue-600' };
        if (row.label === 'Site Visit') return { ...row, color: 'bg-emerald-500' };
        if (row.label === 'Commercial Negotiation') return { ...row, color: 'bg-violet-500' };
        if (row.label === 'Best & Final Offer') return { ...row, color: 'bg-amber-500' };
        if (row.label === 'Document Resubmission') return { ...row, color: 'bg-orange-500' };
        if (row.label === 'Client Follow-Up') return { ...row, color: 'bg-sky-500' };
        if (row.label === 'No Activity') return { ...row, color: 'bg-slate-300' };
        return { ...row, color: 'bg-fuchsia-500' };
      });

    const monthlyStatusMap = new Map<string, { month: string; Received: number; Submitted: number; Won: number; Outcome: number }>();
    const allMonthKeys = new Set<string>();

    groupedOpportunities.forEach((group) => {
      const receivedRow = getPureEoiRow(group) || getConvertedTenderRow(group) || group.primary;
      const submittedRow = getSubmittedRow(group);
      const wonRow = getAwardedRow(group);
      const outcomeRow = getLostRow(group) || getRegrettedRow(group) || getHoldRow(group);

      const receivedMonth = getMonthKey(receivedRow?.dateTenderReceived || receivedRow?.tenderSubmittedDate);
      if (receivedMonth) {
        allMonthKeys.add(receivedMonth);
        const row = monthlyStatusMap.get(receivedMonth) || { month: receivedMonth, Received: 0, Submitted: 0, Won: 0, Outcome: 0 };
        row.Received += 1;
        monthlyStatusMap.set(receivedMonth, row);
      }

      const submittedMonth = getMonthKey(submittedRow?.tenderSubmittedDate || submittedRow?.dateTenderReceived);
      if (submittedMonth) {
        allMonthKeys.add(submittedMonth);
        const row = monthlyStatusMap.get(submittedMonth) || { month: submittedMonth, Received: 0, Submitted: 0, Won: 0, Outcome: 0 };
        row.Submitted += 1;
        monthlyStatusMap.set(submittedMonth, row);
      }

      if (wonRow) {
        const month = getMonthKey(wonRow.postBidDetailUpdatedAt || wonRow.tenderSubmittedDate || wonRow.dateTenderReceived);
        if (month) {
          allMonthKeys.add(month);
          const row = monthlyStatusMap.get(month) || { month: month, Received: 0, Submitted: 0, Won: 0, Outcome: 0 };
          row.Won += 1;
          monthlyStatusMap.set(month, row);
        }
      }

      if (outcomeRow) {
        const month = getMonthKey(outcomeRow.postBidDetailUpdatedAt || outcomeRow.tenderSubmittedDate || outcomeRow.dateTenderReceived);
        if (month) {
          allMonthKeys.add(month);
          const row = monthlyStatusMap.get(month) || { month, Received: 0, Submitted: 0, Won: 0, Outcome: 0 };
          row.Outcome += 1;
          monthlyStatusMap.set(month, row);
        }
      }
    });

    const monthColumns = Array.from(allMonthKeys).sort((a, b) => a.localeCompare(b));
    const monthlyHeatmap = ['Received', 'Submitted', 'Won', 'Outcome'].map((status) => ({
      status,
      values: monthColumns.map((month) => ({
        month,
        value: monthlyStatusMap.get(month)?.[status as 'Received' | 'Submitted' | 'Won' | 'Outcome'] || 0,
      })),
    }));

    const staleEoiRows = pureEoiGroups
      .map((group) => ({
        refNo: normalizeText(getPureEoiRow(group)?.opportunityRefNo || group.primary?.opportunityRefNo),
        tenderName: normalizeText(getPureEoiRow(group)?.tenderName || group.primary?.tenderName) || 'Untitled',
        client: getGroupClient(group),
        ageDays: getDayDiff(getEarliestEoiTimestamp(group), Date.now()),
      }))
      .sort((a, b) => b.ageDays - a.ageDays)
      .slice(0, 6);

    const kpis = {
      submitted: submittedGroups.length,
      won: wonGroups.length,
      lost: lostGroups.length,
      noDecision: noDecisionGroups.length,
    };

    const rowsForGroups = (groups: OpportunityGroup[], selector: (group: OpportunityGroup) => Opportunity | null) => (
      groups.map(selector).filter(Boolean) as Opportunity[]
    );

    return {
      eoiOrigin: {
        eoiCount: eoiOriginGroups.length,
        pureEoiCount: pureEoiGroups.length,
        becameTenderCount: eoiOriginTenderGroups.length,
        submittedCount: eoiOriginSubmittedGroups.length,
        awardedCount: eoiOriginAwardedGroups.length,
        lostCount: eoiOriginLostGroups.length,
        regrettedCount: eoiOriginRegrettedGroups.length,
        holdCount: eoiOriginHoldGroups.length,
        noDecisionCount: eoiOriginOpenDecisionGroups.length,
        conversionRate: safePercent(eoiOriginTenderGroups.length, eoiOriginGroups.length),
        winRate: safePercent(eoiOriginAwardedGroups.length, eoiOriginSubmittedGroups.length),
        decisionRate: safePercent(eoiOriginAwardedGroups.length, eoiOriginAwardedGroups.length + eoiOriginLostGroups.length),
        avgDaysToTender: average(conversionLagDays),
        avgValue: average(eoiOriginTenderGroups.map(getGroupValue)),
      },
      directTender: {
        tenderCount: directTenderGroups.length,
        submittedCount: directSubmittedGroups.length,
        awardedCount: directAwardedGroups.length,
        lostCount: directLostGroups.length,
        regrettedCount: directRegrettedGroups.length,
        holdCount: directHoldGroups.length,
        noDecisionCount: directOpenDecisionGroups.length,
        winRate: safePercent(directAwardedGroups.length, directSubmittedGroups.length),
        decisionRate: safePercent(directAwardedGroups.length, directAwardedGroups.length + directLostGroups.length),
        avgValue: average(directTenderGroups.map(getGroupValue)),
      },
      overall: {
        submittedCount: submittedRows.length,
        wonCount: wonRows.length,
        lostCount: lostRows.length,
        regrettedCount: regrettedRows.length,
        holdCount: holdRows.length,
        noDecisionCount: noDecisionRows.length,
        countWinRate: safePercent(wonRows.length, lifecycleRows.length),
        valueWinRate: safePercent(wonValue, lifecycleValue),
        decisionRate: safePercent(wonRows.length, wonRows.length + lostRows.length + regrettedRows.length + holdRows.length),
        submittedValue,
        wonValue,
      },
      comparisonRows: [
        { label: 'Received', eoiOrigin: eoiOriginReceivedRows.length, direct: directReceivedRows.length },
        { label: 'Became Tender', eoiOrigin: eoiOriginBecameTenderRows.length, direct: null },
        { label: 'Submitted', eoiOrigin: eoiOriginSubmittedRows.length, direct: directSubmittedRows.length },
        { label: 'Won', eoiOrigin: eoiOriginWonRows.length, direct: directWonRows.length },
        { label: 'Lost', eoiOrigin: eoiOriginLostRows.length, direct: directLostRows.length },
        { label: 'Regretted', eoiOrigin: eoiOriginRegrettedRows.length, direct: directRegrettedRows.length },
        { label: 'Hold', eoiOrigin: eoiOriginHoldRows.length, direct: directHoldRows.length },
        ...(selectedSingleGroup === 'GTS' ? [{ label: 'No Decision', eoiOrigin: eoiOriginNoDecisionRows.length, direct: directNoDecisionRows.length }] : []),
      ],
      clientRows,
      eoiAgingBuckets,
      tenderAgingBuckets,
      lossReasons,
      postBidBreakdown,
      monthColumns,
      monthlyHeatmap,
      staleEoiRows,
      sparklineSeed: [submittedRows.length, wonRows.length, lostRows.length, noDecisionRows.length],
      drilldowns: {
        lifecycle: rowsForGroups(lifecycleGroups, getLifecycleTenderRow),
        submitted: submittedRows,
        eoiSubmitted: rowsForGroups(eoiOriginSubmittedGroups, getSubmittedRow),
        directSubmitted: rowsForGroups(directSubmittedGroups, getSubmittedRow),
        won: wonRows,
        eoiWon: rowsForGroups(eoiOriginAwardedGroups, getAwardedRow),
        directWon: rowsForGroups(directAwardedGroups, getAwardedRow),
        lost: lostRows,
        eoiLost: rowsForGroups(eoiOriginLostGroups, getLostRow),
        directLost: rowsForGroups(directLostGroups, getLostRow),
        regretted: regrettedRows,
        eoiRegretted: rowsForGroups(eoiOriginRegrettedGroups, getRegrettedRow),
        directRegretted: rowsForGroups(directRegrettedGroups, getRegrettedRow),
        hold: holdRows,
        eoiHold: rowsForGroups(eoiOriginHoldGroups, getHoldRow),
        directHold: rowsForGroups(directHoldGroups, getHoldRow),
        noDecision: noDecisionRows,
        eoiNoDecision: rowsForGroups(eoiOriginOpenDecisionGroups, getNoDecisionRow),
        directNoDecision: rowsForGroups(directOpenDecisionGroups, getNoDecisionRow),
        eoiReceived: eoiOriginReceivedRows,
        pureEoi: rowsForGroups(pureEoiGroups, getPureEoiRow),
        becameTender: eoiOriginBecameTenderRows,
        directTenders: directReceivedRows,
        receivedAll: rowsForGroups(groupedOpportunities, (group) => getPureEoiRow(group) || getConvertedTenderRow(group) || group.primary),
        outcomeAll: [
          ...lostRows,
          ...regrettedRows,
          ...holdRows,
        ],
        eoiOriginAll: eoiOriginAllRows,
        directAll: directAllRows,
      },
    };
  }, [groupedOpportunities, filters.groups]);

  const availableHeatmapYears = useMemo(
    () => Array.from(new Set(analytics.monthColumns.map((month) => month.slice(0, 4)))).sort((a, b) => a.localeCompare(b)),
    [analytics.monthColumns],
  );
  const effectiveHeatmapYear = heatmapYear === 'LATEST' ? (availableHeatmapYears.at(-1) || 'ALL') : heatmapYear;
  const filteredHeatmapMonths = useMemo(() => {
    const searchTerm = heatmapSearch.trim().toLowerCase();
    return analytics.monthColumns.filter((month) => {
      if (effectiveHeatmapYear !== 'ALL' && !month.startsWith(`${effectiveHeatmapYear}-`)) return false;
      if (!searchTerm) return true;
      return formatMonthLabel(month).toLowerCase().includes(searchTerm) || month.toLowerCase().includes(searchTerm);
    });
  }, [analytics.monthColumns, effectiveHeatmapYear, heatmapSearch]);
  const filteredHeatmapMonthSet = useMemo(() => new Set(filteredHeatmapMonths), [filteredHeatmapMonths]);
  const displayedHeatmap = useMemo(
    () => analytics.monthlyHeatmap.map((row) => ({
      ...row,
      values: row.values.filter((cell) => filteredHeatmapMonthSet.has(cell.month)),
    })),
    [analytics.monthlyHeatmap, filteredHeatmapMonthSet],
  );

  const openDrilldown = (title: string, rows: Opportunity[]) => {
    setDrilldown({ title, rows });
  };

  const selectedGroup = filters.groups.length === 1 ? filters.groups[0] : 'ALL';
  const scopeLabel = filters.groups.length === 0
    ? 'All Verticals'
    : filters.groups.length === 1
      ? filters.groups[0]
      : `${filters.groups.length} Verticals`;
  const submittedOpportunityRows = useMemo(
    () => scopedOpportunities.filter((row) => getNormalizedDisplayStatus(row) === 'SUBMITTED'),
    [scopedOpportunities],
  );
  const visibleSubmittedOpportunityRows = useMemo(
    () => hideConvertedEoiDuplicates(submittedOpportunityRows),
    [submittedOpportunityRows],
  );
  const submittedTenderCount = useMemo(
    () => visibleSubmittedOpportunityRows.filter((row) => getAnalyticsJourneyType(row) === 'tender').length,
    [visibleSubmittedOpportunityRows],
  );
  const submittedEoiCount = useMemo(
    () => visibleSubmittedOpportunityRows.filter((row) => getAnalyticsJourneyType(row) === 'eoi').length,
    [visibleSubmittedOpportunityRows],
  );
  const monthHeatMax = Math.max(
    1,
    ...analytics.monthlyHeatmap.flatMap((row) => row.values.map((value) => value.value)),
  );
  const negativeOutcomeCount = analytics.overall.lostCount + analytics.overall.regrettedCount + analytics.overall.holdCount;
  const negativeOutcomeEoiCount = analytics.eoiOrigin.lostCount + analytics.eoiOrigin.regrettedCount + analytics.eoiOrigin.holdCount;
  const negativeOutcomeDirectCount = analytics.directTender.lostCount + analytics.directTender.regrettedCount + analytics.directTender.holdCount;

  const kpiCards = [
    {
      label: 'Submitted',
      value: submittedOpportunityRows.length,
      delta: analytics.eoiOrigin.submittedCount,
      direct: analytics.directTender.submittedCount,
      meta: [
        { label: 'Tender', value: submittedTenderCount, tone: 'bg-blue-500' },
        { label: 'EOI', value: submittedEoiCount, tone: 'bg-amber-500' },
      ],
      tone: 'text-sky-600',
      glow: 'analytics-kpi-glow-sky',
      icon: Send,
      sparkline: [submittedTenderCount, submittedEoiCount, submittedOpportunityRows.length, Math.max(submittedOpportunityRows.length - 1, 0)],
      onClick: () => openDrilldown('Submitted Opportunities', submittedOpportunityRows),
    },
    {
      label: 'Won',
      value: analytics.overall.wonCount,
      delta: analytics.eoiOrigin.awardedCount,
      direct: analytics.directTender.awardedCount,
      tone: 'text-emerald-600',
      glow: 'analytics-kpi-glow-emerald',
      icon: Trophy,
      sparkline: [analytics.eoiOrigin.awardedCount, analytics.directTender.awardedCount, analytics.overall.wonCount, Math.max(analytics.overall.wonCount - 1, 0)],
      onClick: () => openDrilldown('Awarded Tenders', analytics.drilldowns.won),
    },
    {
      label: 'Negative Outcome',
      value: negativeOutcomeCount,
      delta: negativeOutcomeEoiCount,
      direct: negativeOutcomeDirectCount,
      chip: `${analytics.overall.regrettedCount} regretted and ${analytics.overall.holdCount} hold`,
      tone: 'text-rose-600',
      glow: 'analytics-kpi-glow-rose',
      icon: XCircle,
      sparkline: [negativeOutcomeEoiCount, negativeOutcomeDirectCount, negativeOutcomeCount, Math.max(negativeOutcomeCount - 1, 0)],
      onClick: () => openDrilldown('Negative Outcomes', [...analytics.drilldowns.lost, ...analytics.drilldowns.regretted, ...analytics.drilldowns.hold]),
    },
    {
      label: 'No Decision',
      value: analytics.overall.noDecisionCount,
      delta: analytics.eoiOrigin.noDecisionCount,
      direct: analytics.directTender.noDecisionCount,
      chip: selectedGroup === 'GTS' ? 'Submitted with no post-bid detail yet' : 'Only shown for GTS scope',
      tone: 'text-amber-600',
      glow: 'analytics-kpi-glow-amber',
      icon: Clock3,
      sparkline: [analytics.eoiOrigin.noDecisionCount, analytics.directTender.noDecisionCount, analytics.overall.noDecisionCount, analytics.overall.noDecisionCount * 0.85],
      onClick: () => openDrilldown('No Decision Tenders', analytics.drilldowns.noDecision),
    },
  ];

  return (
    <div key={refreshKey} className="relative mx-auto max-w-[1400px] px-4 pb-10 sm:px-6 lg:px-8">
      <div className="analytics-ambient pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="analytics-orb analytics-orb-one" />
        <div className="analytics-orb analytics-orb-two" />
        <div className="analytics-orb analytics-orb-three" />
        <div className="analytics-orb analytics-orb-four" />
        <div className="analytics-orb analytics-orb-five" />
      </div>

      <section className="analytics-hero mb-6 overflow-hidden rounded-[28px] p-6 lg:mb-8 lg:p-8">
        <div className="analytics-particles" aria-hidden="true">
          {Array.from({ length: 12 }, (_, index) => (
            <span key={`particle-${index}`} style={{ left: `${(index * 8) + 6}%`, animationDelay: `${index * 0.6}s` }} />
          ))}
        </div>
        <div className="relative z-10 flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/12 backdrop-blur-sm">
                <BarChart3 className="h-6 w-6 text-white animate-[float_6s_ease-in-out_infinite]" />
              </div>
              <Badge className="border-white/15 bg-white/10 text-white hover:bg-white/10">
                <span className="mr-2 inline-flex h-2 w-2 rounded-full bg-emerald-300 animate-pulse" />
                LIVE
              </Badge>
            </div>
            <div className="space-y-2">
              <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">Opportunity Analytics</h1>
              <p className="max-w-3xl text-sm leading-7 text-slate-200 sm:text-base">
                Your real EOI and tender mapping, now surfaced as an executive funnel: EOI received, EOI that became tender, submitted RFTs, direct tenders, awards, losses, and open decisions.
              </p>
            </div>
            <div className="flex flex-wrap gap-3 text-xs text-slate-200/90">
              <div className="analytics-chip">Scope: {scopeLabel}</div>
              <div className="analytics-chip">Rows: {scopedOpportunities.length}</div>
              <div className="analytics-chip">EOI to Tender: {formatPercent(analytics.eoiOrigin.conversionRate)}</div>
              <div className="analytics-chip">Count Win: {formatPercent(analytics.overall.countWinRate)}</div>
            </div>
          </div>

          <div className="flex w-full max-w-xl flex-col gap-3">
            <div className="flex flex-wrap gap-2 rounded-2xl border border-white/10 bg-white/8 p-2 backdrop-blur-md">
              {TIME_RANGE_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  size="sm"
                  variant={quickRange === option.value ? 'default' : 'ghost'}
                  className={quickRange === option.value ? 'bg-white text-slate-900 hover:bg-white/90' : 'text-white hover:bg-white/10 hover:text-white'}
                  onClick={() => {
                    setQuickRange(option.value);
                    setFilters((prev) => ({
                      ...prev,
                      ...getQuickRangeDateConfig(option.value),
                    }));
                  }}
                >
                  {option.label}
                </Button>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
              <Select
                value={selectedGroup}
                onValueChange={(value) => {
                  setFilters((prev) => ({
                    ...prev,
                    groups: value === 'ALL' ? [] : [value],
                  }));
                }}
              >
                <SelectTrigger className="border-white/10 bg-white/8 text-white backdrop-blur-sm">
                  <SelectValue placeholder="Select vertical" />
                </SelectTrigger>
                <SelectContent>
                  {groupOptions.map((group) => (
                    <SelectItem key={group} value={group}>{group === 'ALL' ? 'All Verticals' : group}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button type="button" variant="outline" className="border-white/10 bg-white/8 text-white hover:bg-white/10 hover:text-white" onClick={() => setRefreshKey((current) => current + 1)}>
                <RefreshCcw className="mr-2 h-4 w-4" />
                Refresh
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="mb-6 lg:mb-8">
        <div className="rounded-[28px] border border-slate-200 bg-white/90 p-4 shadow-sm backdrop-blur-sm lg:p-5">
          <AdvancedFilters
            data={opportunities}
            filters={filters}
            onFiltersChange={(nextFilters) => {
              setFilters(nextFilters);
              setQuickRange(QUICK_RANGE_CUSTOM);
            }}
            onClearFilters={() => {
              setFilters(defaultFilters);
              setQuickRange(3650);
            }}
          />
        </div>
      </section>

      {error && (
        <Card className="mb-6 border-rose-200 bg-rose-50 lg:mb-8">
          <CardContent className="pt-6 text-sm text-rose-700">{error}</CardContent>
        </Card>
      )}

      <section className="mb-6 grid gap-4 sm:grid-cols-2 lg:mb-8 lg:grid-cols-4">
        {kpiCards.map((card, index) => (
          <button
            key={card.label}
            type="button"
            onClick={card.onClick}
            className={`analytics-card analytics-kpi-card ${card.glow} w-full text-left transition-transform hover:-translate-y-0.5`}
            style={{ animationDelay: `${index * 80}ms` }}
          >
            <div className="relative z-10 p-5">
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <div className="dash-label">{card.label}</div>
                  <div className="mt-2 analytics-kpi-number text-slate-950">
                    <AnimatedCounter value={card.value} animateKey={refreshKey} />
                  </div>
                </div>
                <div className={`rounded-2xl border border-white/70 bg-white/90 p-3 shadow-sm ${card.tone}`}>
                  <card.icon className="h-5 w-5" />
                </div>
              </div>
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className={`text-xs font-semibold ${card.tone}`}>EOI-origin {formatCompactNumber(card.delta)} • Direct {formatCompactNumber(card.direct)}</span>
                <Sparkline values={card.sparkline} className={`h-8 w-20 ${card.tone}`} />
              </div>
              <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div className={`h-full rounded-full ${card.tone.replace('text', 'bg')}`} style={{ width: `${clampPercent(safePercent(card.value, Math.max(analytics.overall.submittedCount, card.value, 1)))}%` }} />
              </div>
              {card.meta ? (
                <div className="flex flex-wrap gap-2 text-[10px] text-slate-500">
                  {card.meta.map((item) => (
                    <span key={item.label} className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2 py-0.5">
                      <span className={`h-2 w-2 rounded-full ${item.tone}`} />
                      {item.label} {item.value}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-slate-500">{card.chip}</div>
              )}
            </div>
          </button>
        ))}
      </section>

      <section className="mb-6 lg:mb-8">
        <div className="analytics-card p-5 lg:p-6">
          <div className="mb-4">
            <div className="dash-label">Side-by-Side</div>
            <h2 className="mt-2 text-xl font-bold tracking-tight text-slate-950">Pipeline Comparison</h2>
            <p className="mt-2 text-sm text-slate-500">
              EOI-Origin means an analytics journey group that contains at least one EOI row. Direct Tender means a journey group with tender-side records only. Became Tender means an EOI-Origin group that later picked up at least one tender-side row.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-separate border-spacing-y-2">
              <thead>
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Metric</th>
                  <th className="rounded-l-2xl bg-sky-50 px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">EOI-Origin</th>
                  <th className="rounded-r-2xl bg-cyan-50 px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.16em] text-cyan-700">Direct Tender</th>
                </tr>
              </thead>
              <tbody>
                {analytics.comparisonRows.map((row) => (
                  <tr key={row.label}>
                    <td className="rounded-l-2xl border border-r-0 border-slate-200 bg-white px-3 py-3 text-sm font-medium text-slate-700">{row.label}</td>
                    <td className="border-y border-sky-100 bg-sky-50/60 px-3 py-3 text-right text-sm font-semibold text-slate-950">
                      <button
                        type="button"
                        className="w-full text-right"
                        onClick={() => {
                          if (row.label === 'Received') return openDrilldown('EOI Received', analytics.drilldowns.eoiReceived);
                          if (row.label === 'Became Tender') return openDrilldown('EOI Became Tender', analytics.drilldowns.becameTender);
                          if (row.label === 'Submitted') return openDrilldown('EOI-Origin Submitted', analytics.drilldowns.eoiSubmitted);
                          if (row.label === 'Won') return openDrilldown('EOI-Origin Won', analytics.drilldowns.eoiWon);
                          if (row.label === 'Lost') return openDrilldown('EOI-Origin Lost', analytics.drilldowns.eoiLost);
                          if (row.label === 'Regretted') return openDrilldown('EOI-Origin Regretted', analytics.drilldowns.eoiRegretted);
                          if (row.label === 'Hold') return openDrilldown('EOI-Origin Hold', analytics.drilldowns.eoiHold);
                          if (row.label === 'No Decision') return openDrilldown('EOI-Origin No Decision', analytics.drilldowns.eoiNoDecision);
                        }}
                      >
                        {row.eoiOrigin}
                      </button>
                    </td>
                    <td className="rounded-r-2xl border border-l-0 border-cyan-100 bg-cyan-50/60 px-3 py-3 text-right text-sm font-semibold text-slate-950">
                      <button
                        type="button"
                        className="w-full text-right disabled:cursor-default"
                        disabled={row.direct === null}
                        onClick={() => {
                          if (row.label === 'Received') return openDrilldown('Direct Tenders', analytics.drilldowns.directTenders);
                          if (row.label === 'Submitted') return openDrilldown('Direct Submitted', analytics.drilldowns.directSubmitted);
                          if (row.label === 'Won') return openDrilldown('Direct Won', analytics.drilldowns.directWon);
                          if (row.label === 'Lost') return openDrilldown('Direct Lost', analytics.drilldowns.directLost);
                          if (row.label === 'Regretted') return openDrilldown('Direct Regretted', analytics.drilldowns.directRegretted);
                          if (row.label === 'Hold') return openDrilldown('Direct Hold', analytics.drilldowns.directHold);
                          if (row.label === 'No Decision') return openDrilldown('Direct No Decision', analytics.drilldowns.directNoDecision);
                        }}
                      >
                        {row.direct ?? '—'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="mb-6 grid gap-6 xl:grid-cols-2 lg:mb-8">
        <div className="analytics-card p-5 lg:p-6">
          <div className="mb-5">
            <div className="dash-label">Aging</div>
            <h2 className="mt-2 text-xl font-bold tracking-tight text-slate-950">EOI Aging</h2>
          </div>
          <div className="space-y-4">
            {analytics.eoiAgingBuckets.map((bucket) => (
              <button
                key={bucket.key}
                type="button"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 text-left"
                onClick={() => openDrilldown(`EOI Aging • ${bucket.label}`, analytics.drilldowns.pureEoi.filter((opp) => getEoiAgingBucket(getDayDiff(parseFlexibleTimestamp(opp.dateTenderReceived || opp.tenderSubmittedDate), Date.now())) === bucket.key))}
              >
                <div className="mb-3 flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{bucket.label}</div>
                    <div className="text-xs text-slate-500">{bucket.key} days</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-slate-950">{bucket.count}</div>
                    <div className="text-xs text-slate-500">{formatPercent(bucket.percent)}</div>
                  </div>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className={`h-full rounded-full ${bucket.tone}`} style={{ width: `${clampPercent(bucket.percent)}%` }} />
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="analytics-card p-5 lg:p-6">
          <div className="mb-5">
            <div className="dash-label">Aging</div>
            <h2 className="mt-2 text-xl font-bold tracking-tight text-slate-950">Tender Aging</h2>
          </div>
          <div className="space-y-4">
            {selectedGroup !== 'GTS' && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
                Tender aging is driven by No Decision tenders and is only shown for the `GTS` vertical.
              </div>
            )}
            {analytics.tenderAgingBuckets.map((bucket) => (
              <button
                key={bucket.key}
                type="button"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 text-left"
                onClick={() => openDrilldown(`Tender Aging • ${bucket.label}`, analytics.drilldowns.noDecision.filter((opp) => getTenderAgingBucket(getDayDiff(parseFlexibleTimestamp(opp.tenderSubmittedDate), Date.now())) === bucket.key))}
              >
                <div className="mb-3 flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{bucket.label}</div>
                    <div className="text-xs text-slate-500">{bucket.key} days since submitted</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-slate-950">{bucket.count}</div>
                    <div className="text-xs text-slate-500">{formatPercent(bucket.percent)}</div>
                  </div>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className={`h-full rounded-full ${bucket.tone}`} style={{ width: `${clampPercent(bucket.percent)}%` }} />
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="mb-6 grid gap-6 xl:grid-cols-2 lg:mb-8">
        <div className="analytics-card p-5 lg:p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="rounded-2xl bg-slate-100 p-3">
              <XCircle className="h-5 w-5 text-rose-600" />
            </div>
            <div>
              <div className="dash-label">Text Clusters</div>
              <h2 className="mt-1 text-xl font-bold tracking-tight text-slate-950">Loss Reasons</h2>
            </div>
          </div>
          <div className="space-y-4">
            {analytics.lossReasons.map((reason, index) => (
              <button
                key={reason.label}
                type="button"
                className="w-full text-left"
                onClick={() => openDrilldown(`Loss Reasons • ${reason.label}`, analytics.drilldowns.lost.filter((opp) => categorizeLossReason(normalizeText(opp.remarksReason || opp.comments)) === reason.label))}
              >
                <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium text-slate-700">{reason.label}</span>
                  <span className="text-slate-500">{reason.count} ({formatPercent(reason.percent)})</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={index % 5 === 0 ? 'h-full rounded-full bg-rose-500' : index % 5 === 1 ? 'h-full rounded-full bg-amber-500' : index % 5 === 2 ? 'h-full rounded-full bg-blue-600' : index % 5 === 3 ? 'h-full rounded-full bg-cyan-500' : 'h-full rounded-full bg-slate-500'}
                    style={{ width: `${clampPercent(reason.percent)}%` }}
                  />
                </div>
              </button>
            ))}
            {analytics.lossReasons.length === 0 && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">No loss remarks available in this scope.</div>
            )}
          </div>
        </div>

        <div className="analytics-card p-5 lg:p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="rounded-2xl bg-slate-100 p-3">
              <Waves className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <div className="dash-label">Post-Bid</div>
              <h2 className="mt-1 text-xl font-bold tracking-tight text-slate-950">Post-Bid Detail Mix</h2>
            </div>
          </div>
          <div className="mb-6 h-4 overflow-hidden rounded-full bg-slate-100">
            {analytics.postBidBreakdown.map((item) => (
              <button
                key={item.label}
                type="button"
                className={`inline-block h-full ${item.color}`}
                style={{ width: `${clampPercent(item.percent)}%` }}
                onClick={() => openDrilldown(`Post-Bid • ${item.label}`, analytics.drilldowns.lifecycle.filter((opp) => getPostBidLabel(opp) === item.label))}
              />
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {analytics.postBidBreakdown.map((item) => (
              <button
                key={item.label}
                type="button"
                className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left"
                onClick={() => openDrilldown(`Post-Bid • ${item.label}`, analytics.drilldowns.lifecycle.filter((opp) => getPostBidLabel(opp) === item.label))}
              >
                <div className="flex items-center gap-3">
                  <span className={`h-3 w-3 rounded-sm ${item.color}`} />
                  <span className="text-sm font-medium text-slate-700">{item.label}</span>
                </div>
                <span className="text-sm font-semibold text-slate-950">{item.count}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="mb-6 grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)] lg:mb-8">
        <div className="analytics-card p-5 lg:p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="rounded-2xl bg-slate-100 p-3">
              <Building2 className="h-5 w-5 text-slate-700" />
            </div>
            <div>
              <div className="dash-label">Client Rankings</div>
              <h2 className="mt-1 text-xl font-bold tracking-tight text-slate-950">Client Matrix</h2>
            </div>
          </div>
          <div className="space-y-3">
            {analytics.clientRows.map((row) => {
              const eoiWidth = clampPercent(safePercent(row.eoiCount, Math.max(...analytics.clientRows.map((item) => item.eoiCount), 1)));
              const tenderWidth = clampPercent(safePercent(row.tenderCount, Math.max(...analytics.clientRows.map((item) => item.eoiCount), 1)));
              const wonWidth = clampPercent(safePercent(row.wonCount, Math.max(...analytics.clientRows.map((item) => item.eoiCount), 1)));
              return (
                <button
                  key={row.client}
                  type="button"
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 text-left"
                  onClick={() => openDrilldown(`Client Matrix • ${row.client}`, groupedOpportunities
                    .filter((group) => getGroupClient(group) === row.client)
                    .map((group) => getPureEoiRow(group) || getConvertedTenderRow(group) || group.primary)
                    .filter(Boolean) as Opportunity[])}
                >
                  <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="max-w-[220px] truncate text-sm font-semibold text-slate-900">{row.client}</div>
                    <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                      <span>EOI {row.eoiCount}</span>
                      <span>Tender {row.tenderCount}</span>
                      <span>Won {row.wonCount}</span>
                      <span>{formatPercent(row.conversionRate)}</span>
                    </div>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full bg-sky-200" style={{ width: `${eoiWidth}%` }} />
                  </div>
                  <div className="-mt-2 h-2 overflow-hidden rounded-full">
                    <div className="h-full bg-sky-500" style={{ width: `${tenderWidth}%` }} />
                  </div>
                  <div className="-mt-2 h-2 overflow-hidden rounded-full">
                    <div className="h-full bg-emerald-500" style={{ width: `${wonWidth}%` }} />
                  </div>
                </button>
              );
            })}
          </div>
          <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-500">
            <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-sm bg-sky-200" /> EOI</span>
            <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-sm bg-sky-500" /> Tender</span>
            <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-sm bg-emerald-500" /> Won</span>
          </div>
        </div>

        <div className="analytics-card p-5 lg:p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="rounded-2xl bg-slate-100 p-3">
              <TimerReset className="h-5 w-5 text-slate-700" />
            </div>
            <div>
              <div className="dash-label">Conversion Risk</div>
              <h2 className="mt-1 text-xl font-bold tracking-tight text-slate-950">Stale EOI Tracker</h2>
            </div>
          </div>
          <div className="space-y-3">
            {analytics.staleEoiRows.length === 0 && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">No stale EOIs in the selected scope.</div>
            )}
            {analytics.staleEoiRows.map((row) => (
              <button
                key={`${row.refNo}-${row.tenderName}`}
                type="button"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 text-left"
                onClick={() => openDrilldown(`Stale EOI • ${row.tenderName}`, analytics.drilldowns.pureEoi.filter((opp) => normalizeText(opp.opportunityRefNo) === row.refNo && normalizeText(opp.tenderName) === row.tenderName))}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{row.tenderName}</div>
                    <div className="mt-1 text-xs text-slate-500">{row.refNo || 'NO REF'} • {row.client}</div>
                  </div>
                  <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700">{row.ageDays} days</Badge>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="mb-6 analytics-card p-5 lg:mb-8 lg:p-6">
        <div className="mb-5">
          <div className="dash-label">Monthly Signals</div>
          <h2 className="mt-2 text-xl font-bold tracking-tight text-slate-950">Monthly Heatmap</h2>
          <p className="mt-2 text-sm text-slate-500">Received and submitted use explicit dates from your records. Won and Outcome are plotted against the best available tender-side date currently in the dataset.</p>
        </div>
        <div className="mb-5 grid gap-3 sm:grid-cols-[200px_minmax(0,1fr)]">
          <Select value={heatmapYear} onValueChange={setHeatmapYear}>
            <SelectTrigger>
              <SelectValue placeholder="Select year" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="LATEST">Latest Year</SelectItem>
              <SelectItem value="ALL">All Years</SelectItem>
              {availableHeatmapYears.map((year) => (
                <SelectItem key={year} value={year}>{year}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={heatmapSearch}
            onChange={(event) => setHeatmapSearch(event.target.value)}
            placeholder="Search month or YYYY-MM"
          />
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[720px]">
            {filteredHeatmapMonths.length === 0 && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
                No months match the selected year or search term.
              </div>
            )}
            <div className="grid" style={{ gridTemplateColumns: `160px repeat(${filteredHeatmapMonths.length}, minmax(48px, 1fr))` }}>
              <div />
              {filteredHeatmapMonths.map((month) => (
                <div key={month} className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                  {formatMonthLabel(month)}
                </div>
              ))}

              {displayedHeatmap.map((row) => (
                <Fragment key={row.status}>
                  <div className="flex items-center px-3 py-3 text-sm font-semibold text-slate-700">{row.status}</div>
                  {row.values.map((cell) => {
                    const opacity = cell.value > 0 ? Math.max(0.18, cell.value / monthHeatMax) : 0.12;
                    const colorClass = row.status === 'Received'
                      ? 'bg-blue-600'
                      : row.status === 'Submitted'
                        ? 'bg-cyan-500'
                        : row.status === 'Won'
                          ? 'bg-emerald-500'
                          : 'bg-rose-500';
                    return (
                      <div key={`${row.status}-${cell.month}`} className="flex items-center justify-center px-2 py-2">
                        <button
                          type="button"
                          className={`flex h-11 w-11 items-center justify-center rounded-xl text-xs font-semibold text-white ${colorClass}`}
                          style={{ opacity }}
                          onClick={() => {
                            if (row.status === 'Received') {
                              return openDrilldown(`Monthly Heatmap • ${row.status} • ${formatMonthLabel(cell.month)}`, analytics.drilldowns.receivedAll.filter((opp) => getMonthKey(opp.dateTenderReceived || opp.tenderSubmittedDate) === cell.month));
                            }
                            if (row.status === 'Submitted') {
                              return openDrilldown(`Monthly Heatmap • ${row.status} • ${formatMonthLabel(cell.month)}`, analytics.drilldowns.submitted.filter((opp) => getMonthKey(opp.tenderSubmittedDate || opp.dateTenderReceived) === cell.month));
                            }
                            if (row.status === 'Won') {
                              return openDrilldown(`Monthly Heatmap • ${row.status} • ${formatMonthLabel(cell.month)}`, analytics.drilldowns.won.filter((opp) => getMonthKey(opp.postBidDetailUpdatedAt || opp.tenderSubmittedDate || opp.dateTenderReceived) === cell.month));
                            }
                            return openDrilldown(`Monthly Heatmap • ${row.status} • ${formatMonthLabel(cell.month)}`, analytics.drilldowns.outcomeAll.filter((opp) => getMonthKey(opp.postBidDetailUpdatedAt || opp.tenderSubmittedDate || opp.dateTenderReceived) === cell.month));
                          }}
                        >
                          {cell.value || '·'}
                        </button>
                      </div>
                    );
                  })}
                </Fragment>
              ))}
            </div>
          </div>
        </div>
      </section>

      {isLoading && opportunities.length === 0 && (
        <Card className="mt-6">
          <CardContent className="pt-6 text-sm text-slate-500">Loading analytics...</CardContent>
        </Card>
      )}

      <Dialog open={Boolean(drilldown)} onOpenChange={(open) => { if (!open) setDrilldown(null); }}>
        <DialogContent className="max-w-[1200px]">
          <DialogHeader>
            <DialogTitle>{drilldown?.title || 'Drilldown'}</DialogTitle>
          </DialogHeader>
          <OpportunitiesTable data={drilldown?.rows || []} maxHeight="max-h-[65vh]" onSelectOpportunity={setSelectedOpportunity} />
        </DialogContent>
      </Dialog>

      <OpportunityDetailDialog
        open={!!selectedOpportunity}
        opportunity={selectedOpportunity}
        onOpenChange={(open) => {
          if (!open) setSelectedOpportunity(null);
        }}
        formatCurrency={formatCurrency}
      />
    </div>
  );
};

export default Analytics;
