import { useState, useMemo } from 'react';
import { FunnelChart } from '@/components/Dashboard/FunnelChart';
import { OpportunitiesTable } from '@/components/Dashboard/OpportunitiesTable';
import { AtRiskWidget } from '@/components/Dashboard/AtRiskWidget';
import { ClientLeaderboard } from '@/components/Dashboard/ClientLeaderboard';
import { DataHealthWidget } from '@/components/Dashboard/DataHealthWidget';
import { ApprovalStatsWidget } from '@/components/Dashboard/ApprovalStatsWidget';
import { AdvancedFilters, FilterState, defaultFilters, applyFilters } from '@/components/Dashboard/AdvancedFilters';
import { ExportButton } from '@/components/Dashboard/ExportButton';
import { ReportButton } from '@/components/Dashboard/ReportButton';
import { OpportunityDetailDialog } from '@/components/Dashboard/OpportunityDetailDialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertCircle,
  Loader2,
  RefreshCw,
  Target,
  Send,
  ThumbsDown,
  PauseCircle,
  Trophy,
  XCircle,
  TimerReset,
} from 'lucide-react';
import {
  calculateFunnelData,
  getClientData,
  calculateDataHealth,
  Opportunity,
} from '@/data/opportunityData';
import { useData } from '@/contexts/DataContext';
import { useCurrency } from '@/contexts/CurrencyContext';
import { getDisplayStatus, normalizeCanonicalStatus } from '@/lib/opportunityStatus';
import { isSubmissionWithinDays } from '@/lib/submissionDate';
import aedSymbol from '@/assets/aed-symbol.png';

type DashboardKpiType = 'received' | 'submitted' | 'regretted' | 'hold' | 'won' | 'value' | 'lost' | 'submission';

type OpportunityGroup = {
  key: string;
  primary: Opportunity | null;
  items: Opportunity[];
};

const normalizeText = (value: string | null | undefined) => String(value || '').trim();
const normalizeRefNo = (value: string | null | undefined) => normalizeText(value).toUpperCase();
const getBaseRefNo = (value: string | null | undefined) => normalizeRefNo(value).replace(/_EOI$/i, '');
const isEoiRefNo = (value: string | null | undefined) => /_EOI$/i.test(normalizeRefNo(value));
const isHoldStatus = (status: string) => normalizeCanonicalStatus(status) === 'HOLD / CLOSED';
const isEoiRow = (opp: Opportunity | null) => {
  if (!opp) return false;
  const type = normalizeText(opp.opportunityClassification).toUpperCase();
  return type.includes('EOI') || isEoiRefNo(opp.opportunityRefNo);
};

const getJourneyType = (opp: Opportunity | null) => {
  if (!opp) return 'tender';
  const type = normalizeText(opp.opportunityClassification).toUpperCase();
  if (type === 'TENDER') return 'tender';
  if (type.includes('EOI') || isEoiRefNo(opp.opportunityRefNo)) return 'eoi';
  return 'tender';
};

const getBusinessKey = (opp: Opportunity, index: number) => {
  const ref = getBaseRefNo(opp.opportunityRefNo);
  const tenderName = normalizeText(opp.tenderName).toLowerCase();
  const clientName = normalizeText(opp.clientName).toLowerCase();
  if (ref) return `ref::${ref}`;
  if (clientName && tenderName) return `client::${clientName}::${tenderName}`;
  return `fallback::${opp.id || index}`;
};

const dedupeReceivedOpportunities = (rows: Opportunity[]) => {
  const chosenByRef = new Map<string, { opp: Opportunity; index: number }>();
  const noRefRows: Array<{ opp: Opportunity; index: number }> = [];

  rows.forEach((opp, index) => {
    const ref = normalizeRefNo(opp.opportunityRefNo);
    if (!ref) {
      noRefRows.push({ opp, index });
      return;
    }
    const existing = chosenByRef.get(ref);
    if (!existing) {
      chosenByRef.set(ref, { opp, index });
      return;
    }
    const existingStatus = normalizeCanonicalStatus(getDisplayStatus(existing.opp));
    const candidateStatus = normalizeCanonicalStatus(getDisplayStatus(opp));
    if (existingStatus !== 'AWARDED' && candidateStatus === 'AWARDED') {
      chosenByRef.set(ref, { opp, index });
    }
  });

  const byName = new Map<string, { opp: Opportunity; index: number }>();
  Array.from(chosenByRef.values())
    .concat(noRefRows)
    .forEach((entry) => {
      const nameKey = normalizeText(entry.opp.tenderName).toLowerCase();
      if (!nameKey) {
        byName.set(`__unnamed__${entry.index}`, entry);
        return;
      }
      const existing = byName.get(nameKey);
      if (!existing) {
        byName.set(nameKey, entry);
        return;
      }
      const existingStatus = normalizeCanonicalStatus(getDisplayStatus(existing.opp));
      const candidateStatus = normalizeCanonicalStatus(getDisplayStatus(entry.opp));
      if (existingStatus !== 'AWARDED' && candidateStatus === 'AWARDED') {
        byName.set(nameKey, entry);
      }
    });

  const deduped = Array.from(byName.values())
    .sort((a, b) => a.index - b.index)
    .map((entry) => entry.opp);

  const totalTenders = deduped.filter((opp) => getJourneyType(opp) === 'tender').length;
  const totalEoi = deduped.filter((opp) => getJourneyType(opp) === 'eoi').length;

  return { deduped, totalTenders, totalEoi };
};

