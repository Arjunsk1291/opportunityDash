import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertTriangle, Info, Search, CheckCircle, Clock } from 'lucide-react';
import { Opportunity, STAGE_ORDER } from '@/data/opportunityData';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useApproval } from '@/contexts/ApprovalContext';
import { useAuth } from '@/contexts/AuthContext';

interface OpportunitiesTableProps {
  data: Opportunity[];
  onSelectOpportunity: (opp: Opportunity) => void;
}

export function OpportunitiesTable({ data, onSelectOpportunity }: OpportunitiesTableProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [groupFilter, setGroupFilter] = useState<string>('all');
  const { formatCurrency } = useCurrency();
  const { getApprovalStatus, approveOpportunity } = useApproval();
  const { isAdmin } = useAuth();

  const filteredData = data.filter(opp => {
    const matchesSearch = !search || 
      opp.tenderName.toLowerCase().includes(search.toLowerCase()) ||
      opp.clientName.toLowerCase().includes(search.toLowerCase()) ||
      opp.opportunityRefNo.toLowerCase().includes(search.toLowerCase());
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
      'Lost/Regretted': 'bg-destructive/20 text-destructive',
      'On Hold/Paused': 'bg-muted text-muted-foreground',
    };
    return variants[stage] || 'bg-muted text-muted-foreground';
  };

  const handleApprove = (e: React.MouseEvent, oppId: string) => {
    e.stopPropagation();
    approveOpportunity(oppId);
  };

  return (
    <Card className="flex-1">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Opportunities</CardTitle>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 w-48 h-9" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-32 h-9"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                {STAGE_ORDER.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                <SelectItem value="Lost/Regretted">Lost</SelectItem>
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
                <TableHead>Client</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="font-bold">RFP Received</TableHead>
                <TableHead>Lead</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead className="text-right">Prob.</TableHead>
                <TableHead className="text-right">Expected</TableHead>
                <TableHead>Approval</TableHead>
                <TableHead className="w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredData.slice(0, 50).map((opp) => {
                const approvalStatus = getApprovalStatus(opp.id);
                return (
                  <TableRow key={opp.id} className="cursor-pointer hover:bg-muted/50" onClick={() => onSelectOpportunity(opp)}>
                    <TableCell className="font-mono text-xs">{opp.opportunityRefNo}</TableCell>
                    <TableCell className="max-w-[200px]">
                      <span className="text-primary hover:underline font-medium truncate block" title={opp.tenderName}>
                        {opp.tenderName}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-[120px] truncate">{opp.clientName}</TableCell>
                    <TableCell><Badge className={getStatusBadge(opp.canonicalStage)}>{opp.canonicalStage}</Badge></TableCell>
                    <TableCell className="font-bold text-sm">
                      {opp.dateTenderReceived || <span className="text-muted-foreground font-normal">—</span>}
                    </TableCell>
                    <TableCell>{opp.internalLead || <span className="text-muted-foreground text-xs">Unassigned</span>}</TableCell>
                    <TableCell className="text-right font-mono">
                      <div className="flex items-center justify-end gap-1">
                        {formatCurrency(opp.opportunityValue)}
                        {opp.opportunityValue_imputed && (
                          <Tooltip>
                            <TooltipTrigger><Info className="h-3 w-3 text-warning" /></TooltipTrigger>
                            <TooltipContent className="max-w-xs"><p className="text-xs">{opp.opportunityValue_imputation_reason}</p></TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{opp.probability}%</TableCell>
                    <TableCell className="text-right font-mono text-success">{formatCurrency(opp.expectedValue)}</TableCell>
                    <TableCell>
                      {approvalStatus === 'approved' ? (
                        <Badge className="bg-success/20 text-success gap-1">
                          <CheckCircle className="h-3 w-3" />
                          Approved
                        </Badge>
                      ) : isAdmin ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1"
                          onClick={(e) => handleApprove(e, opp.id)}
                        >
                          <Clock className="h-3 w-3" />
                          Pending
                        </Button>
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
          Showing {Math.min(filteredData.length, 50)} of {filteredData.length} opportunities
        </div>
      </CardContent>
    </Card>
  );
}
