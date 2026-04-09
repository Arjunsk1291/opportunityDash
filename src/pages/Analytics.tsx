import { Fragment, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Crown,
  GitBranch,
  Hourglass,
  Sparkles,
  TimerReset,
  TrendingUp,
  Waves,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useData } from '@/contexts/DataContext';
import type { Opportunity } from '@/data/opportunityData';
import { getDisplayStatus } from '@/lib/opportunityStatus';

const FUNNEL_COLORS = ['#93C5FD', '#8B5CF6', '#06B6D4', '#10B981'];
const OUTCOME_COLORS = ['#10B981', '#F97316', '#94A3B8'];
const POST_BID_TYPE_LABELS: Record<string, string> = {
  TECHNICAL_CLARIFICATION_MEETING: 'Technical clarification',
  TECHNICAL_PRESENTATION: 'Technical presentation',
  NO_RESPONSE: 'No response',
  OTHER: 'Other',
};

type OpportunityGroup = {
  key: string;
  eoiRows: Opportunity[];
  tenderRows: Opportunity[];
  primary: Opportunity | null;
};

const normalizeText = (value: string | null | undefined) => String(value || '').trim();
const normalizeTextLower = (value: string | null | undefined) => normalizeText(value).toLowerCase();
const normalizeRefNo = (value: string | null | undefined) => normalizeText(value).toUpperCase();
const getBaseRefNo = (value: string | null | undefined) => normalizeRefNo(value).replace(/_EOI$/i, '');
const isEoiRefNo = (value: string | null | undefined) => /_EOI$/i.test(normalizeRefNo(value));
const formatPercent = (value: number) => `${value.toFixed(1)}%`;
const safePercent = (numerator: number, denominator: number) => (denominator > 0 ? (numerator / denominator) * 100 : 0);

