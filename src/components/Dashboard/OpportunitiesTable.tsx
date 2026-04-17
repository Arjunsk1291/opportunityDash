import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Search, CheckCircle, Clock, RotateCcw, RefreshCw, MessageSquare, ArrowRight, ArrowUpDown, Eye, EyeOff } from 'lucide-react';
import { Opportunity } from '@/data/opportunityData';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useApproval } from '@/contexts/ApprovalContext';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import styles from './OpportunitiesTable.module.css';
import { getDisplayStatus, getStatusBadgeClass } from '@/lib/opportunityStatus';

interface OpportunitiesTableProps {
  data: Opportunity[];
  onSelectOpportunity?: (opp: Opportunity) => void;
  scrollContainerClassName?: string;
  maxHeight?: string;
  responsiveMode?: 'default' | 'dashboard';
  forcePostBidColumn?: boolean;
  excelWrap?: boolean;
}

const AVENIR_STATUS_OPTIONS = ['ALL', 'AWARDED', 'WORKING', 'TO START', 'HOLD / CLOSED', 'REGRETTED', 'SUBMITTED', 'ONGOING', 'LOST'];
const API_URL = import.meta.env.VITE_API_URL || '/api';
const normalizeHeader = (value: string) => String(value || '').trim().toUpperCase().replace(/\s+/g, ' ');
const TABLE_DENSITY_STYLES = [
  { cell: 'px-1 sm:px-1.5', text: 'text-[10px] sm:text-[11px]' },
  { cell: 'px-1.5 sm:px-2', text: 'text-[10px] sm:text-[11px]' },
  { cell: 'px-2 sm:px-2.5', text: 'text-[11px] sm:text-xs' },
  { cell: 'px-2 sm:px-3', text: 'text-[11px] sm:text-xs' },
] as const;
const POST_BID_OTHER = 'OTHER';
const POST_BID_OPTIONS = [
  { value: 'TECHNICAL_CLARIFICATION_MEETING', label: 'Technical Clarification meeting' },
  { value: 'TECHNICAL_PRESENTATION', label: 'Technical presentation' },
  { value: 'NO_RESPONSE', label: 'No response' },
  { value: POST_BID_OTHER, label: 'Other' },
] as const;

const getPostBidLabel = (detailType?: string, detailOther?: string) => {
  const normalized = String(detailType || '').trim().toUpperCase();
  if (normalized === POST_BID_OTHER) {
    const otherValue = String(detailOther || '').trim();
    return otherValue ? `Other: ${otherValue}` : 'Other';
  }
  return POST_BID_OPTIONS.find((option) => option.value === normalized)?.label || '';
};

const getPostBidBadgeClass = (detailType?: string) => {
  switch (String(detailType || '').trim().toUpperCase()) {
    case 'TECHNICAL_CLARIFICATION_MEETING':
      return 'border border-amber-300 bg-amber-100 text-amber-900';
    case 'TECHNICAL_PRESENTATION':
      return 'border border-sky-300 bg-sky-100 text-sky-900';
    case 'NO_RESPONSE':
      return 'border border-slate-300 bg-slate-200 text-slate-800';
    case POST_BID_OTHER:
      return 'border border-fuchsia-300 bg-fuchsia-100 text-fuchsia-900';
    default:
      return 'border border-slate-200 bg-slate-100 text-slate-700';
  }
};

