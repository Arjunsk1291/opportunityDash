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
  Activity,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Crown,
  GitBranch,
  Hourglass,
  Radar,
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

const PIE_COLORS = ['#10B981', '#F97316', '#94A3B8'];
const POST_BID_TYPE_LABELS: Record<string, string> = {
  TECHNICAL_CLARIFICATION_MEETING: 'Technical clarification',
  TECHNICAL_PRESENTATION: 'Technical presentation',
  NO_RESPONSE: 'No response',
  OTHER: 'Other',
};

const normalizeText = (value: string | null | undefined) => String(value || '').trim();
const normalizeTextLower = (value: string | null | undefined) => normalizeText(value).toLowerCase();
const normalizeRefNo = (value: string | null | undefined) => normalizeText(value).toUpperCase();
const getBaseRefNo = (value: string | null | undefined) => normalizeRefNo(value).replace(/_EOI$/i, '');
const isEoiRefNo = (value: string | null | undefined) => /_EOI$/i.test(normalizeRefNo(value));

type OpportunityGroup = {
  key: string;
  eoiRows: Opportunity[];
  tenderRows: Opportunity[];
  primary: Opportunity | null;
};

const getBusinessKey = (opp: Opportunity, index: number) => {
  const ref = getBaseRefNo(opp.opportunityRefNo);
  const tenderName = normalizeTextLower(opp.tenderName);
  if (ref && tenderName) return `${ref}::${tenderName}`;
  if (ref) return ref;
  if (tenderName) return tenderName;
  return `untitled-${index}`;
};

