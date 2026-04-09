import { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
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
  ChevronDown,
  ChevronUp,
  Crown,
  GitBranch,
  Rocket,
  Sparkles,
  Target,
  TimerReset,
  TrendingUp,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useData } from '@/contexts/DataContext';
import type { Opportunity } from '@/data/opportunityData';
import { getDisplayStatus } from '@/lib/opportunityStatus';

const DECISION_COLORS = ['#2563EB', '#10B981', '#F97316', '#94A3B8'];

const normalizeComparisonText = (value: string | null | undefined) => String(value || '').trim().toLowerCase();
const normalizeRefNo = (value: string | null | undefined) => String(value || '').trim().toUpperCase();
const getBaseRefNo = (value: string | null | undefined) => normalizeRefNo(value).replace(/_EOI$/i, '');
const isEoiRefNo = (value: string | null | undefined) => /_EOI$/i.test(normalizeRefNo(value));

const getBusinessKey = (opp: Opportunity, index: number) => {
  const baseRefNo = getBaseRefNo(opp.opportunityRefNo);
  const tenderName = normalizeComparisonText(opp.tenderName);
  if (baseRefNo && tenderName) return `${baseRefNo}::${tenderName}`;
  if (baseRefNo) return baseRefNo;
  if (tenderName) return tenderName;
  return `untitled-${index}`;
};

const getPrimaryTimestamp = (opp: Opportunity) => {
  const candidates = [
    opp.dateTenderReceived,
    opp.tenderSubmittedDate,
    opp.tenderPlannedSubmissionDate,
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const timestamp = Date.parse(candidate);
    if (!Number.isNaN(timestamp)) return timestamp;
  }

  return 0;
};

const isTenderRecord = (opp: Opportunity) => {
  const type = String(opp.opportunityClassification || '').trim().toUpperCase();
  return type === 'TENDER' || (!isEoiRefNo(opp.opportunityRefNo) && !type.includes('EOI'));
};

const isEoiRecord = (opp: Opportunity) => {
  const type = String(opp.opportunityClassification || '').trim().toUpperCase();
  return type.includes('EOI') || isEoiRefNo(opp.opportunityRefNo);
};

const getStatusRank = (opp: Opportunity) => {
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

    const statusDiff = getStatusRank(b) - getStatusRank(a);
    if (statusDiff !== 0) return statusDiff;

    return getPrimaryTimestamp(b) - getPrimaryTimestamp(a);
  })[0];
};

const formatPercent = (value: number) => `${value.toFixed(1)}%`;
const safePercent = (numerator: number, denominator: number) => (denominator > 0 ? (numerator / denominator) * 100 : 0);

type OpportunityGroup = {
  key: string;
  primary: Opportunity | null;
  eoiRows: Opportunity[];
  tenderRows: Opportunity[];
};

const buildOpportunityGroups = (opportunities: Opportunity[]) => {
  const grouped = new Map<string, OpportunityGroup>();

  opportunities.forEach((opp, index) => {
    const key = getBusinessKey(opp, index);
    const current = grouped.get(key) || {
      key,
      primary: null,
      eoiRows: [],
      tenderRows: [],
    };

    if (isEoiRecord(opp)) current.eoiRows.push(opp);
    if (isTenderRecord(opp)) current.tenderRows.push(opp);
    const nextPrimary = pickPrimaryOpportunity([...current.eoiRows, ...current.tenderRows]);
    current.primary = nextPrimary;
    grouped.set(key, current);
  });

  return Array.from(grouped.values());
};

const buildDaysToTender = (groups: OpportunityGroup[]) => (
  groups.flatMap((group) => {
    const eoiTimestamp = Math.min(...group.eoiRows.map(getPrimaryTimestamp).filter(Boolean));
    const tenderTimestamp = Math.min(...group.tenderRows.map(getPrimaryTimestamp).filter(Boolean));
    if (!eoiTimestamp || !tenderTimestamp || tenderTimestamp < eoiTimestamp) return [];
    return [Math.round((tenderTimestamp - eoiTimestamp) / (1000 * 60 * 60 * 24))];
  })
);

const average = (numbers: number[]) => (
  numbers.length ? numbers.reduce((sum, value) => sum + value, 0) / numbers.length : 0
);