const pickPrimaryOpportunity = (items: Opportunity[]) => {
  if (!items.length) return null;
  const rank = (opp: Opportunity) => {
    const status = normalizeCanonicalStatus(getDisplayStatus(opp));
    if (status === 'AWARDED') return 6;
    if (status === 'LOST' || status === 'REGRETTED') return 5;
    if (status === 'SUBMITTED') return 4;
    if (status === 'ONGOING') return 3;
    if (status === 'WORKING') return 2;
    if (status === 'TO START') return 1;
    return 0;
  };
  return [...items].sort((a, b) => rank(b) - rank(a))[0];
};

const formatCompactNumber = (value: number) => new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: value >= 1000 ? 1 : 0,
}).format(value || 0);

const Dashboard = () => {
  const { opportunities, isLoading, error, lastSyncTime, isLiveRefreshActive } = useData();
  const { formatCurrency, currency, convertValue } = useCurrency();
  const [selectedOpp, setSelectedOpp] = useState<Opportunity | null>(null);
  const [filters, setFilters] = useState<FilterState>(defaultFilters);

  const filteredData = useMemo(() => applyFilters(opportunities, filters), [opportunities, filters]);
  const funnelData = useMemo(() => calculateFunnelData(filteredData), [filteredData]);
  const clientData = useMemo(() => getClientData(filteredData), [filteredData]);
  const dataHealth = useMemo(() => calculateDataHealth(filteredData), [filteredData]);

  const groupedOpportunities = useMemo(() => {
    const groups = new Map<string, Opportunity[]>();
    filteredData.forEach((opp, index) => {
      const key = getBusinessKey(opp, index);
      const bucket = groups.get(key) || [];
      bucket.push(opp);
      groups.set(key, bucket);
    });

    return Array.from(groups.entries()).map(([key, items]) => ({
      key,
      primary: pickPrimaryOpportunity(items),
      items,
    })) as OpportunityGroup[];
  }, [filteredData]);

  const groupedBuckets = useMemo(() => {
    const openOtherGroups: OpportunityGroup[] = [];
    const submittedGroups: OpportunityGroup[] = [];
    const regrettedGroups: OpportunityGroup[] = [];
    const wonGroups: OpportunityGroup[] = [];
    const holdGroups: OpportunityGroup[] = [];
    const lostGroups: OpportunityGroup[] = [];
    const receivedGroups: OpportunityGroup[] = [...groupedOpportunities];
    const submissionNearGroups: OpportunityGroup[] = [];

    groupedOpportunities.forEach((group) => {
      const primary = group.primary;
      if (!primary) return;

      if (group.items.some((item) => isSubmissionWithinDays(item, 10))) {
        submissionNearGroups.push(group);
      }

      const status = normalizeCanonicalStatus(getDisplayStatus(primary));

      if (status === 'AWARDED') {
        wonGroups.push(group);
        return;
      }
      if (status === 'REGRETTED') {
        regrettedGroups.push(group);
        return;
      }
      if (isHoldStatus(status)) {
        holdGroups.push(group);
        return;
      }
      if (status === 'LOST') {
        lostGroups.push(group);
        return;
      }
      if (status === 'SUBMITTED') {
        submittedGroups.push(group);
        return;
      }

      openOtherGroups.push(group);
    });

    const groupRows = (groups: OpportunityGroup[]) => groups
      .map((group) => group.primary)
      .filter(Boolean) as Opportunity[];

    const countJourneyTypes = (groups: OpportunityGroup[]) => {
      const counts = { tender: 0, eoi: 0 };
      groups.forEach((group) => {
        const type = getJourneyType(group.primary);
        counts[type] += 1;
      });
      return counts;
    };

    const sumValue = (groups: OpportunityGroup[]) => groups.reduce((sum, group) => {
      const primary = group.primary;
      return sum + Number(primary?.opportunityValue || 0);
    }, 0);

    const activeSubmittedGroups = [...openOtherGroups, ...submittedGroups];
    const submittedOnlyValue = sumValue(submittedGroups);

    return {
      received: {
        groups: receivedGroups,
        rows: groupRows(receivedGroups),
        ...countJourneyTypes(receivedGroups),
      },
      submitted: {
        groups: activeSubmittedGroups,
        rows: groupRows(activeSubmittedGroups),
        ...countJourneyTypes(activeSubmittedGroups),
        submittedOnlyValue,
      },
      regretted: { groups: regrettedGroups, rows: groupRows(regrettedGroups) },
      hold: { groups: holdGroups, rows: groupRows(holdGroups) },
      won: { groups: wonGroups, rows: groupRows(wonGroups), value: sumValue(wonGroups) },
      lost: { groups: lostGroups, rows: groupRows(lostGroups) },
      submission: { groups: submissionNearGroups, rows: groupRows(submissionNearGroups) },
    };
  }, [groupedOpportunities]);

  const receivedDedupe = useMemo(() => dedupeReceivedOpportunities(filteredData), [filteredData]);

  const eoiLifecycle = useMemo(() => {
    const normalized = filteredData.map((opp, index) => ({
      opp,
      key: getBusinessKey(opp, index),
      baseRef: normalizeText(getBaseRefNo(opp.opportunityRefNo)).toLowerCase(),
      tenderName: normalizeText(opp.tenderName).toLowerCase(),
      isEoi: isEoiRow(opp),
    }));

    const rawEoiRows = normalized.filter((row) => row.isEoi).length;
    const convertedTenderRows = normalized.filter((row) => {
      if (row.isEoi) return false;
      return normalized.some((candidate) => (
        candidate.isEoi
        && candidate.key === row.key
        && candidate.baseRef === row.baseRef
        && candidate.tenderName === row.tenderName
      ));
    }).length;
    const suppressedRows = normalized.filter((row) => {
      if (!row.isEoi) return false;
      return normalized.some((candidate) => (
        !candidate.isEoi
        && candidate.key === row.key
        && candidate.baseRef === row.baseRef
        && candidate.tenderName === row.tenderName
      ));
    }).length;

    return {
      rawEoiRows,
      convertedTenderRows,
      suppressedRows,
    };
  }, [filteredData]);

  const handleKPIClick = (kpiType: DashboardKpiType) => {
    setFilters((prevFilters) => {
      switch (kpiType) {
        case 'received':
          return {
            ...prevFilters,
            statuses: [],
            excludeLostOutcomes: false,
          };
        case 'submitted':
          return {
            ...prevFilters,
            statuses: ['WORKING', 'TO START', 'ONGOING', 'SUBMITTED'],
            excludeLostOutcomes: false,
          };
        case 'won':
        case 'value':
          return {
            ...prevFilters,
            statuses: ['AWARDED'],
            excludeLostOutcomes: false,
          };
        case 'lost':
          return {
            ...prevFilters,
            statuses: ['LOST'],
            excludeLostOutcomes: false,
          };
        case 'regretted':
          return {
            ...prevFilters,
            statuses: ['REGRETTED'],
            excludeLostOutcomes: false,
          };
        case 'hold':
          return {
            ...prevFilters,
            statuses: ['HOLD / CLOSED'],
            excludeLostOutcomes: false,
          };
        case 'submission':
          return {
            ...prevFilters,
            showAtRisk: true,
            excludeLostOutcomes: false,
          };
        default:
          return prevFilters;
      }
    });
  };

  const handleFunnelClick = (stage: string) => {
    console.log('🔗 Funnel clicked:', stage);
    setFilters((prevFilters) => ({
      ...prevFilters,
      statuses: [stage],
    }));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center space-y-4">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground" />
          <p className="text-muted-foreground">Loading opportunities from MongoDB...</p>
        </div>
      </div>
    );
  }

  if (error || opportunities.length === 0) {
    return (
      <div className="space-y-4">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <strong>No Data Available</strong><br />
            {error || 'No opportunities found in MongoDB.'}
            <br /><br />
            <strong>Next Steps:</strong>
            <ol className="list-decimal list-inside mt-2 space-y-1">
              <li>Go to Master Panel (/master)</li>
              <li>Click "Sync from Graph Excel"</li>
              <li>Wait for data to load</li>
            </ol>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const kpiCards = [
    {
      label: 'Submitted',
      value: groupedBuckets.submitted.groups.length,
      secondaryDisplayValue: `${currency === 'AED' ? '' : '$'}${formatCompactNumber(convertValue(groupedBuckets.submitted.submittedOnlyValue || 0))}`,
      secondaryValuePrefix: currency === 'AED' ? 'aed' : 'text',
      emphasizeValue: true,
      tone: 'text-sky-600',
      glow: 'analytics-kpi-glow-sky',
      icon: Send,
      type: 'submitted' as const,
    },
    {
      label: 'Regretted',
      value: groupedBuckets.regretted.groups.length,
      tone: 'text-slate-700',
      glow: 'analytics-kpi-glow-amber',
      icon: ThumbsDown,
      type: 'regretted' as const,
    },
    {
      label: 'Hold / Closed',
      value: groupedBuckets.hold.groups.length,
      tone: 'text-amber-600',
      glow: 'analytics-kpi-glow-amber',
      icon: PauseCircle,
      type: 'hold' as const,
    },
    {
      label: 'Won',
      value: groupedBuckets.won.groups.length,
      tone: 'text-emerald-600',
      glow: 'analytics-kpi-glow-emerald',
      icon: Trophy,
      type: 'won' as const,
    },
    {
      label: 'Value',
      value: groupedBuckets.won.value,
      displayValue: `${currency === 'AED' ? '' : '$'}${formatCompactNumber(convertValue(groupedBuckets.won.value))}`,
      valuePrefix: currency === 'AED' ? 'aed' : 'text',
      tone: 'text-violet-600',
      glow: 'analytics-kpi-glow-emerald',
      icon: Target,
      chip: 'Awarded only',
      type: 'value' as const,
    },
    {
      label: 'Lost',
      value: groupedBuckets.lost.groups.length,
      tone: 'text-rose-600',
      glow: 'analytics-kpi-glow-rose',
      icon: XCircle,
      type: 'lost' as const,
    },
    {
      label: 'Submission Near',
      value: groupedBuckets.submission.groups.length,
      tone: 'text-orange-600',
      glow: 'analytics-kpi-glow-amber',
      icon: TimerReset,
      type: 'submission' as const,
    },
  ];

  const receivedCards = [
    {
      label: 'Total Tender',
      value: receivedDedupe.totalTenders,
      tone: 'text-sky-600',
      glow: 'analytics-kpi-glow-sky',
      icon: Target,
    },
    {
      label: 'Total EOI',
      value: receivedDedupe.totalEoi,
      tone: 'text-amber-600',
      glow: 'analytics-kpi-glow-amber',
      icon: Target,
    },
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Sync Status Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 text-xs text-muted-foreground">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 min-w-0">
          <div>
            Last refreshed from MongoDB: {lastSyncTime?.toLocaleTimeString()} - {opportunities.length} opportunities loaded
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <RefreshCw className="h-3 w-3" />
            Server auto-sync runs independently of the browser session
          </div>
        </div>
        <div className="text-xs">
          {isLiveRefreshActive ? '✅ Live refresh active' : '⏸️ Live refresh inactive'}
        </div>
      </div>

      {/* Filter & Export Bar */}
      <div className="sticky top-14 z-40 -mx-3 sm:-mx-4 lg:-mx-6 px-3 sm:px-4 lg:px-6 py-3 sm:py-4 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 sm:gap-4 lg:gap-6 min-w-0">
          <div className="flex-1 min-w-0">
            <AdvancedFilters
              data={opportunities}
              filters={filters}
              onFiltersChange={setFilters}
              onClearFilters={() => setFilters(defaultFilters)}
            />
          </div>
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 shrink-0 w-full lg:w-auto">
            <ExportButton data={filteredData} filename="tenders" />
            <ReportButton data={filteredData} filters={filters} />
          </div>
        </div>
      </div>

      {/*
        Legacy dashboard KPI cards intentionally disabled.
        Kept commented for traceability: this was <KPICards stats={stats} onKPIClick={handleKPIClick} />.
        Reason: dashboard now uses Analytics-style KPI card design and grouping semantics for consistency.
        Data mapping/import logic is unchanged; this is presentation-layer aggregation only.
      */}
      {/* <KPICards stats={stats} onKPIClick={handleKPIClick} /> */}

      <section className="space-y-4">
        <div className="rounded-2xl border-2 border-sky-300/80 bg-sky-50/30 p-3 shadow-[0_0_24px_rgba(56,189,248,0.18)]">
          <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-[0.12em] text-sky-700">Recieved</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {receivedCards.map((card, index) => (
              <button
                key={card.label}
                type="button"
                className={`analytics-card analytics-kpi-card ${card.glow} w-full text-left transition-transform hover:-translate-y-0.5`}
                style={{ animationDelay: `${index * 0.07}s` }}
                onClick={() => handleKPIClick('received')}
              >
                <div className="relative z-10 flex items-start justify-between p-5">
                  <div className="space-y-1.5">
                    <p className="dash-label">{card.label}</p>
                    <div className="mt-2 analytics-kpi-number flex items-center gap-2 text-slate-950">
                      <span>{card.value}</span>
                    </div>
                  </div>
                  <div className={`rounded-2xl border border-white/70 bg-white/80 p-2.5 shadow-sm ${card.tone}`}>
                    <card.icon className="h-5 w-5" />
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpiCards.map((card, index) => (
          <button
            key={card.label}
            type="button"
            className="analytics-card analytics-kpi-card w-full text-left transition-transform hover:-translate-y-0.5"
            style={{ animationDelay: `${index * 0.07}s` }}
            onClick={() => handleKPIClick(card.type)}
          >
            <div className="relative z-10 flex items-start justify-between p-5">
              <div className="space-y-1.5">
                <p className={card.emphasizeValue ? 'dash-label text-slate-600' : 'dash-label'}>{card.label}</p>
                <div className={`mt-2 analytics-kpi-number flex items-center gap-2 ${card.emphasizeValue ? 'text-slate-950 text-5xl font-black tracking-tight leading-none' : 'text-slate-950'}`}>
                  {card.valuePrefix === 'aed' ? <img src={aedSymbol} alt="AED" className="h-7 w-7" /> : null}
                  <span>{card.displayValue || card.value}</span>
                </div>
                {card.secondaryDisplayValue ? (
                  <div className="mt-1 flex items-center gap-1.5 text-xs font-medium text-slate-500">
                    {card.secondaryValuePrefix === 'aed' ? <img src={aedSymbol} alt="AED" className="h-3.5 w-3.5 opacity-70" /> : null}
                    <span>{card.secondaryDisplayValue}</span>
                  </div>
                ) : null}
                {card.meta ? (
                  <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-500">
                    {card.meta.map((item) => (
                      <span key={item.label} className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2 py-0.5">
                        <span className={`h-2 w-2 rounded-full ${item.tone}`} />
                        {item.label} {item.value}
                      </span>
                    ))}
                  </div>
                ) : null}
                {card.chip ? <p className="pt-1 text-[11px] text-slate-500">{card.chip}</p> : null}
              </div>
              <div className={`rounded-2xl border border-white/70 bg-white/80 p-2.5 shadow-sm ${card.tone}`}>
                <card.icon className="h-5 w-5" />
              </div>
            </div>
          </button>
        ))}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="analytics-card p-5">
          <p className="dash-label">EOI Lifecycle</p>
          <p className="mt-2 text-3xl font-black text-slate-900">{eoiLifecycle.rawEoiRows}</p>
          <p className="mt-1 text-xs text-slate-500">Raw EOI rows in current filtered scope</p>
        </div>
        <div className="analytics-card p-5">
          <p className="dash-label">Converted Tender Rows</p>
          <p className="mt-2 text-3xl font-black text-sky-700">{eoiLifecycle.convertedTenderRows}</p>
          <p className="mt-1 text-xs text-slate-500">Tender rows matched to an EOI lifecycle</p>
        </div>
        <div className="analytics-card p-5">
          <p className="dash-label">Duplicate-Suppressed EOIs</p>
          <p className="mt-2 text-3xl font-black text-amber-700">{eoiLifecycle.suppressedRows}</p>
          <p className="mt-1 text-xs text-slate-500">EOI rows eligible to hide when converted tender exists</p>
        </div>
      </section>

      {/* Opportunities Table */}
      <OpportunitiesTable data={filteredData} onSelectOpportunity={setSelectedOpp} responsiveMode="dashboard" />

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">
        <FunnelChart data={funnelData} onStageClick={handleFunnelClick} />
        <AtRiskWidget data={filteredData} onSelectOpportunity={setSelectedOpp} />
        <ClientLeaderboard data={clientData} onClientClick={(client) => {
          setFilters((prevFilters) => ({
            ...prevFilters,
            clients: [client],
          }));
        }} />
      </div>

      {/* Data Health & Stats Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">
        <ApprovalStatsWidget data={filteredData} />
        <DataHealthWidget {...dataHealth} />
      </div>

      {/* Opportunity Detail Popup Dialog */}
      <OpportunityDetailDialog
        open={!!selectedOpp}
        opportunity={selectedOpp}
        onOpenChange={(open) => {
          if (!open) setSelectedOpp(null);
        }}
        formatCurrency={formatCurrency}
      />
    </div>
  );
};

export default Dashboard;
