import { useState, useMemo, useRef } from 'react';
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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  AlertCircle,
  Loader2,
  RefreshCw,
  Info,
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

type DashboardKpiType = 'received' | 'submitted' | 'regretted' | 'hold' | 'won' | 'value' | 'lost' | 'submission' | 'winRatio';

type ProjectStatus = 'AWARDED' | 'LOST' | 'SUBMITTED' | 'REGRETTED' | 'HOLD / CLOSED' | 'OTHER';

type DuplicateOmissionReason = 'duplicate_project_grouping';

type DuplicateOmission = {
  omitted: Opportunity;
  kept: Opportunity;
  reason: DuplicateOmissionReason;
};

type ProjectGroup = {
  key: string;
  items: Opportunity[];
  primary: Opportunity | null;
  status: ProjectStatus;
  hasTender: boolean;
  hasEoi: boolean;
  hasSubmissionNear: boolean;
  hasSubmittedSignal: boolean;
  awardedValue: number;
};

type KpiDiagnosticEntry = {
  id: string;
  refNo: string;
  tenderName: string;
  clientName: string;
  journeyType: 'tender' | 'eoi';
  status: string;
  reasonCode: string;
  reason: string;
  reasonMeta?: Record<string, unknown>;
  replacement?: {
    id: string;
    refNo: string;
    tenderName: string;
    status: string;
  };
};

type DuplicateTraceEntry = {
  id: string;
  refNo: string;
  tenderName: string;
  clientName: string;
  status: string;
  reason: string;
};

type DuplicateTraceByKeptId = Record<string, {
  kept: DuplicateTraceEntry;
  omitted: DuplicateTraceEntry[];
}>;

type KpiDiagnosticsReport = {
  reportId: string;
  generatedAt: string;
  kpiType: DashboardKpiType;
  appliedFilters: {
    statuses: string[];
    showAtRisk: boolean;
    excludeLostOutcomes: boolean;
  };
  counts: {
    sourceRows: number;
    preKpiScopedRows: number;
    includedRows: number;
    omittedRows: number;
  };
  included: KpiDiagnosticEntry[];
  omitted: KpiDiagnosticEntry[];
};

type AwardedValueAuditRow = {
  projectKey: string;
  counted: {
    id: string;
    refNo: string;
    clientName: string;
    value: number;
  } | null;
  notCounted: Array<{
    id: string;
    refNo: string;
    clientName: string;
    value: number;
  }>;
};

const normalizeText = (value: string | null | undefined) => String(value || '').trim();
const normalizeRefNo = (value: string | null | undefined) => normalizeText(value).toUpperCase();
const normalizeTenderName = (value: string | null | undefined) => normalizeText(value).replace(/\s+/g, ' ').toLowerCase();
const getBaseRefNo = (value: string | null | undefined) => {
  const normalized = normalizeRefNo(value);
  if (!normalized) return '';
  const [base = ''] = normalized.split(/[_\s]+/, 1);
  return base;
};
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

const resolveProjectStatus = (rows: Opportunity[]) => {
  const statuses = rows.map((opp) => normalizeCanonicalStatus(getDisplayStatus(opp)));
  if (statuses.includes('AWARDED')) return 'AWARDED' as const;
  if (statuses.includes('LOST')) return 'LOST' as const;
  if (statuses.includes('SUBMITTED')) return 'SUBMITTED' as const;
  if (statuses.includes('REGRETTED')) return 'REGRETTED' as const;
  if (statuses.some((status) => isHoldStatus(status))) return 'HOLD / CLOSED' as const;
  return 'OTHER' as const;
};

const pickPrimaryOpportunity = (items: Opportunity[], projectStatus: ProjectStatus) => {
  if (!items.length) return null;
  const byProjectStatus = items.find((opp) => normalizeCanonicalStatus(getDisplayStatus(opp)) === projectStatus);
  if (byProjectStatus) return byProjectStatus;
  const rank = (opp: Opportunity) => {
    const status = normalizeCanonicalStatus(getDisplayStatus(opp));
    if (status === 'AWARDED') return 6;
    if (status === 'LOST') return 5;
    if (status === 'SUBMITTED') return 4;
    if (status === 'REGRETTED') return 3;
    if (isHoldStatus(status)) return 2;
    return 1;
  };
  return [...items].sort((a, b) => rank(b) - rank(a))[0];
};

