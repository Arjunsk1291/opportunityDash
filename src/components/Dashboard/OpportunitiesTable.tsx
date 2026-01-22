import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertTriangle, Info, Search, CheckCircle, Clock, RotateCcw, RefreshCw } from 'lucide-react';
import { Opportunity, STAGE_ORDER } from '@/data/opportunityData';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useApproval } from '@/contexts/ApprovalContext';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';

const API_URL = import.meta.env.VITE_API_URL || '/api';

interface OpportunitiesTableProps {
  data: Opportunity[];
  onSelectOpportunity: (opp: Opportunity) => void;
}

export function OpportunitiesTable({ data, onSelectOpportunity }: OpportunitiesTableProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [groupFilter, setGroupFilter] = useState<string>('all');
  const { formatCurrency } = useCurrency();
  const { getApprovalStatus, approveOpportunity, revertApproval, refreshApprovals } = useApproval();
  const { refreshData } = useData();
  const { isAdmin, isMaster, user } = useAuth();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isForceSyncing, setIsForceSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleRefresh = () => {
    setIsRefreshing(true);
    refreshApprovals();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const handleForceSync = async () => {
    setIsForceSyncing(true);
    setSyncMessage(null);
    
    try {
      console.log('🔄 FORCE SYNC: Starting manual sync from Google Sheets');
      
      const response = await fetch(API_URL + '/opportunities/sync-sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Sync failed');
      }

      const data = await response.json();
      console.log('✅ FORCE SYNC: Success - ' + data.syncedCount + ' opportunities');
      
      refreshApprovals();
      await refreshData();
      
      setSyncMessage({
        type: 'success',
        text: '✅ Force synced ' + data.syncedCount + ' opportunities from Google Sheets',
      });

      setTimeout(() => setSyncMessage(null), 5000);
    } catch (error) {
      console.error('❌ FORCE SYNC: Error -', error);
      setSyncMessage({
        type: 'error',
        text: '❌ Force sync failed: ' + (error as Error).message,
      });
      
      setTimeout(() => setSyncMessage(null), 5000);
    } finally {
      setIsForceSyncing(false);
    }
  };

  const getTenderType = (opp: Opportunity): string => {
    const classification = opp.opportunityClassification?.toLowerCase() || '';
    if (classification.includes('eoi')) return 'EOI';
    if (classification.includes('tender')) return 'Tender';
    return opp.opportunityClassification || '—';
  };

  const getBidNoBid = (opp: Opportunity): 'Bid' | 'No Bid' | 'Pending' => {
    if (opp.qualificationStatus?.toLowerCase().includes('qualified')) return 'Bid';
    if (opp.qualificationStatus?.toLowerCase().includes('not qualified')) return 'No Bid';
    if (opp.canonicalStage === 'Lost/Regretted' || opp.canonicalStage === 'On Hold/Paused') return 'No Bid';
    if (opp.canonicalStage === 'Awarded' || opp.canonicalStage === 'Submitted') return 'Bid';
    return 'Pending';
  };

  const filteredData = data.filter(opp => {
    const matchesSearch = !search || 
      opp.opportunityRefNo.toLowerCase().includes(search.toLowerCase()) ||
      opp.tenderName.toLowerCase().includes(search.toLowerCase()) ||
      getTenderType(opp).toLowerCase().includes(search.toLowerCase()) ||
      opp.clientName.toLowerCase().includes(search.toLowerCase()) ||
      opp.canonicalStage.toLowerCase().includes(search.toLowerCase()) ||
      (opp.dateTenderReceived?.toLowerCase().includes(search.toLowerCase()) || false) ||
      (opp.internalLead?.toLowerCase().includes(search.toLowerCase()) || false) ||
      opp.opportunityValue.toString().includes(search) ||
      getBidNoBid(opp).toLowerCase().includes(search.toLowerCase()) ||
      (opp.groupClassification?.toLowerCase().includes(search.toLowerCase()) || false);
    
    const matchesStatus = statusFilter === 'all' || opp.canonicalStage === statusFilter;
    const matchesGroup = groupFilter === 'all' || opp.groupClassification === groupFilter;
    
    return matchesSearch && matchesStatus && matchesGroup;
  });

  const getStatusBadge = (stage: string) => {
    const variants: Record<string, string> = {
      'Pre-bid': 'bg-info/20 text-info',
      'In Progress': 'bg-warning/20 text-warning',
      'Submitted': 'bg-pending/20 text-pending',
      'Awarded': 'bg-success/20 text-success',
      'Lost': 'bg-destructive/20 text-destructive',
      'Regretted': 'bg-muted text-muted-foreground',
      'Lost/Regretted': 'bg-destructive/20 text-destructive',
      'On Hold/Paused': 'bg-muted text-muted-foreground',
    };
    return variants[stage] || 'bg-muted text-muted-foreground';
  };

  const handleApprovalChange = (oppId: string, value: string) => {
    if (!user) return;
    if (value === 'approved') {
      approveOpportunity(oppId, user.email, user.role);
    }
  };

  const handleRevertApproval = (oppId: string) => {
    if (!user || !isMaster) return;
    revertApproval(oppId, user.email, user.role);
  };

  return (
    <Card className="flex-1">
      <CardHeader className="pb-3">
        <div className="space-y-3">
          {syncMessage && (
            <Alert variant={syncMessage.type === 'error' ? 'destructive' : 'default'}>
              <AlertDescription>{syncMessage.text}</AlertDescription>
            </Alert>
          )}

          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Tenders</CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Search all columns..." 
                  value={search} 
                  onChange={(e) => setSearch(e.target.value)} 
                  className="pl-8 w-56 h-9" 
                  title="Search: Ref No, Tender Name, Type, Client, Status, Date, Lead, Value, Bid/No Bid, Group"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-32 h-9"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  {STAGE_ORDER.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  <SelectItem value="Lost">Lost</SelectItem>
                  <SelectItem value="Regretted">Regretted</SelectItem>
                  <SelectItem value="On Hold/Paused">On Hold</SelectItem>
                </SelectContent>
              </Select>
              <Select value={groupFilter} onValueChange={setGroupFilter}>
                <SelectTrigger className="w-24 h-9"><SelectValue placeholder="Group" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="GES">GES</SelectItem>
                  <SelectItem value="GDS">GDS</SelectItem>
                  <SelectItem value="GTN">GTN</SelectItem>
                  <SelectItem value="GTS">GTS</SelectItem>
                </SelectContent>
              </Select>
              
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleRefresh}
                    disabled={isRefreshing || isForceSyncing}
                    className="h-9 px-3"
                    title="Refresh approval status across users"
                  >
                    <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Refresh approval status</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="default" 
                    size="sm" 
                    onClick={handleForceSync}
                    disabled={isForceSyncing || isRefreshing}
                    className="h-9 px-3 gap-2"
                    title="Force sync from Google Sheets (pulls latest data)"
                  >
                    <RefreshCw className={`h-4 w-4 ${isForceSyncing ? 'animate-spin' : ''}`} />
                    Force Sync
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Force sync from Google Sheets + refresh approvals</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div className="max-h-[400px] overflow-auto scrollbar-thin">
          <Table>
            <TableHeader className="sticky top-0 bg-card z-10">
              <TableRow>
                <TableHead className="w-24">Ref No.</TableHead>
                <TableHead>Tender Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="font-bold">RFP Received</TableHead>
                <TableHead>Lead</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead>Bid/No Bid</TableHead>
                <TableHead>Approval</TableHead>
                <TableHead className="w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredData.slice(0, 50).map((opp) => {
                const approvalStatus = getApprovalStatus(opp.opportunityRefNo);
                const bidNoBid = getBidNoBid(opp);
                return (
                  <TableRow key={opp.id} className="cursor-pointer hover:bg-muted/50" onClick={() => onSelectOpportunity(opp)}>
                    <TableCell className="font-mono text-xs">{opp.opportunityRefNo}</TableCell>
                    <TableCell className="max-w-[200px]">
                      <span className="text-primary hover:underline font-medium truncate block" title={opp.tenderName}>
                        {opp.tenderName}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={getTenderType(opp) === 'EOI' ? 'outline' : 'secondary'} className="text-xs">
                        {getTenderType(opp)}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[120px] truncate">{opp.clientName}</TableCell>
                    <TableCell><Badge className={getStatusBadge(opp.canonicalStage)}>{opp.canonicalStage}</Badge></TableCell>
                    <TableCell className="font-bold text-sm">
                      {opp.dateTenderReceived || <span className="text-muted-foreground font-normal">—</span>}
                    </TableCell>
                    <TableCell>{opp.internalLead || <span className="text-muted-foreground text-xs">Unassigned</span>}</TableCell>
                    <TableCell className="text-right font-mono">
                      <div className="flex items-center justify-end gap-1">
                        AED {opp.opportunityValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        {opp.opportunityValue_imputed && (
                          <Tooltip>
                            <TooltipTrigger><Info className="h-3 w-3 text-warning" /></TooltipTrigger>
                            <TooltipContent className="max-w-xs"><p className="text-xs">{opp.opportunityValue_imputation_reason}</p></TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant={bidNoBid === 'Bid' ? 'default' : bidNoBid === 'No Bid' ? 'destructive' : 'secondary'}
                        className="text-xs"
                      >
                        {bidNoBid}
                      </Badge>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {approvalStatus === 'approved' ? (
                        <div className="flex items-center gap-1">
                          <Badge className="bg-success/20 text-success gap-1">
                            <CheckCircle className="h-3 w-3" />
                            Approved
                          </Badge>
                          {isMaster && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-6 w-6"
                                  onClick={() => handleRevertApproval(opp.opportunityRefNo)}
                                >
                                  <RotateCcw className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Revert to Pending (Master only)</TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      ) : isMaster ? (
                        <Select
                          value={approvalStatus}
                          onValueChange={(value) => handleApprovalChange(opp.opportunityRefNo, value)}
                        >
                          <SelectTrigger className="h-7 w-[100px] text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending">
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                Pending
                              </span>
                            </SelectItem>
                            <SelectItem value="approved">
                              <span className="flex items-center gap-1">
                                <CheckCircle className="h-3 w-3" />
                                Approved
                              </span>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      ) : isAdmin ? (
                        <Select
                          value={approvalStatus}
                          onValueChange={(value) => handleApprovalChange(opp.opportunityRefNo, value)}
                        >
                          <SelectTrigger className="h-7 w-[100px] text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending">
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                Pending
                              </span>
                            </SelectItem>
                            <SelectItem value="approved">
                              <span className="flex items-center gap-1">
                                <CheckCircle className="h-3 w-3" />
                                Approved
                              </span>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge variant="secondary" className="gap-1">
                          <Clock className="h-3 w-3" />
                          Pending
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {opp.isAtRisk && <AlertTriangle className="h-4 w-4 text-warning" />}
                        {opp.willMissDeadline && <AlertTriangle className="h-4 w-4 text-destructive" />}
                      </div>
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