const getTimestamp = (value: string | null | undefined) => {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const getMonthKey = (value: string | null | undefined) => (value ? String(value).slice(0, 7) : '');

const formatMonthLabel = (value: string) => {
  if (!value || value.length < 7) return 'Unknown';
  const parsed = new Date(`${value}-01T00:00:00`);
  return parsed.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
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

    return getTimestamp(b.tenderSubmittedDate || b.dateTenderReceived) - getTimestamp(a.tenderSubmittedDate || a.dateTenderReceived);
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

const getGroupStatus = (group: OpportunityGroup) => getDisplayStatus(group.primary || {});
const getGroupClient = (group: OpportunityGroup) => normalizeText(group.primary?.clientName || group.eoiRows[0]?.clientName || group.tenderRows[0]?.clientName) || 'Unknown';
const getGroupValue = (group: OpportunityGroup) => Number(group.primary?.opportunityValue || group.tenderRows[0]?.opportunityValue || 0);
const getEarliestEoiTimestamp = (group: OpportunityGroup) => {
  const timestamps = group.eoiRows.map((row) => getTimestamp(row.dateTenderReceived || row.tenderSubmittedDate)).filter(Boolean);
  return timestamps.length ? Math.min(...timestamps) : 0;
};
const getEarliestTenderTimestamp = (group: OpportunityGroup) => {
  const timestamps = group.tenderRows.map((row) => getTimestamp(row.dateTenderReceived || row.tenderSubmittedDate)).filter(Boolean);
  return timestamps.length ? Math.min(...timestamps) : 0;
};
const getSubmittedTimestamp = (group: OpportunityGroup) => {
  const timestamps = group.tenderRows.map((row) => getTimestamp(row.tenderSubmittedDate)).filter(Boolean);
  return timestamps.length ? Math.min(...timestamps) : 0;
};

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
  if (/(price|pricing|commercial|cost|budget|rate)/.test(normalized)) return 'Commercial';
  if (/(technical|specification|compliance|qualification|experience)/.test(normalized)) return 'Technical';
  if (/(no response|silent|no update|awaiting)/.test(normalized)) return 'No response';
  if (/(timeline|delay|deadline|time)/.test(normalized)) return 'Timeline';
  if (/(partner|consortium|subcontract)/.test(normalized)) return 'Partner strategy';
  if (/(document|submission|format|incomplete)/.test(normalized)) return 'Documentation';
  if (/(competitor|competition|incumbent)/.test(normalized)) return 'Competitive';
  return 'Other';
};

const getAgingBucket = (days: number) => {
  if (days <= 15) return '0-15';
  if (days <= 30) return '16-30';
  if (days <= 60) return '31-60';
  return '60+';
};

const getPostBidLabel = (type: string | null | undefined) => POST_BID_TYPE_LABELS[normalizeText(type).toUpperCase()] || 'Other';

const buildPostBidTrend = (groups: OpportunityGroup[]) => {
  const trend = new Map<string, Record<string, number>>();

  groups.forEach((group) => {
    const primary = group.primary;
    if (!primary?.postBidDetailType || !primary?.postBidDetailUpdatedAt) return;
    const month = getMonthKey(primary.postBidDetailUpdatedAt);
    if (!month) return;
    const label = getPostBidLabel(primary.postBidDetailType);
    const current = trend.get(month) || { month };
    current[label] = (current[label] || 0) + 1;
    trend.set(month, current);
  });

  const rows = Array.from(trend.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6)
    .map(([month, values]) => ({
      month: formatMonthLabel(month),
      technicalClarification: values['Technical clarification'] || 0,
      technicalPresentation: values['Technical presentation'] || 0,
      noResponse: values['No response'] || 0,
      other: values.Other || 0,
    }));

  if (rows.length) return rows;

  return [{
    month: 'Current',
    technicalClarification: 0,
    technicalPresentation: 0,
    noResponse: 0,
    other: 0,
  }];
};

const buildFunnelData = (label: string, total: number, submitted: number, awarded: number, originCount?: number) => ([
  { stage: label, count: total, fill: FUNNEL_COLORS[0] },
  ...(originCount === undefined ? [] : [{ stage: 'Became Tender', count: originCount, fill: FUNNEL_COLORS[1] }]),
  { stage: 'RFT Submitted', count: submitted, fill: originCount === undefined ? FUNNEL_COLORS[1] : FUNNEL_COLORS[2] },
  { stage: 'Awarded', count: awarded, fill: originCount === undefined ? FUNNEL_COLORS[2] : FUNNEL_COLORS[3] },
]);

const Analytics = () => {
  const { opportunities, isLoading, error } = useData();
  const [selectedGroup, setSelectedGroup] = useState('ALL');
  const [showRoadmap, setShowRoadmap] = useState(false);

  const groupOptions = useMemo(() => {
    const groups = Array.from(new Set(opportunities.map((opp) => normalizeText(opp.groupClassification)).filter(Boolean))).sort((a, b) => a.localeCompare(b));
    return ['ALL', ...groups];
  }, [opportunities]);

  const filteredOpportunities = useMemo(() => (
    selectedGroup === 'ALL'
      ? opportunities
      : opportunities.filter((opp) => normalizeText(opp.groupClassification) === selectedGroup)
  ), [opportunities, selectedGroup]);

  const groupedOpportunities = useMemo(() => buildOpportunityGroups(filteredOpportunities), [filteredOpportunities]);

  const analytics = useMemo(() => {
    const eoiOriginGroups = groupedOpportunities.filter((group) => group.eoiRows.length > 0);
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

    const allTenderGroups = groupedOpportunities.filter((group) => group.tenderRows.length > 0);
    const openTenderGroups = allTenderGroups.filter((group) => !hasSubmittedTender(group));

    const submittedValue = [...eoiOriginSubmittedGroups, ...directSubmittedGroups].reduce((sum, group) => sum + getGroupValue(group), 0);
    const awardedValue = [...eoiOriginAwardedGroups, ...directAwardedGroups].reduce((sum, group) => sum + getGroupValue(group), 0);

    const clientRows = Object.values(
      eoiOriginGroups.reduce((acc, group) => {
        const client = getGroupClient(group);
        if (!acc[client]) acc[client] = { client, eoiCount: 0, becameTender: 0, conversionRate: 0 };
        acc[client].eoiCount += 1;
        if (group.tenderRows.length > 0) acc[client].becameTender += 1;
        return acc;
      }, {} as Record<string, { client: string; eoiCount: number; becameTender: number; conversionRate: number }>),
    )
      .map((row) => ({ ...row, conversionRate: Number(safePercent(row.becameTender, row.eoiCount).toFixed(1)) }))
      .sort((a, b) => b.eoiCount - a.eoiCount)
      .slice(0, 8);

    const agingBucketRows = Object.entries(
      openTenderGroups.reduce<Record<string, number>>((acc, group) => {
        const ageDays = getDayDiff(getEarliestTenderTimestamp(group), Date.now());
        const bucket = getAgingBucket(ageDays);
        acc[bucket] = (acc[bucket] || 0) + 1;
        return acc;
      }, { '0-15': 0, '16-30': 0, '31-60': 0, '60+': 0 }),
    ).map(([bucket, count]) => ({ bucket, count }));

    const postBidTrendRows = buildPostBidTrend(allTenderGroups);

    const lossReasonBreakdown = Object.entries(
      [...eoiOriginLostGroups, ...directLostGroups].reduce<Record<string, number>>((acc, group) => {
        const category = categorizeLossReason(normalizeText(group.primary?.remarksReason || group.primary?.comments));
        acc[category] = (acc[category] || 0) + 1;
        return acc;
      }, {}),
    )
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    const monthlyCohortView = Object.values(
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

    const staleEoiRows = eoiOriginGroups
      .filter((group) => group.tenderRows.length === 0)
      .map((group) => ({
        refNo: normalizeText(group.eoiRows[0]?.opportunityRefNo || group.primary?.opportunityRefNo),
        tenderName: normalizeText(group.eoiRows[0]?.tenderName || group.primary?.tenderName) || 'Untitled',
        client: getGroupClient(group),
        ageDays: getDayDiff(getEarliestEoiTimestamp(group), Date.now()),
      }))
      .sort((a, b) => b.ageDays - a.ageDays);

    const staleEoiBuckets = Object.entries(
      staleEoiRows.reduce<Record<string, number>>((acc, row) => {
        const bucket = row.ageDays > 90 ? '90+' : row.ageDays > 60 ? '61-90' : row.ageDays > 30 ? '31-60' : '0-30';
        acc[bucket] = (acc[bucket] || 0) + 1;
        return acc;
      }, { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 }),
    ).map(([bucket, count]) => ({ bucket, count }));

    const roadmapDays = eoiOriginTenderGroups
      .map((group) => getDayDiff(getEarliestEoiTimestamp(group), getEarliestTenderTimestamp(group)))
      .filter((days) => days > 0);

    return {
      eoiOrigin: {
        eoiCount: eoiOriginGroups.length,
        becameTenderCount: eoiOriginTenderGroups.length,
        submittedCount: eoiOriginSubmittedGroups.length,
        awardedCount: eoiOriginAwardedGroups.length,
        lostCount: eoiOriginLostGroups.length,
        openDecisionCount: eoiOriginOpenDecisionGroups.length,
        conversionRate: safePercent(eoiOriginTenderGroups.length, eoiOriginGroups.length),
        winRate: safePercent(eoiOriginAwardedGroups.length, eoiOriginSubmittedGroups.length),
      },
      directTender: {
        tenderCount: directTenderGroups.length,
        submittedCount: directSubmittedGroups.length,
        awardedCount: directAwardedGroups.length,
        lostCount: directLostGroups.length,
        openDecisionCount: directOpenDecisionGroups.length,
        winRate: safePercent(directAwardedGroups.length, directSubmittedGroups.length),
      },
      overall: {
        submittedCount: eoiOriginSubmittedGroups.length + directSubmittedGroups.length,
        awardedCount: eoiOriginAwardedGroups.length + directAwardedGroups.length,
        valueWeightedWinRate: safePercent(awardedValue, submittedValue),
      },
      clientRows,
      agingBucketRows,
      postBidTrendRows,
      lossReasonBreakdown,
      monthlyCohortView,
      staleEoiRows: staleEoiRows.slice(0, 6),
      staleEoiBuckets,
      roadmapAverage: average(roadmapDays),
      roadmapCoverage: roadmapDays.length,
      eoiFunnel: buildFunnelData('EOI Received', eoiOriginGroups.length, eoiOriginSubmittedGroups.length, eoiOriginAwardedGroups.length, eoiOriginTenderGroups.length),
      directFunnel: buildFunnelData('Direct Tender', directTenderGroups.length, directSubmittedGroups.length, directAwardedGroups.length),
      outcomePie: [
        { name: 'Won', value: eoiOriginAwardedGroups.length + directAwardedGroups.length },
        { name: 'Lost/Regretted', value: eoiOriginLostGroups.length + directLostGroups.length },
        { name: 'Not decided', value: eoiOriginOpenDecisionGroups.length + directOpenDecisionGroups.length },
      ],
    };
  }, [groupedOpportunities]);

  const scopeLabel = selectedGroup === 'ALL' ? 'All Verticals' : selectedGroup;

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[28px] border border-sky-100 bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.18),_transparent_34%),linear-gradient(135deg,#f8fbff_0%,#eef6ff_45%,#f8fafc_100%)] p-6 shadow-sm animate-in fade-in-0 slide-in-from-bottom-3 duration-500">
        <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-sky-200/30 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-28 w-28 rounded-full bg-violet-200/30 blur-3xl" />
        <div className="relative flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-3">
            <Badge className="w-fit border border-sky-200 bg-white/80 text-sky-700">Corrected Funnel Logic</Badge>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-900">EOI vs Direct Tender Analytics</h1>
              <p className="max-w-3xl text-sm leading-6 text-slate-600">
                EOIs are now tracked only as an origin story. What matters is which EOIs became tenders, which of those were submitted, and which were awarded, separated from direct tenders that never started as EOI.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-2xl border border-white/80 bg-white/85 p-4 shadow-sm sm:flex-row sm:items-center">
            <div className="space-y-1">
              <div className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">Scope</div>
              <div className="text-lg font-semibold text-slate-900">{scopeLabel}</div>
            </div>
            <Select value={selectedGroup} onValueChange={setSelectedGroup}>
              <SelectTrigger className="w-full min-w-[220px] border-sky-100 bg-white sm:w-[240px]">
                <SelectValue placeholder="Select vertical" />
              </SelectTrigger>
              <SelectContent>
                {groupOptions.map((group) => (
                  <SelectItem key={group} value={group}>
                    {group === 'ALL' ? 'All Verticals' : group}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      {error && (
        <Card className="border-rose-200 bg-rose-50">
          <CardContent className="pt-6 text-sm text-rose-700">{error}</CardContent>
        </Card>
      )}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {[
          { label: 'EOI Received', value: analytics.eoiOrigin.eoiCount, note: `${analytics.eoiOrigin.becameTenderCount} became tenders`, icon: Sparkles, tone: 'border-sky-100 from-sky-500/15' },
          { label: 'EOI Win %', value: formatPercent(analytics.eoiOrigin.winRate), note: 'Awarded from submitted EOI-origin tenders', icon: GitBranch, tone: 'border-violet-100 from-violet-500/15' },
          { label: 'Direct Tenders', value: analytics.directTender.tenderCount, note: 'No EOI history behind these', icon: ArrowRight, tone: 'border-cyan-100 from-cyan-500/15' },
          { label: 'Direct Win %', value: formatPercent(analytics.directTender.winRate), note: 'Awarded from submitted direct tenders', icon: Crown, tone: 'border-emerald-100 from-emerald-500/15' },
          { label: 'Value Win %', value: formatPercent(analytics.overall.valueWeightedWinRate), note: 'Awarded value / total submitted value', icon: TrendingUp, tone: 'border-amber-100 from-amber-500/15' },
        ].map((item, index) => (
          <Card key={item.label} className={`bg-gradient-to-br ${item.tone} via-white to-white animate-in fade-in-0 slide-in-from-bottom-4 duration-500`} style={{ animationDelay: `${index * 70}ms` }}>
            <CardContent className="pt-6">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-slate-600">{item.label}</p>
                  <p className="text-3xl font-semibold tracking-tight text-slate-950">{item.value}</p>
                  <p className="text-xs leading-5 text-slate-500">{item.note}</p>
                </div>
                <div className="rounded-2xl border border-white/80 bg-white/90 p-3 shadow-sm">
                  <item.icon className="h-5 w-5 text-slate-700" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        {[
          {
            title: 'EOI-Origin Funnel',
            description: 'EOI received -> became tender -> RFT submitted -> awarded',
            data: analytics.eoiFunnel,
          },
          {
            title: 'Direct Tender Funnel',
            description: 'Direct tender received -> RFT submitted -> awarded',
            data: analytics.directFunnel,
          },
        ].map((chart) => (
          <Card key={chart.title} className="animate-in fade-in-0 slide-in-from-bottom-4 duration-500">
            <CardHeader>
              <CardTitle className="text-xl">{chart.title}</CardTitle>
              <CardDescription>{chart.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chart.data}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="stage" tick={{ fontSize: 11, fill: '#475569' }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#475569' }} />
                    <Tooltip formatter={(value: number) => [value, 'Count']} />
                    <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                      {chart.data.map((entry) => (
                        <Cell key={`${chart.title}-${entry.stage}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <Card className="animate-in fade-in-0 slide-in-from-bottom-4 duration-500">
          <CardHeader>
            <CardTitle className="text-xl">Overall Submitted Outcomes</CardTitle>
            <CardDescription>Across both EOI-origin and direct tenders, but still using submitted = actual RFT submitted only.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={analytics.outcomePie} dataKey="value" innerRadius={64} outerRadius={100} paddingAngle={4}>
                    {OUTCOME_COLORS.map((color) => (
                      <Cell key={color} fill={color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => [value, 'Count']} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="animate-in fade-in-0 slide-in-from-bottom-4 duration-500">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Hourglass className="h-5 w-5 text-orange-500" />
              Tender Aging Buckets
            </CardTitle>
            <CardDescription>Open tenders that are not yet submitted, grouped by age since tender received.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.agingBucketRows}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="bucket" tick={{ fontSize: 12, fill: '#475569' }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#475569' }} />
                  <Tooltip formatter={(value: number) => [value, 'Open tenders']} />
                  <Bar dataKey="count" fill="#F59E0B" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <Card className="animate-in fade-in-0 slide-in-from-bottom-4 duration-500">
          <CardHeader>
            <CardTitle className="text-xl">Client-wise EOI Conversion Rate</CardTitle>
            <CardDescription>Only EOI-origin opportunities are considered here. Direct tenders are intentionally excluded.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.clientRows} layout="vertical" margin={{ left: 10, right: 10, top: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis type="number" tickFormatter={(value) => `${value}%`} tick={{ fontSize: 12, fill: '#475569' }} />
                  <YAxis type="category" dataKey="client" width={120} tick={{ fontSize: 11, fill: '#475569' }} />
                  <Tooltip formatter={(value: number, name: string) => [name === 'conversionRate' ? `${value}%` : value, name === 'conversionRate' ? 'Conversion rate' : name]} />
                  <Bar dataKey="conversionRate" fill="#8B5CF6" radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="animate-in fade-in-0 slide-in-from-bottom-4 duration-500">
          <CardHeader>
            <CardTitle className="text-xl">EOI Month to Tender Month</CardTitle>
            <CardDescription>This is the cohort view you described: EOI first, then the corresponding tender month.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.monthlyCohortView} layout="vertical" margin={{ left: 10, right: 10, top: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: '#475569' }} />
                  <YAxis type="category" dataKey="label" width={150} tick={{ fontSize: 11, fill: '#475569' }} />
                  <Tooltip formatter={(value: number) => [value, 'Count']} />
                  <Bar dataKey="count" fill="#2563EB" radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <Card className="animate-in fade-in-0 slide-in-from-bottom-4 duration-500">
          <CardHeader>
            <CardTitle className="text-xl">Post-bid Detail Trend</CardTitle>
            <CardDescription>Kept as a supporting chart for the tender side of the lifecycle.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.postBidTrendRows}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#475569' }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#475569' }} />
                  <Tooltip />
                  <Bar dataKey="technicalClarification" stackId="postbid" fill="#F59E0B" radius={[6, 6, 0, 0]} name="Technical clarification" />
                  <Bar dataKey="technicalPresentation" stackId="postbid" fill="#2563EB" name="Technical presentation" />
                  <Bar dataKey="noResponse" stackId="postbid" fill="#94A3B8" name="No response" />
                  <Bar dataKey="other" stackId="postbid" fill="#D946EF" name="Other" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="animate-in fade-in-0 slide-in-from-bottom-4 duration-500">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <ArrowRight className="h-5 w-5 text-rose-600" />
              Lost / Regretted Reason Breakdown
            </CardTitle>
            <CardDescription>Derived from `remarksReason` and `comments`, using broad categories.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.lossReasonBreakdown} layout="vertical" margin={{ left: 10, right: 10, top: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: '#475569' }} />
                  <YAxis type="category" dataKey="reason" width={120} tick={{ fontSize: 11, fill: '#475569' }} />
                  <Tooltip formatter={(value: number) => [value, 'Count']} />
                  <Bar dataKey="count" fill="#F97316" radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <Card className="animate-in fade-in-0 slide-in-from-bottom-4 duration-500">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <TimerReset className="h-5 w-5 text-slate-700" />
              Stale EOI Tracker
            </CardTitle>
            <CardDescription>Only pure EOIs that have not yet become tenders.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.staleEoiBuckets}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="bucket" tick={{ fontSize: 12, fill: '#475569' }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#475569' }} />
                  <Tooltip formatter={(value: number) => [value, 'EOIs']} />
                  <Bar dataKey="count" fill="#0F172A" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="space-y-3">
              {analytics.staleEoiRows.length === 0 && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                  No stale EOIs in this scope.
                </div>
              )}
              {analytics.staleEoiRows.map((row) => (
                <div key={`${row.refNo}-${row.tenderName}`} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{row.tenderName}</div>
                      <div className="text-xs text-slate-500">{row.refNo || 'NO REF'} · {row.client}</div>
                    </div>
                    <Badge variant="outline">{row.ageDays} days</Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="animate-in fade-in-0 slide-in-from-bottom-4 duration-500">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Waves className="h-5 w-5 text-violet-600" />
              Sankey Concept
            </CardTitle>
            <CardDescription>Placeholder for a proper animated Sankey later, but now split by EOI-origin and direct tender.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 via-white to-sky-50 p-5">
              <div className="grid gap-4 md:grid-cols-2">
                {[
                  {
                    title: 'EOI-Origin',
                    steps: [
                      { label: 'EOI', value: analytics.eoiOrigin.eoiCount, tone: 'bg-sky-100 text-sky-800 border-sky-200' },
                      { label: 'Tender', value: analytics.eoiOrigin.becameTenderCount, tone: 'bg-violet-100 text-violet-800 border-violet-200' },
                      { label: 'Submitted', value: analytics.eoiOrigin.submittedCount, tone: 'bg-cyan-100 text-cyan-800 border-cyan-200' },
                      { label: 'Awarded', value: analytics.eoiOrigin.awardedCount, tone: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
                    ],
                  },
                  {
                    title: 'Direct Tender',
                    steps: [
                      { label: 'Tender', value: analytics.directTender.tenderCount, tone: 'bg-violet-100 text-violet-800 border-violet-200' },
                      { label: 'Submitted', value: analytics.directTender.submittedCount, tone: 'bg-cyan-100 text-cyan-800 border-cyan-200' },
                      { label: 'Awarded', value: analytics.directTender.awardedCount, tone: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
                    ],
                  },
                ].map((lane) => (
                  <div key={lane.title} className="space-y-3">
                    <div className="text-sm font-semibold text-slate-900">{lane.title}</div>
                    <div className="grid gap-3">
                      {lane.steps.map((step, index) => (
                        <Fragment key={`${lane.title}-${step.label}`}>
                          <div className={`rounded-2xl border px-4 py-4 text-center ${step.tone}`}>
                            <div className="text-xs font-medium uppercase tracking-[0.18em]">{step.label}</div>
                            <div className="mt-2 text-3xl font-semibold">{step.value}</div>
                          </div>
                          {index < lane.steps.length - 1 && (
                            <div className="flex justify-center">
                              <div className="h-2 w-20 rounded-full bg-gradient-to-r from-sky-400 via-violet-400 to-cyan-400 animate-pulse" />
                            </div>
                          )}
                        </Fragment>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <section>
        <Card className="overflow-hidden border-dashed border-slate-300 bg-slate-50/80 animate-in fade-in-0 slide-in-from-bottom-4 duration-500">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-xl">
                <TimerReset className="h-5 w-5 text-slate-700" />
                Experimental Roadmap
              </CardTitle>
              <CardDescription>Still hidden by default. Only EOI-origin journeys are used here, because direct tenders have no EOI start point.</CardDescription>
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
                  <div className="text-xs font-medium uppercase tracking-[0.18em] text-sky-500">EOI to Tender Average</div>
                  <div className="mt-3 text-3xl font-semibold text-slate-950">{analytics.roadmapAverage.toFixed(1)} days</div>
                  <div className="mt-2 text-xs text-slate-500">Average lag between EOI creation and corresponding tender arrival.</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Coverage</div>
                  <div className="mt-3 text-3xl font-semibold text-slate-950">{analytics.roadmapCoverage}</div>
                  <div className="mt-2 text-xs text-slate-500">EOI-origin opportunities with enough dates to measure that journey.</div>
                </div>
              </div>
            </CardContent>
          )}
        </Card>
      </section>

      {isLoading && opportunities.length === 0 && (
        <Card>
          <CardContent className="pt-6 text-sm text-slate-500">Loading analytics...</CardContent>
        </Card>
      )}
    </div>
  );
};

export default Analytics;