const buildProjectGroups = (rows: Opportunity[]) => {
  const enriched = rows.map((opp, index) => ({
    opp,
    index,
    baseRef: getBaseRefNo(opp.opportunityRefNo),
    cleanTenderName: normalizeTenderName(opp.tenderName),
  }));
  const baseRefsByName = new Map<string, Set<string>>();
  enriched.forEach((entry) => {
    if (!entry.cleanTenderName || !entry.baseRef) return;
    if (!baseRefsByName.has(entry.cleanTenderName)) {
      baseRefsByName.set(entry.cleanTenderName, new Set<string>());
    }
    baseRefsByName.get(entry.cleanTenderName)?.add(entry.baseRef);
  });

  const groups = new Map<string, Array<{ opp: Opportunity; index: number }>>();
  enriched.forEach((entry) => {
    const refCountForName = entry.cleanTenderName ? (baseRefsByName.get(entry.cleanTenderName)?.size || 0) : 0;
    const key = entry.baseRef
      ? (entry.cleanTenderName && refCountForName > 1
        ? `name::${entry.cleanTenderName}`
        : `ref::${entry.baseRef}`)
      : (entry.cleanTenderName
        ? `name::${entry.cleanTenderName}`
        : `fallback::${entry.opp.id || entry.index}`);
    const bucket = groups.get(key) || [];
    bucket.push({ opp: entry.opp, index: entry.index });
    groups.set(key, bucket);
  });

  const duplicateOmissions: DuplicateOmission[] = [];
  const projectGroups = Array.from(groups.entries()).map(([key, entries]) => {
    const sorted = [...entries].sort((a, b) => a.index - b.index);
    const items = sorted.map((entry) => entry.opp);
    const status = resolveProjectStatus(items);
    const primary = pickPrimaryOpportunity(items, status);

    if (primary) {
      items.forEach((opp) => {
        if (opp === primary) return;
        duplicateOmissions.push({
          omitted: opp,
          kept: primary,
          reason: 'duplicate_project_grouping',
        });
      });
    }

    const tenderItems = items.filter((opp) => getJourneyType(opp) === 'tender');
    const awardedRows = tenderItems.filter((opp) => normalizeCanonicalStatus(getDisplayStatus(opp)) === 'AWARDED');
    const awardedValue = awardedRows.length
      ? Math.max(...awardedRows.map((opp) => Number(opp.opportunityValue || 0)))
      : 0;

    return {
      key,
      items,
      primary,
      status,
      hasTender: items.some((opp) => getJourneyType(opp) === 'tender'),
      hasEoi: items.some((opp) => getJourneyType(opp) === 'eoi'),
      hasSubmissionNear: tenderItems.some((opp) => isSubmissionWithinDays(opp, 10)),
      hasSubmittedSignal: tenderItems.some((opp) => {
        const rowStatus = normalizeCanonicalStatus(getDisplayStatus(opp));
        return rowStatus === 'SUBMITTED' || rowStatus === 'AWARDED' || rowStatus === 'LOST';
      }),
      awardedValue,
    } as ProjectGroup;
  });

  const totalTenders = projectGroups.filter((group) => group.hasTender).length;
  const totalEoi = projectGroups.filter((group) => group.hasEoi).length;

  return {
    groups: projectGroups,
    totalTenders,
    totalEoi,
    duplicateOmissions,
  };
};

const withKpiOverrides = (kpiType: DashboardKpiType, baseFilters: FilterState): FilterState => {
  switch (kpiType) {
    case 'received':
      return { ...baseFilters, statuses: [], showAtRisk: false, excludeLostOutcomes: false };
    case 'submitted':
      return { ...baseFilters, statuses: ['SUBMITTED', 'AWARDED', 'LOST'], showAtRisk: false, excludeLostOutcomes: false };
    case 'won':
    case 'value':
      return { ...baseFilters, statuses: ['AWARDED'], showAtRisk: false, excludeLostOutcomes: false };
    case 'lost':
      return { ...baseFilters, statuses: ['LOST'], showAtRisk: false, excludeLostOutcomes: false };
    case 'regretted':
      return { ...baseFilters, statuses: ['REGRETTED'], showAtRisk: false, excludeLostOutcomes: false };
    case 'hold':
      return { ...baseFilters, statuses: ['HOLD / CLOSED'], showAtRisk: false, excludeLostOutcomes: false };
    case 'submission':
      return { ...baseFilters, statuses: [], showAtRisk: true, excludeLostOutcomes: false };
    case 'winRatio':
      return { ...baseFilters, statuses: ['AWARDED', 'LOST'], showAtRisk: false, excludeLostOutcomes: false };
    default:
      return baseFilters;
  }
};

const getKpiScopeFilters = (kpiType: DashboardKpiType, baseFilters: FilterState): FilterState => {
  const next = withKpiOverrides(kpiType, baseFilters);
  return {
    ...next,
    statuses: [],
    showAtRisk: false,
  };
};

