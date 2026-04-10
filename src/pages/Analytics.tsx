import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  Building2,
  ChevronDown,
  ChevronUp,
  Clock3,
  GitBranch,
  RefreshCcw,
  Send,
  Sparkles,
  Target,
  TimerReset,
  Trophy,
  Waves,
  XCircle,
} from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useData } from '@/contexts/DataContext';
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

const normalizeText = (value: string | null | undefined) => String(value || '').trim();
const normalizeTextLower = (value: string | null | undefined) => normalizeText(value).toLowerCase();
const normalizeRefNo = (value: string | null | undefined) => normalizeText(value).toUpperCase();
const getBaseRefNo = (value: string | null | undefined) => normalizeRefNo(value).replace(/_EOI$/i, '');
const isEoiRefNo = (value: string | null | undefined) => /_EOI$/i.test(normalizeRefNo(value));
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

const formatCurrencyCompact = (value: number) => {
  if (!value) return 'AED 0';
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `AED ${(value / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `AED ${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `AED ${(value / 1_000).toFixed(1)}K`;
  return `AED ${Math.round(value)}`;
};

const formatPercent = (value: number) => `${Number.isFinite(value) ? value.toFixed(1) : '0.0'}%`;

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

const getStatusTone = (label: string) => {
  const normalized = normalizeText(label).toUpperCase();
  if (normalized.includes('WON') || normalized.includes('AWARDED')) return 'bg-emerald-500';
  if (normalized.includes('LOST') || normalized.includes('REGRETTED')) return 'bg-rose-500';
  if (normalized.includes('NO DECISION')) return 'bg-amber-500';
  return 'bg-sky-500';
};

const isTenderRecord = (opp: Opportunity) => {
  const type = normalizeText(opp.opportunityClassification).toUpperCase();
  return type === 'TENDER' || (!isEoiRefNo(opp.opportunityRefNo) && !type.includes('EOI'));
};

const isEoiRecord = (opp: Opportunity) => {
  const type = normalizeText(opp.opportunityClassification).toUpperCase();
  return type.includes('EOI') || isEoiRefNo(opp.opportunityRefNo);
};

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
  if (ref && tenderName) return `${ref}::${tenderName}`;
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

const getGroupStatus = (group: OpportunityGroup) => normalizeText(getDisplayStatus(group.primary || {})).toUpperCase();
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
const getReceivedTimestamp = (group: OpportunityGroup) => getEarliestEoiTimestamp(group) || getEarliestTenderTimestamp(group);
const getDecisionTimestamp = (group: OpportunityGroup) => (
  parseFlexibleTimestamp(group.primary?.postBidDetailUpdatedAt)
  || parseFlexibleTimestamp(group.primary?.tenderSubmittedDate)
  || parseFlexibleTimestamp(group.primary?.dateTenderReceived)
);

const hasSubmittedTender = (group: OpportunityGroup) => getSubmittedTimestamp(group) > 0;
const isAwardedGroup = (group: OpportunityGroup) => getGroupStatus(group) === 'AWARDED';
const isLostGroup = (group: OpportunityGroup) => {
  const status = getGroupStatus(group);
  return status === 'LOST' || status === 'REGRETTED';
};
const isOpenDecisionGroup = (group: OpportunityGroup) => hasSubmittedTender(group) && !isAwardedGroup(group) && !isLostGroup(group);
const getDayDiff = (fromTimestamp: number, toTimestamp: number) => {
  if (!fromTimestamp || !toTimestamp || toTimestamp < fromTimestamp) return 0;
  return Math.round((toTimestamp - fromTimestamp) / (1000 * 60 * 60 * 24));
};
const average = (values: number[]) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0);