const median = (numbers: number[]) => {
  if (!numbers.length) return 0;
  const sorted = [...numbers].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return (sorted[middle - 1] + sorted[middle]) / 2;
  return sorted[middle];
};

const Analytics = () => {
  const { opportunities, isLoading, error } = useData();
  const [selectedGroup, setSelectedGroup] = useState('ALL');
  const [showRoadmap, setShowRoadmap] = useState(false);

  const groupOptions = useMemo(() => {
    const groups = Array.from(
      new Set(
        opportunities
          .map((opp) => String(opp.groupClassification || '').trim())
          .filter(Boolean),
      ),
    ).sort((a, b) => a.localeCompare(b));
    return ['ALL', ...groups];
  }, [opportunities]);

  const filteredOpportunities = useMemo(() => (
    selectedGroup === 'ALL'
      ? opportunities
      : opportunities.filter((opp) => String(opp.groupClassification || '').trim() === selectedGroup)
  ), [opportunities, selectedGroup]);

  const groupedOpportunities = useMemo(
    () => buildOpportunityGroups(filteredOpportunities),
    [filteredOpportunities],
  );

  const analytics = useMemo(() => {
    const totalEoiPool = groupedOpportunities.filter((group) => group.eoiRows.length > 0).length;
    const eoiOnlyCount = groupedOpportunities.filter((group) => group.eoiRows.length > 0 && group.tenderRows.length === 0).length;
    const convertedCount = groupedOpportunities.filter((group) => group.eoiRows.length > 0 && group.tenderRows.length > 0).length;
    const tenderCount = groupedOpportunities.filter((group) => group.tenderRows.length > 0).length;

    const tenderGroups = groupedOpportunities.filter((group) => group.tenderRows.length > 0);
    const awardedCount = tenderGroups.filter((group) => getDisplayStatus(group.primary || {}) === 'AWARDED').length;
    const lostCount = tenderGroups.filter((group) => {
      const status = getDisplayStatus(group.primary || {});
      return status === 'LOST' || status === 'REGRETTED';
    }).length;
    const submittedCount = tenderGroups.filter((group) => {
      const status = getDisplayStatus(group.primary || {});
      return ['SUBMITTED', 'AWARDED', 'LOST', 'REGRETTED'].includes(status);
    }).length;
    const notDecidedCount = Math.max(submittedCount - awardedCount - lostCount, 0);
    const activeTenderCount = Math.max(tenderCount - submittedCount, 0);

    const decisionPieData = [
      { name: 'Tender / RFT', value: tenderCount },
      { name: 'Submitted', value: submittedCount },
      { name: 'Won', value: awardedCount },
      { name: 'Lost', value: lostCount },
      { name: 'Not decided', value: notDecidedCount },
    ];

    const conversionPipeline = [
      { stage: 'EOI pool', count: totalEoiPool },
      { stage: 'Converted', count: convertedCount },
      { stage: 'Tender / RFT', count: tenderCount },
      { stage: 'Submitted', count: submittedCount },
      { stage: 'Awarded', count: awardedCount },
    ];

    const perGroupStats = groupOptions
      .filter((group) => group !== 'ALL')
      .map((group) => {
        const items = buildOpportunityGroups(
          opportunities.filter((opp) => String(opp.groupClassification || '').trim() === group),
        );
        const eoiPool = items.filter((entry) => entry.eoiRows.length > 0).length;
        const converted = items.filter((entry) => entry.eoiRows.length > 0 && entry.tenderRows.length > 0).length;
        const tenders = items.filter((entry) => entry.tenderRows.length > 0).length;
        const submitted = items.filter((entry) => {
          if (!entry.tenderRows.length) return false;
          const status = getDisplayStatus(entry.primary || {});
          return ['SUBMITTED', 'AWARDED', 'LOST', 'REGRETTED'].includes(status);
        }).length;
        const awarded = items.filter((entry) => getDisplayStatus(entry.primary || {}) === 'AWARDED').length;
        const lost = items.filter((entry) => {
          const status = getDisplayStatus(entry.primary || {});
          return status === 'LOST' || status === 'REGRETTED';
        }).length;

        return {
          group,
          eoiPool,
          converted,
          tenders,
          winRate: Number(safePercent(awarded, submitted).toFixed(1)),
          conversionRate: Number(safePercent(converted, eoiPool).toFixed(1)),
          losses: lost,
        };
      });

    const clientBreakdown = tenderGroups.reduce<Record<string, { tenders: number; awarded: number; lost: number }>>((acc, group) => {
      const client = String(group.primary?.clientName || 'Unknown').trim() || 'Unknown';
      if (!acc[client]) acc[client] = { tenders: 0, awarded: 0, lost: 0 };
      acc[client].tenders += 1;
      const status = getDisplayStatus(group.primary || {});
      if (status === 'AWARDED') acc[client].awarded += 1;
      if (status === 'LOST' || status === 'REGRETTED') acc[client].lost += 1;
      return acc;
    }, {});

    const topClients = Object.entries(clientBreakdown)
      .map(([client, values]) => ({ client, ...values }))
      .sort((a, b) => b.tenders - a.tenders)
      .slice(0, 8);

    const daysToTender = buildDaysToTender(groupedOpportunities);

    return {
      totalEoiPool,
      eoiOnlyCount,
      convertedCount,
      tenderCount,
      submittedCount,
      awardedCount,
      lostCount,
      notDecidedCount,
      activeTenderCount,
      conversionRate: safePercent(convertedCount, totalEoiPool),
      winRate: safePercent(awardedCount, submittedCount),
      decisionWinRate: safePercent(awardedCount, awardedCount + lostCount),
      decisionPieData,
      conversionPipeline,
      perGroupStats,
      topClients,
      avgDaysToTender: average(daysToTender),
      medianDaysToTender: median(daysToTender),
      roadmapCoverage: daysToTender.length,
    };
  }, [groupOptions, groupedOpportunities, opportunities]);

  const scopeLabel = selectedGroup === 'ALL' ? 'All Verticals' : selectedGroup;

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[28px] border border-sky-100 bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.18),_transparent_32%),linear-gradient(135deg,#f8fbff_0%,#eef6ff_46%,#f8fafc_100%)] p-6 shadow-sm animate-in fade-in-0 slide-in-from-bottom-3 duration-500">
        <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-sky-200/30 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-32 w-32 rounded-full bg-emerald-200/30 blur-3xl" />

        <div className="relative flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-3">
            <Badge className="w-fit border border-sky-200 bg-white/80 text-sky-700">Analytics Reimagined</Badge>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Bid Conversion Command Center</h1>
              <p className="max-w-3xl text-sm leading-6 text-slate-600">
                Fresh analytics focused on EOI volume, tender conversion, submission outcomes, and win ratio.
                The hidden roadmap module is kept experimental until we have a clean award/loss date field.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-2xl border border-white/70 bg-white/80 p-4 shadow-sm sm:flex-row sm:items-center">
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
          <CardContent className="pt-6 text-sm text-rose-700">
            {error}
          </CardContent>
        </Card>
      )}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          {
            title: 'EOI Pool',
            value: analytics.totalEoiPool,
            note: `${analytics.eoiOnlyCount} still pure EOI`,
            icon: Sparkles,
            tone: 'from-sky-500/15 via-white to-white',
            ring: 'border-sky-100',
          },
          {
            title: 'EOI to RFT',
            value: formatPercent(analytics.conversionRate),
            note: `${analytics.convertedCount} converted tenders`,
            icon: GitBranch,
            tone: 'from-violet-500/15 via-white to-white',
            ring: 'border-violet-100',
          },
          {
            title: 'Win %',
            value: formatPercent(analytics.winRate),
            note: `${analytics.awardedCount} won out of ${analytics.submittedCount} submitted`,
            icon: Crown,
            tone: 'from-emerald-500/15 via-white to-white',
            ring: 'border-emerald-100',
          },
          {
            title: 'Open Decisions',
            value: analytics.notDecidedCount,
            note: `${analytics.activeTenderCount} more tenders not yet submitted`,
            icon: Activity,
            tone: 'from-amber-500/15 via-white to-white',
            ring: 'border-amber-100',
          },
        ].map((item, index) => (
          <Card
            key={item.title}
            className={`overflow-hidden border ${item.ring} bg-gradient-to-br ${item.tone} animate-in fade-in-0 slide-in-from-bottom-4 duration-500`}
            style={{ animationDelay: `${index * 80}ms` }}
          >
            <CardContent className="pt-6">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-slate-600">{item.title}</p>
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
        <Card className="overflow-hidden border-slate-200 animate-in fade-in-0 slide-in-from-bottom-4 duration-500">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Rocket className="h-5 w-5 text-sky-600" />
              Conversion Storyline
            </CardTitle>
            <CardDescription>
              From EOI pool to awarded outcome, built around your existing EOI-versus-tender logic.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={analytics.conversionPipeline} margin={{ left: 0, right: 10, top: 10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="conversionFill" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#2563EB" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="#2563EB" stopOpacity={0.04} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="stage" tick={{ fontSize: 12, fill: '#475569' }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#475569' }} />
                  <Tooltip
                    formatter={(value: number) => [value, 'Count']}
                    contentStyle={{ borderRadius: 16, borderColor: '#DBEAFE' }}
                  />
                  <Area type="monotone" dataKey="count" stroke="#2563EB" strokeWidth={3} fill="url(#conversionFill)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-slate-200 animate-in fade-in-0 slide-in-from-bottom-4 duration-500">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Target className="h-5 w-5 text-emerald-600" />
              Tender Outcome Split
            </CardTitle>
            <CardDescription>
              Submitted versus won, lost, and still waiting for a result.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={[
                      { name: 'Won', value: analytics.awardedCount },
                      { name: 'Lost', value: analytics.lostCount },
                      { name: 'Not decided', value: analytics.notDecidedCount },
                    ]}
                    dataKey="value"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={4}
                  >
                    {DECISION_COLORS.slice(1).map((color, index) => (
                      <Cell key={color} fill={color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => [value, 'Count']} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="grid gap-3">
              {[
                { label: 'Won', value: analytics.awardedCount, color: 'bg-emerald-500' },
                { label: 'Lost', value: analytics.lostCount, color: 'bg-orange-500' },
                { label: 'Not decided', value: analytics.notDecidedCount, color: 'bg-slate-400' },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className={`h-2.5 w-2.5 rounded-full ${item.color}`} />
                    <span className="text-sm font-medium text-slate-700">{item.label}</span>
                  </div>
                  <span className="text-lg font-semibold text-slate-950">{item.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="animate-in fade-in-0 slide-in-from-bottom-4 duration-500">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <TrendingUp className="h-5 w-5 text-violet-600" />
              Vertical Comparison
            </CardTitle>
            <CardDescription>
              EOI pool, converted count, and win rate across verticals. This stays useful even while you are scoped to one vertical.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.perGroupStats} margin={{ left: 0, right: 10, top: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="group" tick={{ fontSize: 11, fill: '#475569' }} />
                  <YAxis yAxisId="left" allowDecimals={false} tick={{ fontSize: 12, fill: '#475569' }} />
                  <YAxis yAxisId="right" orientation="right" tickFormatter={(value) => `${value}%`} tick={{ fontSize: 12, fill: '#475569' }} />
                  <Tooltip
                    formatter={(value: number, name: string) => [name.includes('Rate') ? `${value}%` : value, name]}
                    contentStyle={{ borderRadius: 16, borderColor: '#E9D5FF' }}
                  />
                  <Bar yAxisId="left" dataKey="eoiPool" fill="#93C5FD" radius={[6, 6, 0, 0]} name="EOI pool" />
                  <Bar yAxisId="left" dataKey="converted" fill="#8B5CF6" radius={[6, 6, 0, 0]} name="Converted" />
                  <Bar yAxisId="right" dataKey="winRate" fill="#10B981" radius={[6, 6, 0, 0]} name="Win Rate" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="animate-in fade-in-0 slide-in-from-bottom-4 duration-500">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Sparkles className="h-5 w-5 text-amber-500" />
              Client Heat
            </CardTitle>
            <CardDescription>
              Top clients inside the current scope, based on tender volume and outcome balance.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.topClients} layout="vertical" margin={{ left: 10, right: 10, top: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: '#475569' }} />
                  <YAxis type="category" dataKey="client" width={120} tick={{ fontSize: 11, fill: '#475569' }} />
                  <Tooltip formatter={(value: number) => [value, 'Count']} contentStyle={{ borderRadius: 16, borderColor: '#FDE68A' }} />
                  <Bar dataKey="tenders" fill="#0F172A" radius={[0, 8, 8, 0]} name="Tenders" />
                  <Bar dataKey="awarded" fill="#10B981" radius={[0, 8, 8, 0]} name="Awarded" />
                  <Bar dataKey="lost" fill="#F97316" radius={[0, 8, 8, 0]} name="Lost" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Tender / RFT Count', value: analytics.tenderCount, helper: 'All non-EOI tenders in scope' },
          { label: 'Submitted', value: analytics.submittedCount, helper: 'Submitted, won, or lost records' },
          { label: 'Decision Win %', value: formatPercent(analytics.decisionWinRate), helper: 'Won divided by won + lost' },
          { label: 'Pure EOI Backlog', value: analytics.eoiOnlyCount, helper: 'Still waiting to become tender/RFT' },
        ].map((item, index) => (
          <Card
            key={item.label}
            className="border-slate-200 bg-white animate-in fade-in-0 slide-in-from-bottom-4 duration-500"
            style={{ animationDelay: `${index * 60}ms` }}
          >
            <CardContent className="pt-6">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">{item.label}</p>
              <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{item.value}</p>
              <p className="mt-2 text-xs leading-5 text-slate-500">{item.helper}</p>
            </CardContent>
          </Card>
        ))}
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
                Hidden by default. Shows only the stage-to-stage day counts we can support reliably today.
              </CardDescription>
            </div>
            <Button type="button" variant="outline" className="gap-2" onClick={() => setShowRoadmap((current) => !current)}>
              {showRoadmap ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              {showRoadmap ? 'Hide timeline' : 'Show timeline'}
            </Button>
          </CardHeader>

          {showRoadmap && (
            <CardContent className="space-y-5">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl border border-sky-200 bg-white p-4">
                  <div className="text-xs font-medium uppercase tracking-[0.18em] text-sky-500">EOI to RFT</div>
                  <div className="mt-3 text-3xl font-semibold text-slate-950">{analytics.avgDaysToTender.toFixed(1)} days</div>
                  <div className="mt-2 text-xs text-slate-500">Average time from first EOI row to first tender row.</div>
                </div>
                <div className="rounded-2xl border border-violet-200 bg-white p-4">
                  <div className="text-xs font-medium uppercase tracking-[0.18em] text-violet-500">Median</div>
                  <div className="mt-3 text-3xl font-semibold text-slate-950">{analytics.medianDaysToTender.toFixed(1)} days</div>
                  <div className="mt-2 text-xs text-slate-500">Less sensitive to outliers than the average.</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Coverage</div>
                  <div className="mt-3 text-3xl font-semibold text-slate-950">{analytics.roadmapCoverage}</div>
                  <div className="mt-2 text-xs text-slate-500">Converted EOI records with enough dates to measure.</div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">Roadmap availability</div>
                    <div className="text-xs text-slate-500">
                      Award/loss transit days are intentionally held back until we have an explicit outcome date field.
                    </div>
                  </div>
                  <Badge variant="outline">Honest mode</Badge>
                </div>

                <div className="space-y-4">
                  <div>
                    <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
                      <span>EOI</span>
                      <span>RFT</span>
                    </div>
                    <div className="h-4 rounded-full bg-slate-100">
                      <div
                        className="h-4 rounded-full bg-gradient-to-r from-sky-500 via-violet-500 to-emerald-500 transition-all duration-700"
                        style={{ width: `${Math.min(100, Math.max(18, analytics.avgDaysToTender * 2.5))}%` }}
                      />
                    </div>
                  </div>
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    When we add a clean decision timestamp for award/loss, this panel can become a full EOI → RFT → Awarded/Lost journey map.
                  </div>
                </div>
              </div>
            </CardContent>
          )}
        </Card>
      </section>

      {isLoading && opportunities.length === 0 && (
        <Card>
          <CardContent className="pt-6 text-sm text-slate-500">
            Loading analytics...
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default Analytics;