const includesForKpi = (kpiType: DashboardKpiType, group: ProjectGroup) => {
  if (kpiType === 'received') {
    return { included: true, reason: 'included: unique project in received scope' };
  }
  if (kpiType === 'submitted') {
    return group.hasSubmittedSignal
      ? { included: true, reason: 'included: project has submitted/awarded/lost tender signal' }
      : { included: false, reason: 'excluded: no submitted/awarded/lost tender signal in project' };
  }
  if (kpiType === 'submission') {
    return group.hasSubmissionNear
      ? { included: true, reason: 'included: project has tender submission within 10 days' }
      : { included: false, reason: 'excluded: no tender submission within 10 days for project' };
  }
  if (kpiType === 'winRatio') {
    const isResolved = group.status === 'AWARDED' || group.status === 'LOST';
    return isResolved
      ? { included: true, reason: 'included: project has resolved result (awarded/lost)' }
      : { included: false, reason: 'excluded: project not resolved to awarded/lost' };
  }

  const statusByKpi: Record<Exclude<DashboardKpiType, 'received' | 'submission' | 'submitted' | 'value' | 'winRatio'>, ProjectStatus> = {
    regretted: 'REGRETTED',
    hold: 'HOLD / CLOSED',
    won: 'AWARDED',
    lost: 'LOST',
  };
  const targetStatus = kpiType === 'value' ? 'AWARDED' : statusByKpi[kpiType as Exclude<DashboardKpiType, 'received' | 'submission' | 'submitted' | 'value' | 'winRatio'>];
  if (group.status !== targetStatus) {
    return { included: false, reason: `excluded: project status is ${group.status}, expected ${targetStatus}` };
  }
  return { included: true, reason: `included: project status matched ${targetStatus}` };
};

const toDiagnosticEntry = (
  opp: Opportunity,
  reasonCode: string,
  reason: string,
  reasonMeta?: Record<string, unknown>,
  replacement?: Opportunity,
): KpiDiagnosticEntry => ({
  id: String(opp.id || `${opp.opportunityRefNo}-${opp.tenderName}`),
  refNo: normalizeText(opp.opportunityRefNo),
  tenderName: normalizeText(opp.tenderName),
  clientName: normalizeText(opp.clientName),
  journeyType: getJourneyType(opp),
  status: normalizeCanonicalStatus(getDisplayStatus(opp)),
  reasonCode,
  reason,
  reasonMeta,
  replacement: replacement ? {
    id: String(replacement.id || `${replacement.opportunityRefNo}-${replacement.tenderName}`),
    refNo: normalizeText(replacement.opportunityRefNo),
    tenderName: normalizeText(replacement.tenderName),
    status: normalizeCanonicalStatus(getDisplayStatus(replacement)),
  } : undefined,
});

