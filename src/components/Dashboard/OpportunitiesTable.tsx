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

interface OpportunitiesTableProps {
  data: Opportunity[];
  onSelectOpportunity?: (opp: Opportunity) => void;
}

const AVENIR_STATUS_OPTIONS = ['ALL', 'AWARDED', 'WORKING', 'TO START', 'HOLD / CLOSED', 'REGRETTED', 'SUBMITTED', 'ONGOING'];

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

  const filteredData = data.filter((tender) => {
    const searchLower = search.toLowerCase();
    const rfpReceivedDisplay = getRfpReceivedDisplay(tender).toLowerCase();
    const approvalSearchValue = getApprovalStatus(tender.opportunityRefNo).toLowerCase();
    const rowSnapshot = tender.rawGraphData?.rowSnapshot && typeof tender.rawGraphData.rowSnapshot === 'object'
      ? Object.values(tender.rawGraphData.rowSnapshot).map((value) => String(value ?? '')).join(' ').toLowerCase()
      : '';
    const allSearchable = [
      tender.opportunityRefNo,
      tender.tenderName,
      tender.opportunityClassification,
      tender.clientName,
      tender.groupClassification,
      getRfpReceivedDisplay(tender),
      tender.internalLead,
      tender.opportunityValue,
      tender.avenirStatus,
      tender.remarksReason,
      tender.tenderResult,
      approvalSearchValue,
      tender.comments,
      rowSnapshot,
    ].map((value) => String(value ?? '').toLowerCase()).join(' ');

    const matchesSearch = !search || allSearchable.includes(searchLower) || rfpReceivedDisplay.includes(searchLower);

    const matchesStatus = statusFilter === 'ALL'
      || tender.avenirStatus?.toUpperCase() === statusFilter;

    return matchesSearch && matchesStatus;
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

  const getTenderResultBadge = (result: string) => {
  const upperResult = result?.toUpperCase() || '';
  const variants: Record<string, string> = {
    'AWARDED': 'bg-success/20 text-success',
    'LOST': 'bg-destructive/20 text-destructive',
    'ONGOING': 'bg-warning/20 text-warning',
    'UNKNOWN': 'bg-muted/50 text-muted-foreground',
  };
  return variants[upperResult] || 'bg-muted/50 text-muted-foreground';
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
            <TableHeader className="sticky top-0 bg-card z-10">
              <TableRow>
                <TableHead className="w-24">Ref No.</TableHead>
                <TableHead className="min-w-[200px]">Tender Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Group</TableHead>
                <TableHead className="font-bold">RFP Received</TableHead>
                <TableHead>Lead</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead>AVENIR STATUS</TableHead>
                <TableHead className="max-w-[150px]">Remarks/Reason</TableHead>
                <TableHead>TENDER RESULT</TableHead>
                <TableHead className="w-[220px]">Approval</TableHead>
                <TableHead className="w-16">Comments</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredData.slice(0, 50).map((tender) => {
                const approvalStatus = getApprovalStatus(tender.opportunityRefNo);
                const approvalState = getApprovalState(tender.opportunityRefNo);
                return (
                  <TableRow
                    key={tender.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => onSelectOpportunity?.(tender)}
                  >
                    <TableCell className="font-mono text-xs">{tender.opportunityRefNo || '—'}</TableCell>
                    <TableCell className="max-w-[250px]">
                      <div className="truncate" title={tender.tenderName || ''}>
                        {tender.tenderName || <span className="text-muted-foreground text-xs">—</span>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{tender.opportunityClassification || '—'}</Badge>
                    </TableCell>
                    <TableCell className="max-w-[120px] truncate">{tender.clientName || '—'}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs font-mono">{tender.groupClassification || '—'}</Badge>
                    </TableCell>
                    <TableCell className="font-bold text-sm">{getRfpReceivedDisplay(tender) || <span className="text-muted-foreground font-normal">—</span>}</TableCell>
                    <TableCell>{tender.internalLead || <span className="text-muted-foreground text-xs">Unassigned</span>}</TableCell>
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
                            <div className="space-y-2">
                              <div>
                                <p className="text-xs font-medium text-muted-foreground">Remarks/Reason</p>
                                <p className="text-sm">{tender.remarksReason}</p>
                              </div>
                            </div>
                          </PopoverContent>
                        </Popover>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {tender.tenderResult ? (
                        <Badge className={getTenderResultBadge(tender.tenderResult)}>{tender.tenderResult}</Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
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
                      {tender.comments && (
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-6 w-6">
                              <MessageSquare className="h-4 w-4 text-muted-foreground" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-80">
                            <div className="space-y-2">
                              <div>
                                <p className="text-xs font-medium text-muted-foreground">Comments</p>
                                <p className="text-sm">{tender.comments}</p>
                              </div>
                            </div>
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
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <div className="p-3 text-xs text-muted-foreground border-t">
          Showing {Math.min(filteredData.length, 50)} of {filteredData.length} tenders
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