const categorizeLossReason = (text: string) => {
  const normalized = normalizeTextLower(text);
  if (!normalized) return 'Unspecified';
  if (/(price|pricing|commercial|cost|budget|rate)/.test(normalized)) return 'Price / Cost';
  if (/(technical|specification|compliance|qualification|experience)/.test(normalized)) return 'Technical';
  if (/(competitor|competition|incumbent|alternate)/.test(normalized)) return 'Competitor';
  if (/(timeline|delay|deadline|time)/.test(normalized)) return 'Timeline';
  if (/(no response|silent|no update|awaiting)/.test(normalized)) return 'No Response';
  return 'Other';
};

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

const getPostBidLabel = (type: string | null | undefined) => POST_BID_TYPE_LABELS[normalizeText(type).toUpperCase()] || 'Other';

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
  const [selectedGroup, setSelectedGroup] = useState('ALL');
  const [timeRange, setTimeRange] = useState<number>(365);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showRoadmap, setShowRoadmap] = useState(false);

  const groupOptions = useMemo(() => {
    const groups = Array.from(new Set(opportunities.map((opp) => normalizeText(opp.groupClassification)).filter(Boolean))).sort((a, b) => a.localeCompare(b));
    return ['ALL', ...groups];
  }, [opportunities]);

  const scopedOpportunities = useMemo(() => {
    const now = Date.now();
    const cutoff = now - timeRange * 24 * 60 * 60 * 1000;

    return opportunities.filter((opp) => {
      if (selectedGroup !== 'ALL' && normalizeText(opp.groupClassification) !== selectedGroup) return false;
      const timestamp = parseFlexibleTimestamp(opp.dateTenderReceived || opp.tenderSubmittedDate || opp.tenderPlannedSubmissionDate);
      if (!timestamp) return timeRange >= 3650;
      return timestamp >= cutoff;
    });
  }, [opportunities, selectedGroup, timeRange]);

  const groupedOpportunities = useMemo(() => buildOpportunityGroups(scopedOpportunities), [scopedOpportunities]);

  const analytics = useMemo(() => {
    const eoiOriginGroups = groupedOpportunities.filter((group) => group.eoiRows.length > 0);
    const pureEoiGroups = eoiOriginGroups.filter((group) => group.tenderRows.length === 0);
    const eoiOriginTenderGroups = eoiOriginGroups.filter((group) => group.tenderRows.length > 0);
    const eoiOriginSubmittedGroups = eoiOriginTenderGroups.filter(hasSubmittedTender);
    const eoiOriginAwardedGroups = eoiOriginSubmittedGroups.filter(isAwardedGroup);
    const eoiOriginLostGroups = eoiOriginSubmittedGroups.filter(isLostGroup);
    const eoiOriginOpenDecisionGroups = eoiOriginSubmittedGroups.filter(isOpenDecisionGroup);

    const directTenderGroups = groupedOpportunities.filter((group) => group.eoiRows.length === 0 && group.tenderRows.length > 0);
    const directSubmittedGroups = directTenderGroups.filter(hasSubmittedTender);
    const directAwardedGroups = directSubmittedGroups.filter(isAwardedGroup);
    const directLostGroups = directSubmittedGroups.filter(isLostGroup);
    const directOpenDecisionGroups = directSubmittedGroups.filter(isOpenDecisionGroup);
    const directNotSubmittedGroups = directTenderGroups.filter((group) => !hasSubmittedTender(group));

    const submittedGroups = [...eoiOriginSubmittedGroups, ...directSubmittedGroups];
    const wonGroups = [...eoiOriginAwardedGroups, ...directAwardedGroups];
    const lostGroups = [...eoiOriginLostGroups, ...directLostGroups];
    const noDecisionGroups = [...eoiOriginOpenDecisionGroups, ...directOpenDecisionGroups];

    const submittedValue = submittedGroups.reduce((sum, group) => sum + getGroupValue(group), 0);
    const wonValue = wonGroups.reduce((sum, group) => sum + getGroupValue(group), 0);

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
        if (group.tenderRows.length > 0) acc[client].tenderCount += 1;
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
      lostGroups.reduce<Record<string, number>>((acc, group) => {
        const category = categorizeLossReason(normalizeText(group.primary?.remarksReason || group.primary?.comments));
        acc[category] = (acc[category] || 0) + 1;
        return acc;
      }, {}),
    )
      .map(([label, count]) => ({ label, count, percent: safePercent(count, Math.max(lostGroups.length, 1)) }))
      .sort((a, b) => b.count - a.count);

    const postBidBreakdown = Object.entries(
      groupedOpportunities.reduce<Record<string, number>>((acc, group) => {
        const label = getPostBidLabel(group.primary?.postBidDetailType);
        acc[label] = (acc[label] || 0) + (group.primary?.postBidDetailType ? 1 : 0);
        return acc;
      }, {
        'Technical Clarification Meeting': 0,
        'Technical Presentation': 0,
        'Site Visit': 0,
        'Best & Final Offer': 0,
        'No Activity': 0,
        Other: 0,
      }),
    )
      .map(([label, count]) => ({ label, count, percent: safePercent(count, Math.max(groupedOpportunities.length, 1)) }))
      .filter((row) => row.count > 0 || row.label === 'No Activity')
      .map((row) => {
        if (row.label === 'Technical Clarification Meeting') return { ...row, color: 'bg-cyan-500' };
        if (row.label === 'Technical Presentation') return { ...row, color: 'bg-blue-600' };
        if (row.label === 'Site Visit') return { ...row, color: 'bg-emerald-500' };
        if (row.label === 'Best & Final Offer') return { ...row, color: 'bg-amber-500' };
        if (row.label === 'No Activity') return { ...row, color: 'bg-slate-300' };
        return { ...row, color: 'bg-fuchsia-500' };
      });

    const monthlyStatusMap = new Map<string, { month: string; Received: number; Submitted: number; Won: number; Lost: number }>();
    const allMonthKeys = new Set<string>();

    groupedOpportunities.forEach((group) => {
      const receivedMonth = getMonthKey(group.eoiRows[0]?.dateTenderReceived || group.tenderRows[0]?.dateTenderReceived || group.primary?.dateTenderReceived);
      if (receivedMonth) {
        allMonthKeys.add(receivedMonth);
        const row = monthlyStatusMap.get(receivedMonth) || { month: receivedMonth, Received: 0, Submitted: 0, Won: 0, Lost: 0 };
        row.Received += 1;
        monthlyStatusMap.set(receivedMonth, row);
      }

      const submittedMonth = getMonthKey(group.tenderRows[0]?.tenderSubmittedDate || group.primary?.tenderSubmittedDate);
      if (submittedMonth) {
        allMonthKeys.add(submittedMonth);
        const row = monthlyStatusMap.get(submittedMonth) || { month: submittedMonth, Received: 0, Submitted: 0, Won: 0, Lost: 0 };
        row.Submitted += 1;
        monthlyStatusMap.set(submittedMonth, row);
      }

      if (isAwardedGroup(group)) {
        const month = getMonthKey(group.primary?.postBidDetailUpdatedAt || group.primary?.tenderSubmittedDate || group.primary?.dateTenderReceived);
        if (month) {
          allMonthKeys.add(month);
          const row = monthlyStatusMap.get(month) || { month: month, Received: 0, Submitted: 0, Won: 0, Lost: 0 };
          row.Won += 1;
          monthlyStatusMap.set(month, row);
        }
      }

      if (isLostGroup(group)) {
        const month = getMonthKey(group.primary?.postBidDetailUpdatedAt || group.primary?.tenderSubmittedDate || group.primary?.dateTenderReceived);
        if (month) {
          allMonthKeys.add(month);
          const row = monthlyStatusMap.get(month) || { month, Received: 0, Submitted: 0, Won: 0, Lost: 0 };
          row.Lost += 1;
          monthlyStatusMap.set(month, row);
        }
      }
    });

    const monthColumns = Array.from(allMonthKeys).sort((a, b) => a.localeCompare(b)).slice(-12);
    const monthlyHeatmap = ['Received', 'Submitted', 'Won', 'Lost'].map((status) => ({
      status,
      values: monthColumns.map((month) => ({
        month,
        value: monthlyStatusMap.get(month)?.[status as 'Received' | 'Submitted' | 'Won' | 'Lost'] || 0,
      })),
    }));

    const staleEoiRows = pureEoiGroups
      .map((group) => ({
        refNo: normalizeText(group.eoiRows[0]?.opportunityRefNo || group.primary?.opportunityRefNo),
        tenderName: normalizeText(group.eoiRows[0]?.tenderName || group.primary?.tenderName) || 'Untitled',
        client: getGroupClient(group),
        ageDays: getDayDiff(getEarliestEoiTimestamp(group), Date.now()),
      }))
      .sort((a, b) => b.ageDays - a.ageDays)
      .slice(0, 6);

    const cohortRows = Object.values(
      eoiOriginTenderGroups.reduce<Record<string, { label: string; count: number }>>((acc, group) => {
        const eoiMonth = getMonthKey(group.eoiRows[0]?.dateTenderReceived || group.eoiRows[0]?.tenderSubmittedDate);
        const tenderMonth = getMonthKey(group.tenderRows[0]?.dateTenderReceived || group.tenderRows[0]?.tenderSubmittedDate);
        if (!eoiMonth || !tenderMonth) return acc;
        const label = `${formatMonthLabel(eoiMonth)} -> ${formatMonthLabel(tenderMonth)}`;
        if (!acc[label]) acc[label] = { label, count: 0 };
        acc[label].count += 1;
        return acc;
      }, {}),
    )
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    const kpis = {
      submitted: submittedGroups.length,
      won: wonGroups.length,
      lost: lostGroups.length,
      noDecision: noDecisionGroups.length,
    };

    return {
      eoiOrigin: {
        eoiCount: eoiOriginGroups.length,
        pureEoiCount: pureEoiGroups.length,
        becameTenderCount: eoiOriginTenderGroups.length,
        submittedCount: eoiOriginSubmittedGroups.length,
        awardedCount: eoiOriginAwardedGroups.length,
        lostCount: eoiOriginLostGroups.length,
        noDecisionCount: eoiOriginOpenDecisionGroups.length,
        conversionRate: safePercent(eoiOriginTenderGroups.length, eoiOriginGroups.length),
        winRate: safePercent(eoiOriginAwardedGroups.length, eoiOriginSubmittedGroups.length),
        decisionRate: safePercent(eoiOriginAwardedGroups.length, eoiOriginAwardedGroups.length + eoiOriginLostGroups.length),
        avgDaysToTender: average(conversionLagDays),
        avgValue: average(eoiOriginTenderGroups.map(getGroupValue)),
      },
      directTender: {
        tenderCount: directTenderGroups.length,
        notSubmittedCount: directNotSubmittedGroups.length,
        submittedCount: directSubmittedGroups.length,
        awardedCount: directAwardedGroups.length,
        lostCount: directLostGroups.length,
        noDecisionCount: directOpenDecisionGroups.length,
        winRate: safePercent(directAwardedGroups.length, directSubmittedGroups.length),
        decisionRate: safePercent(directAwardedGroups.length, directAwardedGroups.length + directLostGroups.length),
        avgValue: average(directTenderGroups.map(getGroupValue)),
      },
      overall: {
        submittedCount: kpis.submitted,
        wonCount: kpis.won,
        lostCount: kpis.lost,
        noDecisionCount: kpis.noDecision,
        countWinRate: safePercent(kpis.won, kpis.submitted),
        valueWinRate: safePercent(wonValue, submittedValue),
        decisionRate: safePercent(kpis.won, kpis.won + kpis.lost),
        submittedValue,
        wonValue,
      },
      comparisonRows: [
        { label: 'Received', eoiOrigin: eoiOriginGroups.length, direct: directTenderGroups.length },
        { label: 'Submitted', eoiOrigin: eoiOriginSubmittedGroups.length, direct: directSubmittedGroups.length },
        { label: 'Won', eoiOrigin: eoiOriginAwardedGroups.length, direct: directAwardedGroups.length },
        { label: 'Lost', eoiOrigin: eoiOriginLostGroups.length, direct: directLostGroups.length },
        { label: 'Win % (Count)', eoiOrigin: formatPercent(safePercent(eoiOriginAwardedGroups.length, eoiOriginSubmittedGroups.length)), direct: formatPercent(safePercent(directAwardedGroups.length, directSubmittedGroups.length)) },
        { label: 'Win % (Value)', eoiOrigin: formatPercent(safePercent(eoiOriginAwardedGroups.reduce((sum, group) => sum + getGroupValue(group), 0), eoiOriginSubmittedGroups.reduce((sum, group) => sum + getGroupValue(group), 0))), direct: formatPercent(safePercent(directAwardedGroups.reduce((sum, group) => sum + getGroupValue(group), 0), directSubmittedGroups.reduce((sum, group) => sum + getGroupValue(group), 0))) },
        { label: 'Won Value', eoiOrigin: formatCurrencyCompact(eoiOriginAwardedGroups.reduce((sum, group) => sum + getGroupValue(group), 0)), direct: formatCurrencyCompact(directAwardedGroups.reduce((sum, group) => sum + getGroupValue(group), 0)) },
        { label: 'Avg Days to Tender', eoiOrigin: `${average(conversionLagDays).toFixed(1)} d`, direct: 'N/A' },
      ],
      clientRows,
      eoiAgingBuckets,
      tenderAgingBuckets,
      lossReasons,
      postBidBreakdown,
      monthColumns,
      monthlyHeatmap,
      staleEoiRows,
      cohortRows,
      roadmapAverage: average(conversionLagDays),
      roadmapCoverage: conversionLagDays.length,
      sparklineSeed: [kpis.submitted, kpis.won, kpis.lost, kpis.noDecision],
    };
  }, [groupedOpportunities]);

  const scopeLabel = selectedGroup === 'ALL' ? 'All Verticals' : selectedGroup;
  const monthHeatMax = Math.max(
    1,
    ...analytics.monthlyHeatmap.flatMap((row) => row.values.map((value) => value.value)),
  );

  const kpiCards = [
    {
      label: 'Submitted',
      value: analytics.overall.submittedCount,
      delta: analytics.eoiOrigin.submittedCount,
      chip: formatCurrencyCompact(analytics.overall.submittedValue),
      tone: 'text-sky-600',
      glow: 'analytics-kpi-glow-sky',
      icon: Send,
      sparkline: [analytics.eoiOrigin.submittedCount, analytics.directTender.submittedCount, analytics.overall.submittedCount, analytics.overall.submittedCount * 0.9],
    },
    {
      label: 'Won',
      value: analytics.overall.wonCount,
      delta: analytics.eoiOrigin.awardedCount,
      chip: formatCurrencyCompact(analytics.overall.wonValue),
      tone: 'text-emerald-600',
      glow: 'analytics-kpi-glow-emerald',
      icon: Trophy,
      sparkline: [analytics.eoiOrigin.awardedCount, analytics.directTender.awardedCount, analytics.overall.wonCount, Math.max(analytics.overall.wonCount - 1, 0)],
    },
    {
      label: 'Lost',
      value: analytics.overall.lostCount,
      delta: analytics.eoiOrigin.lostCount,
      chip: `${formatPercent(analytics.directTender.decisionRate)} decision win`,
      tone: 'text-rose-600',
      glow: 'analytics-kpi-glow-rose',
      icon: XCircle,
      sparkline: [analytics.eoiOrigin.lostCount, analytics.directTender.lostCount, analytics.overall.lostCount, Math.max(analytics.overall.lostCount - 1, 0)],
    },
    {
      label: 'No Decision',
      value: analytics.overall.noDecisionCount,
      delta: analytics.eoiOrigin.noDecisionCount,
      chip: `${analytics.directTender.noDecisionCount} direct`,
      tone: 'text-amber-600',
      glow: 'analytics-kpi-glow-amber',
      icon: Clock3,
      sparkline: [analytics.eoiOrigin.noDecisionCount, analytics.directTender.noDecisionCount, analytics.overall.noDecisionCount, analytics.overall.noDecisionCount * 0.85],
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
              <div className="analytics-chip">EOI to Tender: {formatPercent(analytics.eoiOrigin.conversionRate)}</div>
              <div className="analytics-chip">Count Win: {formatPercent(analytics.overall.countWinRate)}</div>
              <div className="analytics-chip">Value Win: {formatPercent(analytics.overall.valueWinRate)}</div>
            </div>
          </div>

          <div className="flex w-full max-w-xl flex-col gap-3">
            <div className="flex flex-wrap gap-2 rounded-2xl border border-white/10 bg-white/8 p-2 backdrop-blur-md">
              {TIME_RANGE_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  size="sm"
                  variant={timeRange === option.value ? 'default' : 'ghost'}
                  className={timeRange === option.value ? 'bg-white text-slate-900 hover:bg-white/90' : 'text-white hover:bg-white/10 hover:text-white'}
                  onClick={() => setTimeRange(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
              <Select value={selectedGroup} onValueChange={setSelectedGroup}>
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

              <Button type="button" variant="outline" className="border-white/10 bg-white/8 text-white hover:bg-white/10 hover:text-white">
                <Target className="mr-2 h-4 w-4" />
                Focus
              </Button>
            </div>
          </div>
        </div>
      </section>

      {error && (
        <Card className="mb-6 border-rose-200 bg-rose-50 lg:mb-8">
          <CardContent className="pt-6 text-sm text-rose-700">{error}</CardContent>
        </Card>
      )}

      <section className="mb-6 grid gap-4 sm:grid-cols-2 lg:mb-8 lg:grid-cols-4">
        {kpiCards.map((card, index) => (
          <div key={card.label} className={`analytics-card analytics-kpi-card ${card.glow}`} style={{ animationDelay: `${index * 80}ms` }}>
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
                <span className={`text-xs font-semibold ${card.tone}`}>EOI-origin {formatCompactNumber(card.delta)}</span>
                <Sparkline values={card.sparkline} className={`h-8 w-20 ${card.tone}`} />
              </div>
              <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div className={`h-full rounded-full ${card.tone.replace('text', 'bg')}`} style={{ width: `${clampPercent(safePercent(card.value, Math.max(analytics.overall.submittedCount, card.value, 1)))}%` }} />
              </div>
              <div className="text-xs text-slate-500">{card.chip}</div>
            </div>
          </div>
        ))}
      </section>

      <section className="mb-6 lg:mb-8">
        <div className="analytics-card p-5 lg:p-6">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <div className="dash-label">Lifecycle Flow</div>
              <h2 className="mt-2 text-xl font-bold tracking-tight text-slate-950">EOI Journey Roadmap</h2>
            </div>
            <Badge variant="outline" className="border-slate-200 bg-white text-slate-600">{formatCompactNumber(analytics.eoiOrigin.pureEoiCount)} pure EOIs still waiting</Badge>
          </div>

          <div className="grid gap-4 lg:grid-cols-4">
            <div className="space-y-3">
              <div className="dash-label">Intake</div>
              <FlowNode label="EOI Received" count={analytics.eoiOrigin.eoiCount} tone="primary" />
              <FlowNode label="Direct Tenders" count={analytics.directTender.tenderCount} tone="info" />
            </div>
            <div className="space-y-3">
              <div className="dash-label">Conversion</div>
              <FlowNode label="Became Tender" count={analytics.eoiOrigin.becameTenderCount} percent={analytics.eoiOrigin.conversionRate} tone="primary" />
            </div>
            <div className="space-y-3">
              <div className="dash-label">Submission</div>
              <FlowNode label="RFT Submitted" count={analytics.overall.submittedCount} percent={analytics.overall.countWinRate} tone="info" />
            </div>
            <div className="space-y-3">
              <div className="dash-label">Outcome</div>
              <FlowNode label="Won" count={analytics.overall.wonCount} percent={analytics.overall.countWinRate} tone="success" />
              <FlowNode label="Lost" count={analytics.overall.lostCount} percent={safePercent(analytics.overall.lostCount, analytics.overall.submittedCount)} tone="danger" />
              <FlowNode label="No Decision" count={analytics.overall.noDecisionCount} percent={safePercent(analytics.overall.noDecisionCount, analytics.overall.submittedCount)} tone="warning" />
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3 text-sm text-slate-500">
            <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-rose-400 animate-pulse" /> {analytics.eoiOrigin.pureEoiCount} EOIs not converted to tender</span>
            <span className="text-slate-300">•</span>
            <span>Drop-off rate {formatPercent(safePercent(analytics.eoiOrigin.pureEoiCount, analytics.eoiOrigin.eoiCount))}</span>
          </div>
        </div>
      </section>

      <section className="mb-6 grid gap-6 xl:grid-cols-3 lg:mb-8">
        <GaugeCard
          label="Count-Based Win"
          value={analytics.overall.countWinRate}
          colorClass="text-sky-600"
          description="Won tenders divided by submitted tenders, using your rule that submitted means actual RFT submitted."
          animateKey={refreshKey}
        />
        <GaugeCard
          label="Value-Weighted Win"
          value={analytics.overall.valueWinRate}
          colorClass="text-emerald-600"
          description="Won tender value divided by submitted tender value, so bigger awards influence the percentage properly."
          animateKey={refreshKey}
        />
        <GaugeCard
          label="Decision Win"
          value={analytics.overall.decisionRate}
          colorClass="text-amber-500"
          description="Won divided by won plus lost, isolating only decisions already made."
          animateKey={refreshKey}
        />
      </section>

      <section className="mb-6 grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)] lg:mb-8">
        <div className="analytics-card p-5 lg:p-6">
          <div className="mb-4">
            <div className="dash-label">Side-by-Side</div>
            <h2 className="mt-2 text-xl font-bold tracking-tight text-slate-950">Pipeline Comparison</h2>
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
                    <td className="border-y border-sky-100 bg-sky-50/60 px-3 py-3 text-right text-sm font-semibold text-slate-950">{row.eoiOrigin}</td>
                    <td className="rounded-r-2xl border border-l-0 border-cyan-100 bg-cyan-50/60 px-3 py-3 text-right text-sm font-semibold text-slate-950">{row.direct}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="analytics-card p-5 lg:p-6">
          <div className="mb-4">
            <div className="dash-label">Cohorts</div>
            <h2 className="mt-2 text-xl font-bold tracking-tight text-slate-950">Monthly Conversion Cohorts</h2>
          </div>
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics.cohortRows} layout="vertical" margin={{ left: 10, right: 10, top: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: '#64748B' }} />
                <YAxis type="category" dataKey="label" width={150} tick={{ fontSize: 11, fill: '#64748B' }} />
                <Tooltip formatter={(value: number) => [value, 'Count']} />
                <Bar dataKey="count" radius={[0, 8, 8, 0]}>
                  {analytics.cohortRows.map((row, index) => (
                    <Cell key={`${row.label}-${index}`} fill={index % 2 === 0 ? '#2563EB' : '#7C3AED'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
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
              <div key={bucket.key} className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
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
              </div>
            ))}
          </div>
        </div>

        <div className="analytics-card p-5 lg:p-6">
          <div className="mb-5">
            <div className="dash-label">Aging</div>
            <h2 className="mt-2 text-xl font-bold tracking-tight text-slate-950">Tender Aging</h2>
          </div>
          <div className="space-y-4">
            {analytics.tenderAgingBuckets.map((bucket) => (
              <div key={bucket.key} className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
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
              </div>
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
              <div key={reason.label}>
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
              </div>
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
              <div key={item.label} className={`inline-block h-full ${item.color}`} style={{ width: `${clampPercent(item.percent)}%` }} />
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {analytics.postBidBreakdown.map((item) => (
              <div key={item.label} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className={`h-3 w-3 rounded-sm ${item.color}`} />
                  <span className="text-sm font-medium text-slate-700">{item.label}</span>
                </div>
                <span className="text-sm font-semibold text-slate-950">{item.count}</span>
              </div>
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
                <div key={row.client} className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
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
                </div>
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
              <div key={`${row.refNo}-${row.tenderName}`} className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{row.tenderName}</div>
                    <div className="mt-1 text-xs text-slate-500">{row.refNo || 'NO REF'} • {row.client}</div>
                  </div>
                  <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700">{row.ageDays} days</Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mb-6 analytics-card p-5 lg:mb-8 lg:p-6">
        <div className="mb-5">
          <div className="dash-label">Monthly Signals</div>
          <h2 className="mt-2 text-xl font-bold tracking-tight text-slate-950">Monthly Heatmap</h2>
          <p className="mt-2 text-sm text-slate-500">Received and submitted use explicit dates from your records. Won and Lost are plotted against the best available tender-side date currently in the dataset.</p>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[720px]">
            <div className="grid" style={{ gridTemplateColumns: `160px repeat(${analytics.monthColumns.length}, minmax(48px, 1fr))` }}>
              <div />
              {analytics.monthColumns.map((month) => (
                <div key={month} className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                  {formatMonthLabel(month)}
                </div>
              ))}

              {analytics.monthlyHeatmap.map((row) => (
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
                        <div className={`flex h-11 w-11 items-center justify-center rounded-xl text-xs font-semibold text-white ${colorClass}`} style={{ opacity }}>
                          {cell.value || '·'}
                        </div>
                      </div>
                    );
                  })}
                </Fragment>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="analytics-card overflow-hidden border-dashed border-slate-300 bg-slate-50/80">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-xl">
              <GitBranch className="h-5 w-5 text-slate-700" />
              Experimental Roadmap
            </CardTitle>
            <CardDescription>Hidden by default. This currently measures EOI to tender timing only, because that is the clean roadmap available in the existing data.</CardDescription>
          </div>
          <Button type="button" variant="outline" className="gap-2" onClick={() => setShowRoadmap((current) => !current)}>
            {showRoadmap ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            {showRoadmap ? 'Hide timeline' : 'Show timeline'}
          </Button>
        </CardHeader>

        {showRoadmap && (
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-sky-200 bg-white p-4">
                <div className="dash-label">EOI to Tender Average</div>
                <div className="mt-3 text-3xl font-extrabold tracking-tight text-slate-950">{analytics.roadmapAverage.toFixed(1)} days</div>
                <div className="mt-2 text-xs text-slate-500">Average lag between EOI receipt and tender appearance.</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="dash-label">Coverage</div>
                <div className="mt-3 text-3xl font-extrabold tracking-tight text-slate-950">{analytics.roadmapCoverage}</div>
                <div className="mt-2 text-xs text-slate-500">EOI-origin opportunities with enough dates to measure the journey.</div>
              </div>
            </div>
            <div className="grid gap-4 lg:grid-cols-4">
              <FlowNode label="EOI" count={analytics.eoiOrigin.eoiCount} tone="primary" />
              <div className="hidden lg:flex items-center justify-center">
                <div className="h-2 w-24 rounded-full bg-gradient-to-r from-sky-400 via-violet-400 to-cyan-400 animate-pulse" />
              </div>
              <FlowNode label="Tender" count={analytics.eoiOrigin.becameTenderCount} tone="info" />
              <FlowNode label="Awarded" count={analytics.eoiOrigin.awardedCount} tone="success" />
            </div>
          </CardContent>
        )}
      </section>

      {isLoading && opportunities.length === 0 && (
        <Card className="mt-6">
          <CardContent className="pt-6 text-sm text-slate-500">Loading analytics...</CardContent>
        </Card>
      )}
    </div>
  );
};

export default Analytics;