const explainFilterExclusion = (opp: Opportunity, filters: FilterState) => {
  const search = String(filters.search || '').trim();
  if (search) {
    const searchLower = search.toLowerCase();
    const rowSnapshot = opp.rawGraphData?.rowSnapshot && typeof opp.rawGraphData.rowSnapshot === 'object'
      ? Object.values(opp.rawGraphData.rowSnapshot).map((value) => String(value ?? '')).join(' ').toLowerCase()
      : '';
    const searchableBlob = [
      opp.opportunityRefNo,
      opp.tenderName,
      opp.opportunityClassification,
      opp.clientName,
      opp.groupClassification,
      opp.awardedDate,
      opp.dateTenderReceived,
      opp.tenderPlannedSubmissionDate,
      opp.tenderSubmittedDate,
      opp.internalLead,
      opp.opportunityValue,
      opp.avenirStatus,
      opp.tenderResult,
      opp.remarksReason,
      opp.comments,
      rowSnapshot,
    ].map((value) => String(value ?? '').toLowerCase()).join(' ');
    if (!searchableBlob.includes(searchLower)) {
      return { reasonCode: 'F.SEARCH', reason: 'excluded: search filter did not match row text', reasonMeta: { search } };
    }
  }

  if (filters.statuses.length > 0) {
    const displayStatus = normalizeCanonicalStatus(getDisplayStatus(opp));
    const matchesStatus = filters.statuses.some((status) => {
      if (status === 'LOST') return opp.tenderResult === 'LOST';
      if (status === 'ONGOING') return opp.tenderResult === 'ONGOING';
      return opp.canonicalStage === status;
    });
    if (!matchesStatus) {
      return {
        reasonCode: 'F.STATUS',
        reason: 'excluded: status filter mismatch',
        reasonMeta: {
          statuses: filters.statuses,
          canonicalStage: opp.canonicalStage,
          tenderResult: opp.tenderResult,
          avenirStatus: (opp as any).avenirStatus,
          rawAvenirStatus: (opp as any).rawAvenirStatus,
          displayStatus,
          note: 'Filter uses canonicalStage (except LOST/ONGOING uses tenderResult). KPI cards use getDisplayStatus().',
        },
      };
    }
  }

  if (filters.excludeLostOutcomes && opp.tenderResult === 'LOST') {
    return { reasonCode: 'F.EXCLUDE_LOST', reason: 'excluded: exclude-lost-outcomes enabled', reasonMeta: { tenderResult: opp.tenderResult } };
  }

  if (filters.groups.length > 0 && !filters.groups.includes(opp.groupClassification)) {
    return { reasonCode: 'F.GROUP', reason: 'excluded: group not in selected groups', reasonMeta: { groups: filters.groups, group: opp.groupClassification } };
  }

  if (filters.leads.length > 0) {
    const normalizeKey = (value: string) => value.trim().toLowerCase();
    const leadKey = normalizeKey(String(opp.internalLead || ''));
    const selected = new Set(filters.leads.map((lead) => normalizeKey(lead)));
    if (!selected.has(leadKey)) {
      return { reasonCode: 'F.LEAD', reason: 'excluded: lead not in selected leads', reasonMeta: { leads: filters.leads, lead: opp.internalLead } };
    }
  }

  if (filters.clients.length > 0) {
    const normalizeKey = (value: string) => value.trim().toLowerCase();
    const clientKey = normalizeKey(String(opp.clientName || ''));
    const selected = new Set(filters.clients.map((client) => normalizeKey(client)));
    if (!selected.has(clientKey)) {
      return { reasonCode: 'F.CLIENT', reason: 'excluded: client not in selected clients', reasonMeta: { clients: filters.clients, client: opp.clientName } };
    }
  }

  if (filters.clientTypes.length > 0 && !filters.clientTypes.includes(opp.clientType)) {
    return { reasonCode: 'F.CLIENT_TYPE', reason: 'excluded: client type not selected', reasonMeta: { clientTypes: filters.clientTypes, clientType: opp.clientType } };
  }

  if (filters.qualificationStatuses.length > 0 && !filters.qualificationStatuses.includes(opp.qualificationStatus)) {
    return { reasonCode: 'F.QUAL', reason: 'excluded: qualification status not selected', reasonMeta: { qualificationStatuses: filters.qualificationStatuses, qualificationStatus: opp.qualificationStatus } };
  }

  if (filters.partnerInvolvement === 'yes' && !opp.partnerInvolvement) {
    return { reasonCode: 'F.PARTNER', reason: 'excluded: partner involvement required (yes)', reasonMeta: { partnerInvolvement: 'yes' } };
  }
  if (filters.partnerInvolvement === 'no' && opp.partnerInvolvement) {
    return { reasonCode: 'F.PARTNER', reason: 'excluded: partner involvement required (no)', reasonMeta: { partnerInvolvement: 'no' } };
  }

  const getPriorityDateValue = () => (
    opp.awardedDate
    || opp.tenderSubmittedDate
    || opp.tenderPlannedSubmissionDate
    || opp.dateTenderReceived
    || ''
  );
  const dateFieldValue = getPriorityDateValue();
  if (filters.dateRange.from || filters.dateRange.to) {
    if (!dateFieldValue) return { reasonCode: 'F.DATE', reason: 'excluded: date range active but row has no date', reasonMeta: { dateFieldValue: '' } };
    const dateValue = new Date(dateFieldValue);
    if (Number.isNaN(dateValue.getTime())) return { reasonCode: 'F.DATE', reason: 'excluded: invalid date value for date range', reasonMeta: { dateFieldValue } };
    if (filters.dateRange.from && dateValue < filters.dateRange.from) {
      return { reasonCode: 'F.DATE', reason: 'excluded: date before range start', reasonMeta: { dateFieldValue, from: filters.dateRange.from.toISOString() } };
    }
    if (filters.dateRange.to && dateValue > filters.dateRange.to) {
      return { reasonCode: 'F.DATE', reason: 'excluded: date after range end', reasonMeta: { dateFieldValue, to: filters.dateRange.to.toISOString() } };
    }
  }

  if (filters.valueRange.min !== undefined && opp.opportunityValue < filters.valueRange.min) {
    return { reasonCode: 'F.VALUE_MIN', reason: 'excluded: opportunity value below minimum', reasonMeta: { min: filters.valueRange.min, value: opp.opportunityValue } };
  }
  if (filters.valueRange.max !== undefined && opp.opportunityValue > filters.valueRange.max) {
    return { reasonCode: 'F.VALUE_MAX', reason: 'excluded: opportunity value above maximum', reasonMeta: { max: filters.valueRange.max, value: opp.opportunityValue } };
  }

  if (filters.showAtRisk && !opp.isAtRisk) {
    return { reasonCode: 'F.AT_RISK', reason: 'excluded: at-risk filter enabled and row is not at risk', reasonMeta: { isAtRisk: opp.isAtRisk } };
  }
  if (filters.showMissDeadline && !opp.willMissDeadline) {
    return { reasonCode: 'F.MISS_DEADLINE', reason: 'excluded: miss-deadline filter enabled and row does not miss deadline', reasonMeta: { willMissDeadline: opp.willMissDeadline } };
  }

  return { reasonCode: 'F.UNKNOWN', reason: 'excluded: did not satisfy active filters', reasonMeta: {} };
};

const formatCompactNumber = (value: number) => new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: value >= 1000 ? 1 : 0,
}).format(value || 0);

const KPI_DIAGNOSTICS_STORAGE_PREFIX = 'kpi-diagnostics:';
const MAX_DIAGNOSTICS_ROWS = 2500;

