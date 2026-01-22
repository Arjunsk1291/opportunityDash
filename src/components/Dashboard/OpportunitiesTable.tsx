import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertTriangle, Search, CheckCircle, Clock, RotateCcw, RefreshCw } from 'lucide-react';
import { Opportunity } from '@/data/opportunityData';
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

  const filteredData = data.filter(opp => {
    const matchesSearch = !search || 
      opp.opportunityRefNo.toLowerCase().includes(search.toLowerCase()) ||
      opp.tenderName.toLowerCase().includes(search.toLowerCase()) ||
      opp.opportunityClassification.toLowerCase().includes(search.toLowerCase()) ||
      opp.clientName.toLowerCase().includes(search.toLowerCase()) ||
      (opp.dateTenderReceived?.toLowerCase().includes(search.toLowerCase()) || false) ||
      (opp.internalLead?.toLowerCase().includes(search.toLowerCase()) || false) ||
      opp.opportunityValue.toString().includes(search);
    
    return matchesSearch;
  });

  const getStatusBadgeColor = (status: string) => {
    const statusUpper = status.toUpperCase();
    if (statusUpper === 'AWARDED') return 'bg-success/20 text-success';
    if (statusUpper === 'LOST') return 'bg-destructive/20 text-destructive';
    if (statusUpper === 'REGRETTED') return 'bg-muted text-muted-foreground';
    if (statusUpper === 'WORKING') return 'bg-warning/20 text-warning';
    if (statusUpper === 'SUBMITTED') return 'bg-pending/20 text-pending';
    if (statusUpper === 'TO START') return 'bg-info/20 text-info';
    if (statusUpper === 'ONGOING') return 'bg-cyan-600/20 text-cyan-600';
    return 'bg-muted text-muted-foreground';
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
                  placeholder="Search..." 
                  value={search} 
                  onChange={(e) => setSearch(e.target.value)} 
                  className="pl-8 w-56 h-9" 
                />
              </div>
              
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleRefresh}
                    disabled={isRefreshing || isForceSyncing}
                    className="h-9 px-3"
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
                  >
                    <RefreshCw className={`h-4 w-4 ${isForceSyncing ? 'animate-spin' : ''}`} />
                    Force Sync
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Sync from Google Sheets</TooltipContent>
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
                <TableHead className="w-20">Ref No.</TableHead>
                <TableHead className="w-40">Type</TableHead>
                <TableHead className="w-32">Client</TableHead>
                <TableHead className="w-24">RFP Received</TableHead>
                <TableHead className="w-24">Lead</TableHead>
                <TableHead className="text-right w-28">Value</TableHead>
                <TableHead className="w-32">AVENIR STATUS</TableHead>
                <TableHead className="w-32">TENDER RESULT</TableHead>
                <TableHead className="w-28">Approval</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredData.slice(0, 50).map((opp) => {
                const approvalStatus = getApprovalStatus(opp.opportunityRefNo);
                return (
                  <TableRow key={opp.id} className="cursor-pointer hover:bg-muted/50" onClick={() => onSelectOpportunity(opp)}>
                    <TableCell className="font-mono text-xs font-bold">{opp.opportunityRefNo}</TableCell>
                    <TableCell className="text-sm">{opp.opportunityClassification || '—'}</TableCell>
                    <TableCell className="text-sm truncate" title={opp.clientName}>{opp.clientName}</TableCell>
                    <TableCell className="text-sm">{opp.dateTenderReceived || '—'}</TableCell>
                    <TableCell className="text-sm">{opp.internalLead || '—'}</TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      AED {opp.opportunityValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </TableCell>
                    <TableCell>
                      <Badge className={getStatusBadgeColor(opp.canonicalStage)} variant="secondary" className="text-xs">
                        {opp.canonicalStage || '—'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{opp.awardStatus || '—'}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {approvalStatus === 'approved' ? (
                        <div className="flex items-center gap-1">
                          <Badge className="bg-success/20 text-success gap-1 text-xs">
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
                              <TooltipContent>Revert to Pending</TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      ) : isMaster || isAdmin ? (
                        <Select
                          value={approvalStatus}
                          onValueChange={(value) => handleApprovalChange(opp.opportunityRefNo, value)}
                        >
                          <SelectTrigger className="h-7 w-[90px] text-xs">
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
                        <Badge variant="secondary" className="gap-1 text-xs">
                          <Clock className="h-3 w-3" />
                          Pending
                        </Badge>
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