export function OpportunitiesTable({
  data,
  onSelectOpportunity,
  scrollContainerClassName,
  maxHeight = 'max-h-96',
  responsiveMode = 'default',
  forcePostBidColumn = false,
  excelWrap = false,
}: OpportunitiesTableProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [showConvertedEoiRows, setShowConvertedEoiRows] = useState(false);
  const [sortBy, setSortBy] = useState<'ref' | 'rfp'>('ref');
  const [rfpSortOrder, setRfpSortOrder] = useState<'desc' | 'asc'>('desc');
  const [refSortOrder, setRefSortOrder] = useState<'asc' | 'desc'>('desc');
  const { formatCurrency } = useCurrency();
  const { getApprovalStatus, getApprovalState, approveAsProposalHead, approveAsSVP, bulkApprove, bulkRevert, revertApproval, refreshApprovals } = useApproval();
  const { isProposalHead, isSVP, isMaster, user, token, canPerformAction } = useAuth();
  const { refreshData } = useData();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isBulkOpen, setIsBulkOpen] = useState(false);
  const [bulkMode, setBulkMode] = useState<'approve' | 'revert'>('approve');
  const [bulkAction, setBulkAction] = useState<'proposal_head' | 'svp'>(isSVP && !isMaster ? 'svp' : 'proposal_head');
  const [postBidCanEdit, setPostBidCanEdit] = useState(false);
  const [postBidSavingId, setPostBidSavingId] = useState<string | null>(null);
  const [bulkFilters, setBulkFilters] = useState({
    dateFrom: '',
    dateTo: '',
    group: '',
    lead: '',
    client: '',
    submitter: '',
  });

  const postBidColumnClass = forcePostBidColumn
    ? ''
    : responsiveMode === 'dashboard'
    ? 'hidden min-[1750px]:table-cell'
    : 'hidden 2xl:table-cell';
  const densityStyle = TABLE_DENSITY_STYLES[1];
  const cellPaddingClass = densityStyle.cell;
  const tableTextClass = densityStyle.text;

  useEffect(() => {
    if (!token) return;

    let mounted = true;
    const loadPostBidConfig = async () => {
      try {
        const response = await fetch(API_URL + '/opportunities/post-bid-config', {
          headers: {
            Authorization: 'Bearer ' + token,
            'Content-Type': 'application/json',
          },
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload?.error || 'Failed to load post-bid permissions');
        }
        if (!mounted) return;
        setPostBidCanEdit(Boolean(payload?.canEdit));
      } catch (error) {
        console.error('❌ Failed to load post-bid permissions:', error);
      }
    };

    loadPostBidConfig();
    return () => {
      mounted = false;
    };
  }, [token]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const canSync = Boolean(token) && canPerformAction('opportunities_sync');
      if (canSync) {
        const response = await fetch(API_URL + '/opportunities/sync-graph', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + token,
          },
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload?.error || 'Sync failed');
        }
        const newRowsCount = Number(payload?.newRowsCount || 0);
        if (newRowsCount > 0) {
          toast.success(`Sync complete. ${newRowsCount} new row${newRowsCount === 1 ? '' : 's'} detected.`);
        } else {
          toast.message('Sync complete. No new rows detected.');
        }
      }
      await Promise.all([refreshApprovals(), refreshData()]);
    } catch (error) {
      toast.error((error as Error).message || 'Refresh failed');
    } finally {
      setIsRefreshing(false);
    }
  };

  const getRfpReceivedDisplay = (tender: Opportunity) => {
    return tender.dateTenderReceived
      || (typeof tender.rawGraphData?.rfpReceivedDisplay === 'string' ? tender.rawGraphData.rfpReceivedDisplay : '')
      || '';
  };

  const getAdnocRftNo = (tender: Opportunity) => {
    if (tender.adnocRftNo) return tender.adnocRftNo;
    const snapshot = tender.rawGraphData?.rowSnapshot;
    if (!snapshot || typeof snapshot !== 'object') return '';

    const entries = Object.entries(snapshot);
    for (const header of ['ADNOC RFT NO', 'ADNOC RFT NO.']) {
      const match = entries.find(([key]) => normalizeHeader(key) === normalizeHeader(header));
      if (match) return String(match[1] ?? '').trim();
    }

    return '';
  };

  const getSubmissionDisplay = (tender: Opportunity) => {
    return tender.tenderSubmittedDate
      || tender.tenderPlannedSubmissionDate
      || (typeof tender.rawGraphData?.tenderSubmittedDisplay === 'string' ? tender.rawGraphData.tenderSubmittedDisplay : '')
      || (typeof tender.rawGraphData?.plannedSubmissionDisplay === 'string' ? tender.rawGraphData.plannedSubmissionDisplay : '')
      || '';
  };

  const normalizeComparisonText = (value: string | null | undefined) => String(value || '').trim().toLowerCase();

  const normalizeRefNo = (value: string | null | undefined) => String(value || '').trim().replace(/\s+/g, ' ').toUpperCase();

  const getBaseRefNo = (value: string | null | undefined) => normalizeRefNo(value).replace(/_EOI$/i, '');

  const isEoiRefNo = (value: string | null | undefined) => /_EOI$/i.test(normalizeRefNo(value));

  const isEoiClassification = (value: string | null | undefined) => normalizeComparisonText(value).includes('eoi');

  const isEoiRow = (tender: Opportunity) => (
    isEoiRefNo(tender.opportunityRefNo) || isEoiClassification(tender.opportunityClassification)
  );

  const getMergedStatus = (tender: Opportunity) => {
    return getDisplayStatus(tender);
  };

  const buildSearchableText = (tender: Opportunity) => {
    const approvalSearchValue = getApprovalStatus(tender.opportunityRefNo).toLowerCase();
    const rowSnapshot = tender.rawGraphData?.rowSnapshot && typeof tender.rawGraphData.rowSnapshot === 'object'
      ? Object.values(tender.rawGraphData.rowSnapshot).map((value) => String(value ?? '')).join(' ').toLowerCase()
      : '';

    return [
      tender.opportunityRefNo,
      tender.tenderName,
      tender.opportunityClassification,
      tender.clientName,
      tender.groupClassification,
      getRfpReceivedDisplay(tender),
      tender.internalLead,
      tender.opportunityValue,
      tender.avenirStatus,
      getSubmissionDisplay(tender),
      tender.remarksReason,
      tender.tenderStatusRemark,
      tender.tenderResult,
      approvalSearchValue,
      tender.comments,
      rowSnapshot,
    ].map((value) => String(value ?? '').toLowerCase()).join(' ');
  };

  const getRfpSortTime = (tender: Opportunity) => {
    const directDate = tender.dateTenderReceived ? new Date(tender.dateTenderReceived) : null;
    if (directDate && !Number.isNaN(directDate.getTime())) return directDate.getTime();

    const display = getRfpReceivedDisplay(tender);
    const parsedDisplay = display ? new Date(display) : null;
    if (parsedDisplay && !Number.isNaN(parsedDisplay.getTime())) return parsedDisplay.getTime();

    return 0;
  };

  const filteredData = data
    .filter((tender) => {
      const searchLower = search.toLowerCase();
      const rfpReceivedDisplay = getRfpReceivedDisplay(tender).toLowerCase();
      const allSearchable = buildSearchableText(tender);
      const mergedStatus = getMergedStatus(tender);

      const matchesSearch = !search || allSearchable.includes(searchLower) || rfpReceivedDisplay.includes(searchLower);
      const matchesStatus = statusFilter === 'ALL' || mergedStatus === statusFilter;

      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => {
      const refA = String(a.opportunityRefNo || '').toUpperCase();
      const refB = String(b.opportunityRefNo || '').toUpperCase();
      if (sortBy === 'ref') {
        const refCompare = refA.localeCompare(refB);
        return refSortOrder === 'asc' ? refCompare : -refCompare;
      }
      const aTime = getRfpSortTime(a);
      const bTime = getRfpSortTime(b);
      if (aTime === bTime) {
        const refCompare = refA.localeCompare(refB);
        return refSortOrder === 'asc' ? refCompare : -refCompare;
      }
      return rfpSortOrder === 'desc' ? bTime - aTime : aTime - bTime;
    });

  const visibleData = useMemo(() => {
    if (showConvertedEoiRows) return filteredData;

    return filteredData.filter((tender) => {
      if (!isEoiRow(tender)) return true;

      const baseRefNo = normalizeComparisonText(getBaseRefNo(tender.opportunityRefNo));
      const tenderName = normalizeComparisonText(tender.tenderName);
      if (!baseRefNo || !tenderName) return true;

      const convertedTenderExists = filteredData.some((candidate) => (
        candidate.id !== tender.id
        && !isEoiRow(candidate)
        && normalizeComparisonText(getBaseRefNo(candidate.opportunityRefNo)) === baseRefNo
        && normalizeComparisonText(candidate.tenderName) === tenderName
      ));

      return !convertedTenderExists;
    });
  }, [filteredData, showConvertedEoiRows]);

  const getTenderTypeBadge = (type?: string) => {
    const key = String(type || '').toUpperCase();
    const variants: Record<string, string> = {
      TENDER: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border border-blue-200 dark:border-blue-800',
      PROPOSAL: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 border border-violet-200 dark:border-violet-800',
      PREQUALIFICATION: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800',
    };
    return variants[key] || 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700';
  };

  const getGroupBadge = (group?: string) => {
    const key = String(group || '').toUpperCase();
    const variants: Record<string, string> = {
      GTS: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800',
      GES: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800',
      GDS: 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/40 dark:text-fuchsia-300 border border-fuchsia-200 dark:border-fuchsia-800',
      GTN: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300 border border-orange-200 dark:border-orange-800',
    };
    return variants[key] || 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700';
  };

  const canSVPApprove = (tender: Opportunity) => {
    if (!canPerformAction('approvals_svp')) return false;
    if (isMaster || !user?.assignedGroup) return true;
    return tender.groupClassification?.toUpperCase() === user.assignedGroup?.toUpperCase();
  };

  const getSubmitter = (tender: Opportunity) => {
    const snapshot = tender.rawGraphData?.rowSnapshot;
    if (!snapshot || typeof snapshot !== 'object') return '';
    const entries = Object.entries(snapshot);
    for (const [key, value] of entries) {
      const normalized = String(key || '').toUpperCase().replace(/\\s+/g, ' ').trim();
      if (['SUBMITTED BY', 'SUBMITTER', 'SUBMITTEDBY'].includes(normalized)) {
        return String(value || '').trim();
      }
    }
    return '';
  };

  const filterOptions = useMemo(() => {
    const groups = new Set<string>();
    const leads = new Set<string>();
    const clients = new Set<string>();
    const submitters = new Set<string>();
    data.forEach((tender) => {
      if (tender.groupClassification) groups.add(tender.groupClassification);
      if (tender.internalLead) leads.add(tender.internalLead);
      if (tender.clientName) clients.add(tender.clientName);
      const submitter = getSubmitter(tender);
      if (submitter) submitters.add(submitter);
    });
    return {
      groups: Array.from(groups).sort(),
      leads: Array.from(leads).sort(),
      clients: Array.from(clients).sort(),
      submitters: Array.from(submitters).sort(),
    };
  }, [data]);

  const canBulkProposalHead = canPerformAction('approvals_proposal_head');
  const canBulkSVP = canPerformAction('approvals_svp');
  const canBulkApprove = canBulkProposalHead || canBulkSVP;
  const canBulkRevert = canPerformAction('approvals_bulk_revert');
  const canSingleRevert = canPerformAction('approvals_revert');

  useEffect(() => {
    if (!isBulkOpen) setBulkMode('approve');
  }, [isBulkOpen]);

  const handleBulkApprove = async () => {
    try {
      if (bulkMode === 'revert') {
        const result = await bulkRevert(bulkFilters);
        toast.success(`Bulk revert complete. Updated ${result.updated}.`);
      } else {
        const result = await bulkApprove(bulkAction, bulkFilters);
        toast.success(`Bulk approval complete. Updated ${result.updated}.`);
      }
      setIsBulkOpen(false);
    } catch (error) {
      toast.error((error as Error).message || 'Bulk action failed');
    }
  };

  const savePostBidDetails = async (tender: Opportunity, detailType: string, otherText = '') => {
    if (!token) return;
    setPostBidSavingId(tender.id);
    try {
      const response = await fetch(`${API_URL}/opportunities/${encodeURIComponent(tender.id)}/post-bid-details`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          detailType,
          otherText,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to save post-bid details');
      }
      await refreshData({ background: true });
      toast.success('Post-bid details updated.');
    } catch (error) {
      toast.error((error as Error).message || 'Failed to save post-bid details');
    } finally {
      setPostBidSavingId(null);
    }
  };

  return (
    <Card className="flex-1 flex flex-col min-w-0 overflow-x-hidden">
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg">Tenders</CardTitle>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setShowConvertedEoiRows((prev) => !prev)}
                >
                  {showConvertedEoiRows ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {showConvertedEoiRows ? 'Hide converted EOI duplicates' : 'Show converted EOI duplicates'}
              </TooltipContent>
            </Tooltip>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <div className="relative min-w-0 w-full sm:w-auto">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search..."
                className="pl-8 text-xs sm:text-sm"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-32 text-xs sm:text-sm">
                <SelectValue placeholder="Filter..." />
              </SelectTrigger>
              <SelectContent>
                {AVENIR_STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className={isRefreshing ? 'animate-spin' : ''}
                  onClick={handleRefresh}
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Refresh approvals</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 min-w-0 flex-col overflow-hidden p-0">
        <div className={`${scrollContainerClassName || ''} w-full max-w-full min-w-0 overflow-x-auto ${maxHeight} overflow-y-auto ${styles.scrollContainer}`}>
          <Table className={`w-max min-w-full ${tableTextClass}`}>
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow>
                <TableHead className={`${cellPaddingClass} font-bold`}>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-primary hover:text-primary/80"
                    onClick={() => {
                      setSortBy('ref');
                      setRefSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
                    }}
                  >
                    Avenir Ref
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </TableHead>
                <TableHead className={`${cellPaddingClass} font-bold`}>Tender Name</TableHead>
                <TableHead className={`hidden md:table-cell ${cellPaddingClass} font-bold`}>Tender Type</TableHead>
                <TableHead className={`${cellPaddingClass} font-bold`}>Client</TableHead>
                <TableHead className={`hidden lg:table-cell ${cellPaddingClass} font-bold`}>Group</TableHead>
                <TableHead className={`hidden lg:table-cell ${cellPaddingClass} font-bold`}>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-primary hover:text-primary/80"
                    onClick={() => {
                      setSortBy('rfp');
                      setRfpSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'));
                    }}
                  >
                    RFP Received
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </TableHead>
                <TableHead className={`hidden xl:table-cell ${cellPaddingClass} font-bold`}>Submission</TableHead>
                <TableHead className={`hidden xl:table-cell ${cellPaddingClass} font-bold`}>Lead</TableHead>
                <TableHead className={`${cellPaddingClass} text-right font-bold`}>Value</TableHead>
                <TableHead className={`${cellPaddingClass} font-bold`}>Status</TableHead>
                <TableHead className={`hidden md:table-cell ${cellPaddingClass} font-bold`}>Remarks</TableHead>
                <TableHead className={`hidden lg:table-cell ${cellPaddingClass} font-bold`}>
                  {canBulkApprove ? (
                    <button
                      type="button"
                      onClick={() => setIsBulkOpen(true)}
                      className="text-primary hover:text-primary/80"
                    >
                      Approval
                    </button>
                  ) : (
                    'Approval'
                  )}
                </TableHead>
                <TableHead className={`${postBidColumnClass} ${cellPaddingClass} font-bold`}>Post bid details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleData.map((tender) => {
                const approvalStatus = getApprovalStatus(tender.opportunityRefNo);
                const approvalState = getApprovalState(tender.opportunityRefNo);
                return (
                  <TableRow
                    key={tender.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => onSelectOpportunity?.(tender)}
                  >
                    <TableCell className={`${cellPaddingClass} max-w-[120px] truncate font-mono text-[10px] sm:text-[11px] font-bold text-blue-600 dark:text-blue-400`}>{tender.opportunityRefNo || '—'}</TableCell>
                    <TableCell className={`${cellPaddingClass} ${excelWrap ? 'max-w-[280px] sm:max-w-[360px]' : 'max-w-[180px] sm:max-w-[250px]'} min-w-0`}>
                      <div className="min-w-0 space-y-1">
                        <div className={excelWrap ? 'whitespace-normal break-words text-justify leading-5' : 'truncate'} title={tender.tenderName || ''}>
                          {tender.tenderName || <span className="text-muted-foreground text-xs">—</span>}
                        </div>
                        {getAdnocRftNo(tender) ? (
                          <div className="truncate font-mono text-[10px] sm:text-xs text-muted-foreground" title={getAdnocRftNo(tender)}>
                            ADNOC Ref: {getAdnocRftNo(tender)}
                          </div>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className={`hidden md:table-cell ${cellPaddingClass}`}>
                      <Badge className={`max-w-[8rem] truncate text-xs ${getTenderTypeBadge(tender.opportunityClassification)}`}>{tender.opportunityClassification || '—'}</Badge>
                    </TableCell>
                    <TableCell className={`${cellPaddingClass} max-w-[100px] sm:max-w-[140px] truncate font-semibold text-foreground`}>{tender.clientName || '—'}</TableCell>
                    <TableCell className={`hidden lg:table-cell ${cellPaddingClass}`}>
                      <Badge className={`max-w-[6rem] truncate text-xs font-mono ${getGroupBadge(tender.groupClassification)}`}>{tender.groupClassification || '—'}</Badge>
                    </TableCell>
                    <TableCell className={`hidden lg:table-cell ${cellPaddingClass} font-bold text-[10px] sm:text-[11px]`}>{getRfpReceivedDisplay(tender) || '—'}</TableCell>
                    <TableCell className={`hidden xl:table-cell ${cellPaddingClass} font-bold text-[10px] sm:text-[11px]`}>{getSubmissionDisplay(tender) || '—'}</TableCell>
                    <TableCell className={`hidden xl:table-cell ${cellPaddingClass}`}>{tender.internalLead || 'Unassigned'}</TableCell>
                    <TableCell className={`${cellPaddingClass} text-right font-mono`}>{tender.opportunityValue > 0 ? formatCurrency(tender.opportunityValue) : '—'}</TableCell>
                    <TableCell className={cellPaddingClass}>
                      <div className="space-y-1">
                        <Badge className={`max-w-[8rem] truncate ${getStatusBadgeClass(getMergedStatus(tender), tender)}`}>{getMergedStatus(tender) || '—'}</Badge>
                        {getMergedStatus(tender) === 'AWARDED' && tender.awardedDate ? (
                          <div className="truncate font-mono text-[10px] sm:text-xs text-muted-foreground" title={tender.awardedDate}>
                            Awarded Date: {tender.awardedDate}
                          </div>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className={`hidden md:table-cell ${cellPaddingClass}`} onClick={(e) => e.stopPropagation()}>
                      {tender.remarksReason || tender.tenderStatusRemark ? (
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-6 w-6">
                              <MessageSquare className="h-4 w-4 text-info" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-80">
                            <div className="space-y-3">
                              <div>
                                <p className="text-xs font-medium text-muted-foreground">Remarks/Reason</p>
                                <p className="text-sm whitespace-pre-wrap break-words text-justify">{tender.remarksReason || '—'}</p>
                              </div>
                              <div>
                                <p className="text-xs font-medium text-muted-foreground">Tender Status -</p>
                                <p className="text-sm whitespace-pre-wrap break-words text-justify">{tender.tenderStatusRemark || '—'}</p>
                              </div>
                            </div>
                          </PopoverContent>
                        </Popover>
                      ) : '—'}
                    </TableCell>
                    <TableCell className={`hidden lg:table-cell ${cellPaddingClass}`} onClick={(e) => e.stopPropagation()}>
                      <ApprovalCell
                        approvalStatus={approvalStatus}
                        approvalState={approvalState}
                        canProposalHeadApprove={canPerformAction('approvals_proposal_head')}
                        canSVPApprove={canSVPApprove(tender) && canPerformAction('approvals_svp')}
                        canRevert={canSingleRevert}
                        onApproveProposalHead={() => approveAsProposalHead(tender.opportunityRefNo)}
                        onApproveSVP={() => approveAsSVP(tender.opportunityRefNo, tender.groupClassification)}
                        onRevert={() => revertApproval(tender.opportunityRefNo)}
                      />
                    </TableCell>
                    <TableCell className={`${postBidColumnClass} ${cellPaddingClass} max-w-[220px]`} onClick={(e) => e.stopPropagation()}>
                      <PostBidDetailsCell
                        detailType={tender.postBidDetailType}
                        detailOther={tender.postBidDetailOther}
                        updatedBy={tender.postBidDetailUpdatedBy}
                        updatedAt={tender.postBidDetailUpdatedAt}
                        isApproved={approvalStatus === 'fully_approved'}
                        canEdit={postBidCanEdit}
                        isSaving={postBidSavingId === tender.id}
                        onSave={(detailType, otherText) => savePostBidDetails(tender, detailType, otherText)}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <div className="p-2 sm:p-3 text-xs sm:text-sm text-muted-foreground border-t bg-background">
          Showing by {sortBy === 'ref' ? `Avenir Ref (${refSortOrder.toUpperCase()})` : `RFP Received (${rfpSortOrder.toUpperCase()})`}: {visibleData.length} of {data.length} tenders
          {!showConvertedEoiRows && visibleData.length !== filteredData.length ? ` (${filteredData.length - visibleData.length} converted EOI row${filteredData.length - visibleData.length === 1 ? '' : 's'} hidden)` : ''}
          {' '} (scroll to view all)
        </div>
        <Dialog open={isBulkOpen} onOpenChange={setIsBulkOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Bulk Approve</DialogTitle>
              <DialogDescription>Apply approvals across multiple tenders based on filters.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {canBulkRevert && (
                <div className="space-y-2">
                  <Label>Action</Label>
                  <Select value={bulkMode} onValueChange={(value) => setBulkMode(value as 'approve' | 'revert')}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="approve">Approve</SelectItem>
                      <SelectItem value="revert">Revert to Pending</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              {isMaster && bulkMode === 'approve' && (
                <div className="space-y-2">
                  <Label>Approval Step</Label>
                  <Select value={bulkAction} onValueChange={(value) => setBulkAction(value as 'proposal_head' | 'svp')}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {canBulkProposalHead && <SelectItem value="proposal_head">Tender Manager Approval</SelectItem>}
                      {canBulkSVP && <SelectItem value="svp">SVP Approval</SelectItem>}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {!isMaster && canBulkProposalHead && bulkMode === 'approve' && (
                <div className="text-xs text-muted-foreground">Action: Tender Manager Approval</div>
              )}
              {!isMaster && canBulkSVP && !canBulkProposalHead && bulkMode === 'approve' && (
                <div className="text-xs text-muted-foreground">Action: SVP Approval</div>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Date From</Label>
                  <Input type="date" value={bulkFilters.dateFrom} onChange={(e) => setBulkFilters((prev) => ({ ...prev, dateFrom: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Date To</Label>
                  <Input type="date" value={bulkFilters.dateTo} onChange={(e) => setBulkFilters((prev) => ({ ...prev, dateTo: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Group</Label>
                  <Select value={bulkFilters.group || 'ALL'} onValueChange={(value) => setBulkFilters((prev) => ({ ...prev, group: value === 'ALL' ? '' : value }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All</SelectItem>
                      {filterOptions.groups.map((group) => (
                        <SelectItem key={group} value={group}>{group}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Lead</Label>
                  <Select value={bulkFilters.lead || 'ALL'} onValueChange={(value) => setBulkFilters((prev) => ({ ...prev, lead: value === 'ALL' ? '' : value }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All</SelectItem>
                      {filterOptions.leads.map((lead) => (
                        <SelectItem key={lead} value={lead}>{lead}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Client</Label>
                  <Select value={bulkFilters.client || 'ALL'} onValueChange={(value) => setBulkFilters((prev) => ({ ...prev, client: value === 'ALL' ? '' : value }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All</SelectItem>
                      {filterOptions.clients.map((client) => (
                        <SelectItem key={client} value={client}>{client}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Submitter</Label>
                  <Select value={bulkFilters.submitter || 'ALL'} onValueChange={(value) => setBulkFilters((prev) => ({ ...prev, submitter: value === 'ALL' ? '' : value }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All</SelectItem>
                      {filterOptions.submitters.map((submitter) => (
                        <SelectItem key={submitter} value={submitter}>{submitter}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setIsBulkOpen(false)}>Cancel</Button>
              <Button onClick={handleBulkApprove}>{bulkMode === 'revert' ? 'Revert' : 'Approve'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

interface ApprovalCellProps {
  approvalStatus: string;
  approvalState: { proposalHeadApproved: boolean; proposalHeadBy?: string | null; svpApproved: boolean; svpBy?: string | null };
  canProposalHeadApprove: boolean;
  canSVPApprove: boolean;
  canRevert: boolean;
  onApproveProposalHead: () => void;
  onApproveSVP: () => void;
  onRevert: () => void;
}

function ApprovalCell({ approvalStatus, canProposalHeadApprove, canSVPApprove, canRevert, onApproveProposalHead, onApproveSVP, onRevert }: ApprovalCellProps) {
  if (approvalStatus === 'fully_approved') {
    return (
      <div className="flex min-w-0 flex-wrap items-center gap-1">
        <Badge className="max-w-[9rem] truncate bg-success/20 text-success gap-1 text-xs">
          <CheckCircle className="h-3 w-3" />
          Fully Approved
        </Badge>
        {canRevert && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onRevert}>
                <RotateCcw className="h-3 w-3 text-muted-foreground hover:text-destructive" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Revert to Pending (Master only)</TooltipContent>
          </Tooltip>
        )}
      </div>
    );
  }

  if (approvalStatus === 'proposal_head_approved') {
    return (
      <div className="flex flex-col gap-1 min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-1">
          <Badge className="max-w-[6.5rem] truncate bg-info/20 text-info gap-1 text-xs">
            <CheckCircle className="h-3 w-3" />
            TM ✓
          </Badge>
          <ArrowRight className="h-3 w-3 text-muted-foreground" />
          {canSVPApprove ? (
            <Button size="sm" variant="outline" className="h-6 text-[11px] sm:text-xs px-2" onClick={onApproveSVP}>SVP Approve</Button>
          ) : (
            <Badge variant="secondary" className="max-w-[8rem] truncate gap-1 text-xs">
              <Clock className="h-3 w-3" />
              Awaiting SVP
            </Badge>
          )}
        </div>
        {canRevert && (
          <Button variant="ghost" size="sm" className="h-5 text-xs text-muted-foreground" onClick={onRevert}>
            <RotateCcw className="h-3 w-3 mr-1" /> Revert
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1">
      {canProposalHeadApprove ? (
        <Button size="sm" variant="outline" className="h-6 text-[11px] sm:text-xs px-2" onClick={onApproveProposalHead}>TM Approve</Button>
      ) : (
        <Badge variant="secondary" className="max-w-[8rem] truncate gap-1 text-xs">
          <Clock className="h-3 w-3" />
          Pending TM
        </Badge>
      )}
    </div>
  );
}

interface PostBidDetailsCellProps {
  detailType?: string;
  detailOther?: string;
  updatedBy?: string;
  updatedAt?: string | null;
  isApproved: boolean;
  canEdit: boolean;
  isSaving: boolean;
  onSave: (detailType: string, otherText?: string) => void;
}

function PostBidDetailsCell({
  detailType,
  detailOther,
  updatedBy,
  updatedAt,
  isApproved,
  canEdit,
  isSaving,
  onSave,
}: PostBidDetailsCellProps) {
  const normalizedType = String(detailType || '').trim().toUpperCase();
  const [draftType, setDraftType] = useState(normalizedType || '__none__');
  const [draftOther, setDraftOther] = useState(String(detailOther || ''));

  useEffect(() => {
    setDraftType(normalizedType || '__none__');
    setDraftOther(String(detailOther || ''));
  }, [normalizedType, detailOther]);

  const displayValue = getPostBidLabel(detailType, detailOther);

  if (!isApproved) {
    return <span className="text-xs text-muted-foreground">After approval</span>;
  }

  if (!canEdit) {
    return (
      <div className="space-y-1">
        {displayValue ? (
          <Badge className={`max-w-full truncate text-[11px] font-medium ${getPostBidBadgeClass(detailType)}`} title={displayValue}>
            {displayValue}
          </Badge>
        ) : (
          <div className="truncate text-xs font-medium">—</div>
        )}
        {updatedBy ? (
          <div className="truncate text-[10px] text-muted-foreground" title={updatedBy}>
            {updatedBy}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Select
        disabled={isSaving}
        value={draftType}
        onValueChange={(nextValue) => {
          setDraftType(nextValue);
          if (nextValue === '__none__') {
            setDraftOther('');
            onSave('', '');
            return;
          }
          if (nextValue !== POST_BID_OTHER) {
            setDraftOther('');
            onSave(nextValue, '');
          }
        }}
      >
        <SelectTrigger className="h-8 w-full text-xs">
          <SelectValue placeholder="Select detail" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">Not set</SelectItem>
          {POST_BID_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {draftType === POST_BID_OTHER && (
        <div className="space-y-2">
          <Input
            value={draftOther}
            onChange={(event) => setDraftOther(event.target.value)}
            placeholder="Enter other detail"
            className="h-8 text-xs"
          />
          <Button
            size="sm"
            className="h-7 w-full text-xs"
            disabled={isSaving || !draftOther.trim()}
            onClick={() => onSave(POST_BID_OTHER, draftOther.trim())}
          >
            Save other detail
          </Button>
        </div>
      )}
      {!draftType || draftType === '__none__' ? null : (
        <div className="space-y-1">
          {displayValue ? (
            <Badge className={`max-w-full truncate text-[11px] font-medium ${getPostBidBadgeClass(draftType)}`} title={displayValue}>
              {displayValue}
            </Badge>
          ) : null}
          {updatedAt ? (
            <div className="text-[10px] text-muted-foreground">
              {new Date(updatedAt).toLocaleDateString()}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