const evictOldKpiDiagnostics = () => {
  try {
    const keys: Array<{ key: string; ts: number }> = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(KPI_DIAGNOSTICS_STORAGE_PREFIX)) continue;
      const ts = Number(key.slice(KPI_DIAGNOSTICS_STORAGE_PREFIX.length).split('-')[0] || 0);
      keys.push({ key, ts });
    }
    keys.sort((a, b) => a.ts - b.ts);
    keys.slice(0, Math.max(0, keys.length - 6)).forEach(({ key }) => localStorage.removeItem(key));
  } catch {
    // ignore
  }
};

const tryStoreKpiDiagnostics = (reportId: string, report: KpiDiagnosticsReport) => {
  const storageKey = `${KPI_DIAGNOSTICS_STORAGE_PREFIX}${reportId}`;
  const attemptStore = (target: Storage, payload: KpiDiagnosticsReport) => {
    target.setItem(storageKey, JSON.stringify(payload));
  };

  const capReport = (payload: KpiDiagnosticsReport): KpiDiagnosticsReport => {
    const included = payload.included.slice(0, MAX_DIAGNOSTICS_ROWS);
    const omitted = payload.omitted.slice(0, MAX_DIAGNOSTICS_ROWS);
    return {
      ...payload,
      included,
      omitted,
      counts: {
        ...payload.counts,
        includedRows: payload.counts.includedRows,
        omittedRows: payload.counts.omittedRows,
      },
    };
  };

  evictOldKpiDiagnostics();
  try {
    attemptStore(localStorage, report);
    return;
  } catch {
    // fall through
  }

  try {
    attemptStore(sessionStorage, report);
    return;
  } catch {
    // fall through
  }

  const capped = capReport(report);
  (capped as any).truncated = true;
  try {
    attemptStore(sessionStorage, capped);
  } catch {
    // Nothing else we can do; avoid throwing in UI thread.
  }
};

