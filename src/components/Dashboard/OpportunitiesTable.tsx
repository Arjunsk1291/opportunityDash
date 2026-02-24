import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertTriangle, Search, CheckCircle, Clock, RotateCcw, RefreshCw, MessageSquare, ArrowRight } from 'lucide-react';
import { Opportunity } from '@/data/opportunityData';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useApproval } from '@/contexts/ApprovalContext';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';

interface OpportunitiesTableProps {
  data: Opportunity[];
  onSelectOpportunity?: (opp: Opportunity) => void;
}

const AVENIR_STATUS_OPTIONS = ['ALL', 'AWARDED', 'WORKING', 'TO START', 'HOLD / CLOSED', 'REGRETTED', 'SUBMITTED', 'ONGOING', 'LOST'];

export function OpportunitiesTable({ data, onSelectOpportunity }: OpportunitiesTableProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const { formatCurrency } = useCurrency();
  const { getApprovalStatus, getApprovalState, approveAsProposalHead, approveAsSVP, revertApproval, refreshApprovals } = useApproval();
  const { isProposalHead, isSVP, isMaster, user } = useAuth();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshApprovals();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const getRfpReceivedDisplay = (tender: Opportunity) => {
    return tender.dateTenderReceived
      || (typeof tender.rawGraphData?.rfpReceivedDisplay === 'string' ? tender.rawGraphData.rfpReceivedDisplay : '')
      || '';
  };

  const getSubmissionDisplay = (tender: Opportunity) => {
    return tender.tenderSubmittedDate || tender.tenderPlannedSubmissionDate || '';
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
      tender.tenderResult,
      approvalSearchValue,
      tender.comments,
      rowSnapshot,
    ].map((value) => String(value ?? '').toLowerCase()).join(' ');
  };

  const filteredData = data
    .filter((tender) => {
      const searchLower = search.toLowerCase();
      const rfpReceivedDisplay = getRfpReceivedDisplay(tender).toLowerCase();
      const allSearchable = buildSearchableText(tender);

      const matchesSearch = !search || allSearchable.includes(searchLower) || rfpReceivedDisplay.includes(searchLower);
      const matchesStatus = statusFilter === 'ALL' || tender.avenirStatus?.toUpperCase() === statusFilter;

      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => {
      const aTime = new Date(a.syncedAt || a.updatedAt || a.createdAt || a.dateTenderReceived || 0).getTime();
      const bTime = new Date(b.syncedAt || b.updatedAt || b.createdAt || b.dateTenderReceived || 0).getTime();
      return bTime - aTime;
    });

  const getStatusBadge = (status: string) => {
    const upperStatus = status?.toUpperCase() || '';
    const variants: Record<string, string> = {
      'AWARDED': 'bg-success/20 text-success',
      'WORKING': 'bg-warning/20 text-warning',
      'TO START': 'bg-info/20 text-info',
      'SUBMITTED': 'bg-pending/20 text-pending',
      'ONGOING': 'bg-warning/20 text-warning',
      'HOLD / CLOSED': 'bg-muted text-muted-foreground',
      'REGRETTED': 'bg-muted text-muted-foreground',
    };
    return variants[upperStatus] || 'bg-muted text-muted-foreground';
  };

  const getTenderResultBadge = (result?: string) => {
    const upperResult = result?.toUpperCase() || '';
    const variants: Record<string, string> = {
      ONGOING: 'bg-warning/20 text-warning',
      LOST: 'bg-destructive/20 text-destructive',
      AWARDED: 'bg-success/20 text-success',
      UNKNOWN: 'bg-muted/50 text-muted-foreground',
    };
    return variants[upperResult] || 'bg-muted/50 text-muted-foreground';
  };



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
    if (isMaster) return true;
    if (!isSVP || !user?.assignedGroup) return false;
    return tender.groupClassification?.toUpperCase() === user.assignedGroup?.toUpperCase();
  };

  return (
    <Card className="flex-1">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Tenders</CardTitle>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 w-48 h-9" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36 h-9"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                {AVENIR_STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" onClick={handleRefresh} className="h-9 px-3">
                  <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Refresh approval status</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="max-h-[400px] overflow-auto scrollbar-thin">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky top-0 z-20 bg-background/95 backdrop-blur w-24">Ref No.</TableHead>
                <TableHead className="sticky top-0 z-20 bg-background/95 backdrop-blur min-w-[200px]">Tender Name</TableHead>
                <TableHead className="sticky top-0 z-20 bg-background/95 backdrop-blur">Tender Type</TableHead>
                <TableHead className="sticky top-0 z-20 bg-background/95 backdrop-blur">Client</TableHead>
                <TableHead className="sticky top-0 z-20 bg-background/95 backdrop-blur">Group</TableHead>
                <TableHead className="sticky top-0 z-20 bg-background/95 backdrop-blur font-bold">RFP Received</TableHead>
                <TableHead className="sticky top-0 z-20 bg-background/95 backdrop-blur font-bold">Submission</TableHead>
                <TableHead className="sticky top-0 z-20 bg-background/95 backdrop-blur">Lead</TableHead>
                <TableHead className="sticky top-0 z-20 bg-background/95 backdrop-blur text-right">Value</TableHead>
                <TableHead className="sticky top-0 z-20 bg-background/95 backdrop-blur">AVENIR STATUS</TableHead>
                <TableHead className="sticky top-0 z-20 bg-background/95 backdrop-blur max-w-[150px]">Remarks</TableHead>
                <TableHead className="sticky top-0 z-20 bg-background/95 backdrop-blur">RESULT</TableHead>
                <TableHead className="sticky top-0 z-20 bg-background/95 backdrop-blur w-[220px]">Approval</TableHead>
                <TableHead className="sticky top-0 z-20 bg-background/95 backdrop-blur w-16">Info</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredData.map((tender) => {
                const approvalStatus = getApprovalStatus(tender.opportunityRefNo);
                const approvalState = getApprovalState(tender.opportunityRefNo);
                return (
                  <TableRow
                    key={tender.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => onSelectOpportunity?.(tender)}
                  >
                    <TableCell className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400">{tender.opportunityRefNo || '—'}</TableCell>
                    <TableCell className="max-w-[250px]">
                      <div className="truncate" title={tender.tenderName || ''}>
                        {tender.tenderName || <span className="text-muted-foreground text-xs">—</span>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={`text-xs ${getTenderTypeBadge(tender.opportunityClassification)}`}>{tender.opportunityClassification || '—'}</Badge>
                    </TableCell>
                    <TableCell className="max-w-[120px] truncate font-semibold text-foreground">{tender.clientName || '—'}</TableCell>
                    <TableCell>
                      <Badge className={`text-xs font-mono ${getGroupBadge(tender.groupClassification)}`}>{tender.groupClassification || '—'}</Badge>
                    </TableCell>
                    <TableCell className="font-bold text-sm">{getRfpReceivedDisplay(tender) || '—'}</TableCell>
                    <TableCell className="font-bold text-sm">{getSubmissionDisplay(tender) || '—'}</TableCell>
                    <TableCell>{tender.internalLead || 'Unassigned'}</TableCell>
                    <TableCell className="text-right font-mono">{tender.opportunityValue > 0 ? formatCurrency(tender.opportunityValue) : '—'}</TableCell>
                    <TableCell>
                      <Badge className={getStatusBadge(tender.avenirStatus)}>{tender.avenirStatus || '—'}</Badge>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {tender.remarksReason ? (
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-6 w-6">
                              <MessageSquare className="h-4 w-4 text-info" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-80">
                            <p className="text-xs font-medium text-muted-foreground">Remarks/Reason</p>
                            <p className="text-sm">{tender.remarksReason}</p>
                          </PopoverContent>
                        </Popover>
                      ) : '—'}
                    </TableCell>
                    <TableCell>
                      {tender.tenderResult ? (
                        <Badge className={getTenderResultBadge(tender.tenderResult)}>{tender.tenderResult}</Badge>
                      ) : '—'}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <ApprovalCell
                        approvalStatus={approvalStatus}
                        approvalState={approvalState}
                        isProposalHead={isProposalHead}
                        canSVPApprove={canSVPApprove(tender)}
                        isMaster={isMaster}
                        onApproveProposalHead={() => approveAsProposalHead(tender.opportunityRefNo)}
                        onApproveSVP={() => approveAsSVP(tender.opportunityRefNo, tender.groupClassification)}
                        onRevert={() => revertApproval(tender.opportunityRefNo)}
                      />
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex gap-1">
                        {tender.comments && (
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-6 w-6">
                                <MessageSquare className="h-4 w-4 text-muted-foreground" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-80">
                              <p className="text-xs font-medium text-muted-foreground">Comments</p>
                              <p className="text-sm">{tender.comments}</p>
                            </PopoverContent>
                          </Popover>
                        )}
                        {tender.isAtRisk && (
                          <Tooltip>
                            <TooltipTrigger>
                              <AlertTriangle className="h-4 w-4 text-warning" />
                            </TooltipTrigger>
                            <TooltipContent>Potentially at risk opportunity</TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <div className="p-3 text-xs text-muted-foreground border-t">
          Showing latest first: {filteredData.length} of {data.length} tenders (scroll to view all)
        </div>
      </CardContent>
    </Card>
  );
}

interface ApprovalCellProps {
  approvalStatus: string;
  approvalState: { proposalHeadApproved: boolean; proposalHeadBy?: string | null; svpApproved: boolean; svpBy?: string | null };
  isProposalHead: boolean;
  canSVPApprove: boolean;
  isMaster: boolean;
  onApproveProposalHead: () => void;
  onApproveSVP: () => void;
  onRevert: () => void;
}

function ApprovalCell({ approvalStatus, isProposalHead, canSVPApprove, isMaster, onApproveProposalHead, onApproveSVP, onRevert }: ApprovalCellProps) {
  if (approvalStatus === 'fully_approved') {
    return (
      <div className="flex items-center gap-1">
        <Badge className="bg-success/20 text-success gap-1 text-xs">
          <CheckCircle className="h-3 w-3" />
          Fully Approved
        </Badge>
        {isMaster && (
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
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1">
          <Badge className="bg-info/20 text-info gap-1 text-xs">
            <CheckCircle className="h-3 w-3" />
            PH ✓
          </Badge>
          <ArrowRight className="h-3 w-3 text-muted-foreground" />
          {canSVPApprove ? (
            <Button size="sm" variant="outline" className="h-6 text-xs px-2" onClick={onApproveSVP}>SVP Approve</Button>
          ) : (
            <Badge variant="secondary" className="gap-1 text-xs">
              <Clock className="h-3 w-3" />
              Awaiting SVP
            </Badge>
          )}
        </div>
        {isMaster && (
          <Button variant="ghost" size="sm" className="h-5 text-xs text-muted-foreground" onClick={onRevert}>
            <RotateCcw className="h-3 w-3 mr-1" /> Revert
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      {isProposalHead ? (
        <Button size="sm" variant="outline" className="h-6 text-xs px-2" onClick={onApproveProposalHead}>PH Approve</Button>
      ) : (
        <Badge variant="secondary" className="gap-1 text-xs">
          <Clock className="h-3 w-3" />
          Pending PH
        </Badge>
      )}
    </div>
  );
}