const getTimestamp = (value: string | null | undefined) => {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const getMonthKey = (value: string | null | undefined) => {
  if (!value) return '';
  return String(value).slice(0, 7);
};

const formatMonthLabel = (value: string) => {
  if (!value || value.length < 7) return 'Unknown';
  const parsed = new Date(`${value}-01T00:00:00`);
  return parsed.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
};

const formatPercent = (value: number) => `${value.toFixed(1)}%`;
const safePercent = (numerator: number, denominator: number) => (denominator > 0 ? (numerator / denominator) * 100 : 0);

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

const getGroupClient = (group: OpportunityGroup) => normalizeText(group.primary?.clientName || group.eoiRows[0]?.clientName || group.tenderRows[0]?.clientName) || 'Unknown';
const getGroupStatus = (group: OpportunityGroup) => getDisplayStatus(group.primary || {});
const getGroupValue = (group: OpportunityGroup) => Number(group.primary?.opportunityValue || group.tenderRows[0]?.opportunityValue || 0);
const getEarliestEoiDate = (group: OpportunityGroup) => {
  const timestamps = group.eoiRows.map((row) => getTimestamp(row.dateTenderReceived || row.tenderSubmittedDate)).filter(Boolean);
  return timestamps.length ? Math.min(...timestamps) : 0;
};
const getEarliestTenderDate = (group: OpportunityGroup) => {
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
      ...values,
      month: formatMonthLabel(month),
      technicalClarification: values['Technical clarification'] || 0,
      technicalPresentation: values['Technical presentation'] || 0,
      noResponse: values['No response'] || 0,
      other: values.Other || 0,
    }));

  if (rows.length) return rows;

  const fallbackCounts = groups.reduce((acc, group) => {
    const primary = group.primary;
    if (!primary?.postBidDetailType) return acc;
    const label = getPostBidLabel(primary.postBidDetailType);
    acc[label] = (acc[label] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return [{
    month: 'Current',
    technicalClarification: fallbackCounts['Technical clarification'] || 0,
    technicalPresentation: fallbackCounts['Technical presentation'] || 0,
    noResponse: fallbackCounts['No response'] || 0,
    other: fallbackCounts.Other || 0,
  }];
};

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
    const eoiPool = groupedOpportunities.filter((group) => group.eoiRows.length > 0);
    const tenderGroups = groupedOpportunities.filter((group) => group.tenderRows.length > 0);
    const convertedGroups = groupedOpportunities.filter((group) => group.eoiRows.length > 0 && group.tenderRows.length > 0);
    const submittedGroups = tenderGroups.filter(hasSubmittedTender);
    const awardedGroups = submittedGroups.filter(isAwardedGroup);
    const lostGroups = submittedGroups.filter(isLostGroup);
    const openDecisionGroups = submittedGroups.filter(isOpenDecisionGroup);
    const notSubmittedTenderGroups = tenderGroups.filter((group) => !hasSubmittedTender(group));

    const submittedValue = submittedGroups.reduce((sum, group) => sum + getGroupValue(group), 0);
    const awardedValue = awardedGroups.reduce((sum, group) => sum + getGroupValue(group), 0);

    const clientRows = Object.values(
      eoiPool.reduce((acc, group) => {
        const client = getGroupClient(group);
        if (!acc[client]) {
          acc[client] = { client, eoiPool: 0, converted: 0, tenders: 0, conversionRate: 0 };
        }
        acc[client].eoiPool += 1;
        if (group.tenderRows.length > 0) acc[client].converted += 1;
        if (group.tenderRows.length > 0) acc[client].tenders += 1;
        return acc;
      }, {} as Record<string, { client: string; eoiPool: number; converted: number; tenders: number; conversionRate: number }>),
    )
      .map((row) => ({ ...row, conversionRate: Number(safePercent(row.converted, row.eoiPool).toFixed(1)) }))
      .sort((a, b) => b.eoiPool - a.eoiPool)
      .slice(0, 8);

    const agingBuckets = notSubmittedTenderGroups.reduce<Record<string, number>>((acc, group) => {
      const receivedTimestamp = getEarliestTenderDate(group);
      if (!receivedTimestamp) return acc;
      const ageDays = getDayDiff(receivedTimestamp, Date.now());
      const bucket = getAgingBucket(ageDays);
      acc[bucket] = (acc[bucket] || 0) + 1;
      return acc;
    }, { '0-15': 0, '16-30': 0, '31-60': 0, '60+': 0 });

    const agingBucketRows = Object.entries(agingBuckets).map(([bucket, count]) => ({ bucket, count }));

    const postBidTrendRows = buildPostBidTrend(tenderGroups);

    const lossReasonRows = lostGroups.reduce<Record<string, number>>((acc, group) => {
      const reasonText = normalizeText(group.primary?.remarksReason || group.primary?.comments);
      const category = categorizeLossReason(reasonText);
      acc[category] = (acc[category] || 0) + 1;
      return acc;
    }, {});

    const lossReasonBreakdown = Object.entries(lossReasonRows)
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    const cohortRows = convertedGroups.reduce<Record<string, { label: string; count: number; avgDays: number[] }>>((acc, group) => {
      const eoiMonth = getMonthKey(group.eoiRows[0]?.dateTenderReceived || group.eoiRows[0]?.tenderSubmittedDate);
      const tenderMonth = getMonthKey(group.tenderRows[0]?.dateTenderReceived || group.tenderRows[0]?.tenderSubmittedDate);
      if (!eoiMonth || !tenderMonth) return acc;
      const label = `${formatMonthLabel(eoiMonth)} -> ${formatMonthLabel(tenderMonth)}`;
      if (!acc[label]) acc[label] = { label, count: 0, avgDays: [] };
      acc[label].count += 1;
      acc[label].avgDays.push(getDayDiff(getEarliestEoiDate(group), getEarliestTenderDate(group)));
      return acc;
    }, {});

    const monthlyCohortView = Object.values(cohortRows)
      .map((row) => ({ label: row.label, count: row.count, avgDays: Number(average(row.avgDays).toFixed(1)) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    const staleEoiRows = groupedOpportunities
      .filter((group) => group.eoiRows.length > 0 && group.tenderRows.length === 0)
      .map((group) => {
        const firstEoiTimestamp = getEarliestEoiDate(group);
        return {
          refNo: normalizeText(group.eoiRows[0]?.opportunityRefNo || group.primary?.opportunityRefNo),
          tenderName: normalizeText(group.eoiRows[0]?.tenderName || group.primary?.tenderName) || 'Untitled',
          client: getGroupClient(group),
          ageDays: getDayDiff(firstEoiTimestamp, Date.now()),
        };
      })
      .sort((a, b) => b.ageDays - a.ageDays);

    const staleEoiBuckets = staleEoiRows.reduce<Record<string, number>>((acc, row) => {
      const bucket = row.ageDays > 90 ? '90+' : row.ageDays > 60 ? '61-90' : row.ageDays > 30 ? '31-60' : '0-30';
      acc[bucket] = (acc[bucket] || 0) + 1;
      return acc;
    }, { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 });

    const roadmapDays = convertedGroups
      .map((group) => getDayDiff(getEarliestEoiDate(group), getEarliestTenderDate(group)))
      .filter((days) => days > 0);

    return {
      totalEoiPool: eoiPool.length,
      pureEoiCount: staleEoiRows.length,
      convertedCount: convertedGroups.length,
      tenderCount: tenderGroups.length,
      submittedCount: submittedGroups.length,
      awardedCount: awardedGroups.length,
      lostCount: lostGroups.length,
      notDecidedCount: openDecisionGroups.length,
      valueWeightedWinRate: safePercent(awardedValue, submittedValue),
      countWinRate: safePercent(awardedGroups.length, submittedGroups.length),
      decisionWinRate: safePercent(awardedGroups.length, awardedGroups.length + lostGroups.length),
      clientRows,
      agingBucketRows,
      postBidTrendRows,
      lossReasonBreakdown,
      monthlyCohortView,
      staleEoiRows: staleEoiRows.slice(0, 6),
      staleEoiBuckets: Object.entries(staleEoiBuckets).map(([bucket, count]) => ({ bucket, count })),
      roadmapAverage: average(roadmapDays),
      roadmapCoverage: roadmapDays.length,
      submittedValue,
      awardedValue,
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
            <Badge className="w-fit border border-sky-200 bg-white/80 text-sky-700">Conversion Intelligence</Badge>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Bid Flow Analytics Studio</h1>
              <p className="max-w-3xl text-sm leading-6 text-slate-600">
                Focused on EOI pool, conversion to tender, actual RFT submissions, win rates, stale EOIs, post-bid behavior, and where deals are dying.
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
          { label: 'EOI Pool', value: analytics.totalEoiPool, note: `${analytics.pureEoiCount} still pure EOI`, icon: Sparkles, tone: 'border-sky-100 from-sky-500/15' },
          { label: 'EOI to Tender', value: formatPercent(safePercent(analytics.convertedCount, analytics.totalEoiPool)), note: `${analytics.convertedCount} converted`, icon: GitBranch, tone: 'border-violet-100 from-violet-500/15' },
          { label: 'RFT Submitted', value: analytics.submittedCount, note: 'Actual submitted tenders only', icon: Activity, tone: 'border-cyan-100 from-cyan-500/15' },
          { label: 'Count Win %', value: formatPercent(analytics.countWinRate), note: `${analytics.awardedCount} wins from submitted`, icon: Crown, tone: 'border-emerald-100 from-emerald-500/15' },
          { label: 'Value Win %', value: formatPercent(analytics.valueWeightedWinRate), note: 'Awarded value / submitted value', icon: TrendingUp, tone: 'border-amber-100 from-amber-500/15' },
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

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <Card className="animate-in fade-in-0 slide-in-from-bottom-4 duration-500">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Radar className="h-5 w-5 text-sky-600" />
              Submission Outcome Split
            </CardTitle>
            <CardDescription>
              Submitted means actual RFT submitted. Awarded is win. Open decisions are submitted but neither won nor lost yet.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={[
                      { name: 'Won', value: analytics.awardedCount },
                      { name: 'Lost/Regretted', value: analytics.lostCount },
                      { name: 'Not decided', value: analytics.notDecidedCount },
                    ]}
                    dataKey="value"
                    innerRadius={64}
                    outerRadius={100}
                    paddingAngle={4}
                  >
                    {PIE_COLORS.map((color) => (
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
            <CardDescription>
              Open tender/RFT records that have not yet been submitted, bucketed by age since tender received.
            </CardDescription>
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
            <CardTitle className="flex items-center gap-2 text-xl">
              <TrendingUp className="h-5 w-5 text-violet-600" />
              Client-wise Conversion Rate
            </CardTitle>
            <CardDescription>
              Which clients are actually moving from EOI into tender/RFT most reliably.
            </CardDescription>
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
            <CardTitle className="flex items-center gap-2 text-xl">
              <Waves className="h-5 w-5 text-sky-600" />
              Monthly Conversion Cohorts
            </CardTitle>
            <CardDescription>
              EOI month on the left, conversion month on the right, with count of journeys in between.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.monthlyCohortView} layout="vertical" margin={{ left: 10, right: 10, top: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: '#475569' }} />
                  <YAxis type="category" dataKey="label" width={150} tick={{ fontSize: 11, fill: '#475569' }} />
                  <Tooltip formatter={(value: number, name: string) => [name === 'avgDays' ? `${value} days` : value, name === 'avgDays' ? 'Avg conversion days' : 'Conversions']} />
                  <Bar dataKey="count" fill="#2563EB" radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="animate-in fade-in-0 slide-in-from-bottom-4 duration-500">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Sparkles className="h-5 w-5 text-cyan-600" />
              Post-bid Detail Trend
            </CardTitle>
            <CardDescription>
              Uses `postBidDetailUpdatedAt` when available. If not, it falls back to the current post-bid mix.
            </CardDescription>
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
            <CardDescription>
              Derived from `remarksReason` and `comments`. This is category-based and should improve if we standardize the wording later.
            </CardDescription>
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

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="animate-in fade-in-0 slide-in-from-bottom-4 duration-500">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <TimerReset className="h-5 w-5 text-slate-700" />
              Stale EOI Tracker
            </CardTitle>
            <CardDescription>
              EOIs with no tender conversion yet. This helps spot opportunities that are just sitting.
            </CardDescription>
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
            <CardDescription>
              Placeholder for a later animated Sankey flow once we add a dedicated flow library.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 via-white to-sky-50 p-5">
              <div className="grid gap-4 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-center">
                {[
                  { label: 'EOI', value: analytics.totalEoiPool, tone: 'bg-sky-100 text-sky-800 border-sky-200' },
                  { label: 'Tender', value: analytics.tenderCount, tone: 'bg-violet-100 text-violet-800 border-violet-200' },
                  { label: 'Submitted', value: analytics.submittedCount, tone: 'bg-cyan-100 text-cyan-800 border-cyan-200' },
                ].map((item, index) => (
                  <Fragment key={item.label}>
                    <div className={`rounded-2xl border px-4 py-4 text-center ${item.tone}`}>
                      <div className="text-xs font-medium uppercase tracking-[0.18em]">{item.label}</div>
                      <div className="mt-2 text-3xl font-semibold">{item.value}</div>
                    </div>
                    {index < 2 && (
                      <div className="hidden md:flex justify-center">
                        <div className="h-2 w-16 rounded-full bg-gradient-to-r from-sky-400 via-violet-400 to-cyan-400 animate-pulse" />
                      </div>
                    )}
                  </Fragment>
                ))}
              </div>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-center text-emerald-900">
                  <div className="text-xs font-medium uppercase tracking-[0.18em]">Awarded</div>
                  <div className="mt-2 text-3xl font-semibold">{analytics.awardedCount}</div>
                </div>
                <div className="rounded-2xl border border-orange-200 bg-orange-50 px-4 py-4 text-center text-orange-900">
                  <div className="text-xs font-medium uppercase tracking-[0.18em]">Lost / Regretted</div>
                  <div className="mt-2 text-3xl font-semibold">{analytics.lostCount}</div>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              If you want, next round I can add a true Sankey library so the widths of the flows actually represent counts visually.
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
              <CardDescription>
                Hidden by default. Still kept honest: only shows EOI to tender conversion days until we have a clean award/loss date field.
              </CardDescription>
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
                  <div className="mt-2 text-xs text-slate-500">Average lag between the first EOI row and first tender row.</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Coverage</div>
                  <div className="mt-3 text-3xl font-semibold text-slate-950">{analytics.roadmapCoverage}</div>
                  <div className="mt-2 text-xs text-slate-500">Converted EOI records with enough dates to measure.</div>
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