const Dashboard = () => {
  const { opportunities, isLoading, error, lastSyncTime, isLiveRefreshActive } = useData();
  const { formatCurrency, currency, convertValue } = useCurrency();
  const [selectedOpp, setSelectedOpp] = useState<Opportunity | null>(null);
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [awardAuditOpen, setAwardAuditOpen] = useState(false);
  const [awardAuditRows, setAwardAuditRows] = useState<AwardedValueAuditRow[]>([]);
  const wonClickRef = useRef<{ count: number; timer: number | null }>({ count: 0, timer: null });

  const filteredData = useMemo(() => applyFilters(opportunities, filters), [opportunities, filters]);
  const funnelData = useMemo(() => calculateFunnelData(filteredData), [filteredData]);
  const clientData = useMemo(() => getClientData(filteredData), [filteredData]);
  const dataHealth = useMemo(() => calculateDataHealth(filteredData), [filteredData]);

  const groupedOpportunities = useMemo(() => buildProjectGroups(filteredData), [filteredData]);

  const groupedBuckets = useMemo(() => {
    const receivedGroups: ProjectGroup[] = [...groupedOpportunities.groups];
    const submittedGroups: ProjectGroup[] = receivedGroups.filter((group) => group.hasSubmittedSignal);
    const regrettedGroups: ProjectGroup[] = receivedGroups.filter((group) => group.status === 'REGRETTED');
    const wonGroups: ProjectGroup[] = receivedGroups.filter((group) => group.status === 'AWARDED');
    const holdGroups: ProjectGroup[] = receivedGroups.filter((group) => group.status === 'HOLD / CLOSED');
    const lostGroups: ProjectGroup[] = receivedGroups.filter((group) => group.status === 'LOST');
    const submissionNearGroups: ProjectGroup[] = receivedGroups.filter((group) => group.hasSubmissionNear);
    const resolvedGroups: ProjectGroup[] = receivedGroups.filter((group) => group.status === 'AWARDED' || group.status === 'LOST');

    const groupRows = (groups: ProjectGroup[]) => groups
      .map((group) => group.primary)
      .filter(Boolean) as Opportunity[];

    const sumAwardedValue = (groups: ProjectGroup[]) => groups.reduce((sum, group) => {
      return sum + Number(group.awardedValue || 0);
    }, 0);

    const submittedOnlyValue = submittedGroups.reduce((sum, group) => {
      const primary = group.primary;
      return sum + Number(primary?.opportunityValue || 0);
    }, 0);
    const submittedTenderCount = submittedGroups.filter((group) => group.hasTender).length;
    const submittedEoiCount = submittedGroups.filter((group) => group.hasEoi).length;
    const winRatio = resolvedGroups.length ? (wonGroups.length / resolvedGroups.length) : 0;

    return {
      received: {
        groups: receivedGroups,
        rows: groupRows(receivedGroups),
        tender: groupedOpportunities.totalTenders,
        eoi: groupedOpportunities.totalEoi,
      },
      submitted: {
        groups: submittedGroups,
        rows: groupRows(submittedGroups),
        submittedOnlyValue,
        tender: submittedTenderCount,
        eoi: submittedEoiCount,
      },
      regretted: { groups: regrettedGroups, rows: groupRows(regrettedGroups) },
      hold: { groups: holdGroups, rows: groupRows(holdGroups) },
      won: { groups: wonGroups, rows: groupRows(wonGroups), value: sumAwardedValue(wonGroups) },
      lost: { groups: lostGroups, rows: groupRows(lostGroups) },
      submission: { groups: submissionNearGroups, rows: groupRows(submissionNearGroups) },
      winRatio: {
        resolvedCount: resolvedGroups.length,
        wonCount: wonGroups.length,
        ratio: winRatio,
      },
    };
  }, [groupedOpportunities]);

  const receivedDedupe = {
    totalTenders: groupedBuckets.received.tender,
    totalEoi: groupedBuckets.received.eoi,
  };

  const duplicateTraceByKeptId = useMemo<DuplicateTraceByKeptId>(() => {
    const trace: DuplicateTraceByKeptId = {};
    groupedOpportunities.duplicateOmissions.forEach(({ kept, omitted, reason }) => {
      const keptId = String(kept.id || `${kept.opportunityRefNo}-${kept.tenderName}`);
      if (!trace[keptId]) {
        trace[keptId] = {
          kept: {
            id: keptId,
            refNo: normalizeText(kept.opportunityRefNo),
            tenderName: normalizeText(kept.tenderName),
            clientName: normalizeText(kept.clientName),
            status: normalizeCanonicalStatus(getDisplayStatus(kept)),
            reason: 'primary row kept for canonical project',
          },
          omitted: [],
        };
      }
      trace[keptId].omitted.push({
        id: String(omitted.id || `${omitted.opportunityRefNo}-${omitted.tenderName}`),
        refNo: normalizeText(omitted.opportunityRefNo),
        tenderName: normalizeText(omitted.tenderName),
        clientName: normalizeText(omitted.clientName),
        status: normalizeCanonicalStatus(getDisplayStatus(omitted)),
        reason: reason === 'duplicate_project_grouping'
          ? 'merged under canonical project key (base ref + clean tender name)'
          : 'merged under canonical project key',
      });
    });
    return trace;
  }, [groupedOpportunities]);

  const computeAwardedNotAccountedRows = useMemo(() => {
    const rows: AwardedValueAuditRow[] = [];
    groupedOpportunities.groups.forEach((group) => {
      if (group.status !== 'AWARDED') return;
      const awardedTenderRows = group.items
        .filter((opp) => getJourneyType(opp) === 'tender')
        .filter((opp) => normalizeCanonicalStatus(getDisplayStatus(opp)) === 'AWARDED')
        .map((opp) => ({
          id: String(opp.id || `${opp.opportunityRefNo}-${opp.tenderName}`),
          refNo: normalizeText(opp.opportunityRefNo),
          clientName: normalizeText(opp.clientName),
          value: Number(opp.opportunityValue || 0),
        }))
        .filter((row) => Number.isFinite(row.value) && row.value > 0);

      if (awardedTenderRows.length <= 1) return;

      const maxValue = Math.max(...awardedTenderRows.map((row) => row.value));
      const counted = awardedTenderRows.find((row) => row.value === maxValue) || null;
      const notCounted = counted
        ? awardedTenderRows.filter((row) => row.id !== counted.id)
        : awardedTenderRows;
      if (!notCounted.length) return;

      rows.push({
        projectKey: group.key,
        counted,
        notCounted,
      });
    });

    rows.sort((a, b) => b.notCounted.length - a.notCounted.length || a.projectKey.localeCompare(b.projectKey));
    return rows;
  }, [groupedOpportunities.groups]);

  const handleWonCardClick = () => {
    const ref = wonClickRef.current;
    ref.count += 1;
    if (ref.timer) window.clearTimeout(ref.timer);
    ref.timer = window.setTimeout(() => {
      ref.count = 0;
      ref.timer = null;
    }, 700);

    if (ref.count >= 3) {
      ref.count = 0;
      if (ref.timer) window.clearTimeout(ref.timer);
      ref.timer = null;
      setAwardAuditRows(computeAwardedNotAccountedRows);
      setAwardAuditOpen(true);
      return;
    }

    // Won single-click should filter without opening the diagnostics new tab.
    const nextFilters = withKpiOverrides('won', filters);
    setFilters(nextFilters);
  };

  const openKpiDiagnosticsWindow = (kpiType: DashboardKpiType, nextFilters: FilterState) => {
    const scopeFilters = getKpiScopeFilters(kpiType, nextFilters);
    const preKpiScopedRows = applyFilters(opportunities, scopeFilters);
    const grouped = buildProjectGroups(preKpiScopedRows);

    const includedRows: KpiDiagnosticEntry[] = [];
    const omittedRows: KpiDiagnosticEntry[] = [];

    grouped.groups.forEach((group) => {
      const row = group.primary || group.items[0];
      if (!row) return;
      const verdict = includesForKpi(kpiType, group);
      if (verdict.included) includedRows.push(toDiagnosticEntry(row, 'K.INCLUDED', verdict.reason));
      else omittedRows.push(toDiagnosticEntry(row, 'K.EXCLUDED', verdict.reason));
    });

    grouped.duplicateOmissions.forEach(({ omitted, kept, reason }) => {
      omittedRows.push(toDiagnosticEntry(
        omitted,
        'K.DEDUPE_MERGED',
        reason === 'duplicate_project_grouping'
          ? 'excluded: merged into canonical project key (base ref/tender-name grouping)'
          : 'excluded: merged into canonical project key',
        undefined,
        kept,
      ));
    });

    const scopedIds = new Set(preKpiScopedRows.map((row) => String(row.id)));
    opportunities.forEach((opp) => {
      if (scopedIds.has(String(opp.id))) return;
      const explained = explainFilterExclusion(opp, scopeFilters);
      omittedRows.push(toDiagnosticEntry(opp, explained.reasonCode, explained.reason, explained.reasonMeta));
    });

    const reportId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const report: KpiDiagnosticsReport = {
      reportId,
      generatedAt: new Date().toISOString(),
      kpiType,
      appliedFilters: {
        statuses: nextFilters.statuses,
        showAtRisk: nextFilters.showAtRisk,
        excludeLostOutcomes: nextFilters.excludeLostOutcomes,
      },
      counts: {
        sourceRows: opportunities.length,
        preKpiScopedRows: preKpiScopedRows.length,
        includedRows: includedRows.length,
        omittedRows: omittedRows.length,
      },
      included: includedRows,
      omitted: omittedRows,
    };

    tryStoreKpiDiagnostics(reportId, report);
    window.open(`/kpi-diagnostics?report=${encodeURIComponent(reportId)}`, '_blank', 'noopener,noreferrer');
  };

  const openKpiOmittedWindow = (kpiType: DashboardKpiType, nextFilters: FilterState) => {
    const scopeFilters = kpiType === 'value'
      ? withKpiOverrides('value', nextFilters)
      : getKpiScopeFilters(kpiType, nextFilters);
    const preKpiScopedRows = applyFilters(opportunities, scopeFilters);
    const grouped = buildProjectGroups(preKpiScopedRows);

    const includedRows: KpiDiagnosticEntry[] = [];
    const omittedRows: KpiDiagnosticEntry[] = [];

    grouped.groups.forEach((group) => {
      const row = group.primary || group.items[0];
      if (!row) return;
      const verdict = includesForKpi(kpiType, group);
      if (verdict.included) includedRows.push(toDiagnosticEntry(row, 'K.INCLUDED', verdict.reason));
      else omittedRows.push(toDiagnosticEntry(row, 'K.EXCLUDED', verdict.reason));
    });

    grouped.duplicateOmissions.forEach(({ omitted, kept, reason }) => {
      omittedRows.push(toDiagnosticEntry(
        omitted,
        'K.DEDUPE_MERGED',
        reason === 'duplicate_project_grouping'
          ? 'excluded: merged into canonical project key (base ref/tender-name grouping)'
          : 'excluded: merged into canonical project key',
        undefined,
        kept,
      ));
    });

    const scopedIds = new Set(preKpiScopedRows.map((row) => String(row.id)));
    opportunities.forEach((opp) => {
      if (scopedIds.has(String(opp.id))) return;
      if (kpiType === 'value' && normalizeCanonicalStatus(getDisplayStatus(opp)) !== 'AWARDED') return;
      const explained = explainFilterExclusion(opp, scopeFilters);
      omittedRows.push(toDiagnosticEntry(opp, explained.reasonCode, explained.reason, explained.reasonMeta));
    });

    const reportId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const report: KpiDiagnosticsReport = {
      reportId,
      generatedAt: new Date().toISOString(),
      kpiType,
      appliedFilters: {
        statuses: nextFilters.statuses,
        showAtRisk: nextFilters.showAtRisk,
        excludeLostOutcomes: nextFilters.excludeLostOutcomes,
      },
      counts: {
        sourceRows: opportunities.length,
        preKpiScopedRows: preKpiScopedRows.length,
        includedRows: includedRows.length,
        omittedRows: omittedRows.length,
      },
      included: includedRows,
      omitted: omittedRows,
    };

    tryStoreKpiDiagnostics(reportId, report);
    window.open(`/kpi-diagnostics?report=${encodeURIComponent(reportId)}&view=omitted`, '_blank', 'noopener,noreferrer');
  };

  const handleKPIClick = (kpiType: DashboardKpiType) => {
    const nextFilters = withKpiOverrides(kpiType, filters);
    setFilters(nextFilters);
    openKpiDiagnosticsWindow(kpiType, nextFilters);
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
    {
      label: 'Win Ratio',
      value: `${Math.round(groupedBuckets.winRatio.ratio * 100)}%`,
      chip: `Won ${groupedBuckets.winRatio.wonCount} / Resolved ${groupedBuckets.winRatio.resolvedCount}`,
      tone: 'text-emerald-700',
      glow: 'analytics-kpi-glow-emerald',
      icon: Target,
      type: 'winRatio' as const,
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

  const submittedCards = [
    {
      label: 'Total Tender',
      value: groupedBuckets.submitted.tender,
      tone: 'text-sky-600',
      glow: 'analytics-kpi-glow-sky',
      icon: Send,
    },
    {
      label: 'Total EOI',
      value: groupedBuckets.submitted.eoi,
      tone: 'text-amber-600',
      glow: 'analytics-kpi-glow-amber',
      icon: Send,
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
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
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

          <div className="rounded-2xl border-2 border-emerald-300/80 bg-emerald-50/30 p-3 shadow-[0_0_24px_rgba(16,185,129,0.18)]">
            <div className="flex items-center justify-between px-2 pb-2">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-700">Total Submitted</p>
              <p className="text-sm font-bold text-emerald-800">{groupedBuckets.submitted.groups.length}</p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {submittedCards.map((card, index) => (
                <button
                  key={card.label}
                  type="button"
                  className={`analytics-card analytics-kpi-card ${card.glow} w-full text-left transition-transform hover:-translate-y-0.5`}
                  style={{ animationDelay: `${index * 0.07}s` }}
                  onClick={() => handleKPIClick('submitted')}
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
            <div className="mt-2 px-2 flex items-center gap-1.5 text-xs font-medium text-emerald-700">
              {currency === 'AED' ? <img src={aedSymbol} alt="AED" className="h-3.5 w-3.5 opacity-80" /> : null}
              <span>{`${currency === 'AED' ? '' : '$'}${formatCompactNumber(convertValue(groupedBuckets.submitted.submittedOnlyValue || 0))}`}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpiCards.map((card, index) => (
          <button
            key={card.label}
            type="button"
            className="analytics-card analytics-kpi-card w-full text-left transition-transform hover:-translate-y-0.5"
            style={{ animationDelay: `${index * 0.07}s` }}
            onClick={() => {
              if (card.type === 'won') {
                handleWonCardClick();
                return;
              }
              handleKPIClick(card.type);
            }}
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
              <div className="flex flex-col items-end gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-slate-200 bg-white/80 p-1 text-slate-500 hover:text-slate-900"
                  aria-label={`Show omitted rows for ${card.label}`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const nextFilters = withKpiOverrides(card.type, filters);
                    openKpiOmittedWindow(card.type, nextFilters);
                  }}
                >
                  <Info className="h-4 w-4" />
                </button>
                <div className={`rounded-2xl border border-white/70 bg-white/80 p-2.5 shadow-sm ${card.tone}`}>
                  <card.icon className="h-5 w-5" />
                </div>
              </div>
            </div>
          </button>
        ))}
        </div>
      </section>

      <Dialog open={awardAuditOpen} onOpenChange={setAwardAuditOpen}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Awarded Values Not Accounted For</DialogTitle>
            <DialogDescription>
              Triple-click on Won opens this audit. Won Value currently counts one awarded row per project (highest value). This lists the awarded rows that were excluded.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground">
              Projects with excluded awarded rows: {awardAuditRows.length}
            </div>
            <div className="overflow-x-auto rounded-md border">
              <Table className="text-xs">
                <TableHeader>
                  <TableRow>
                    <TableHead>Project Key</TableHead>
                    <TableHead>Counted Award</TableHead>
                    <TableHead>Excluded Awarded Rows</TableHead>
                    <TableHead className="text-right">Excluded Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {awardAuditRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">
                        No excluded awarded values found (each awarded project has 0-1 awarded row with value).
                      </TableCell>
                    </TableRow>
                  ) : null}
                  {awardAuditRows.map((row) => {
                    const excludedTotal = row.notCounted.reduce((sum, item) => sum + Number(item.value || 0), 0);
                    const countedText = row.counted
                      ? `${row.counted.refNo || '—'} | ${row.counted.clientName || '—'} | ${formatCurrency(row.counted.value)}`
                      : '—';
                    const excludedText = row.notCounted
                      .map((item) => `${item.refNo || '—'} | ${item.clientName || '—'} | ${formatCurrency(item.value)}`)
                      .join(' || ');
                    return (
                      <TableRow key={`award-audit-${row.projectKey}`}>
                        <TableCell className="font-mono">{row.projectKey}</TableCell>
                        <TableCell>{countedText}</TableCell>
                        <TableCell>{excludedText}</TableCell>
                        <TableCell className="text-right font-mono">{excludedTotal > 0 ? formatCurrency(excludedTotal) : '—'}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Opportunities Table */}
      <OpportunitiesTable
        data={filteredData}
        onSelectOpportunity={setSelectedOpp}
        responsiveMode="dashboard"
        duplicateTraceByKeptId={duplicateTraceByKeptId}
      />

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
