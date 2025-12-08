import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Search, FileSpreadsheet, Calendar, Clock, AlertTriangle, CheckCircle } from 'lucide-react';
import { opportunities } from '@/data/opportunityData';
import { cn } from '@/lib/utils';

const Tenders = () => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const tenderData = useMemo(() => {
    return opportunities
      .filter(o => o.tenderNo)
      .map(o => ({
        tenderNo: o.tenderNo,
        tenderName: o.tenderName,
        client: o.clientName,
        status: o.canonicalStage,
        dateReceived: o.dateTenderReceived,
        plannedSubmission: o.tenderPlannedSubmissionDate,
        submittedDate: o.tenderSubmittedDate,
        daysToSubmission: o.daysToPlannedSubmission,
        willMissDeadline: o.willMissDeadline,
        value: o.opportunityValue,
        lead: o.internalLead,
      }));
  }, []);

  const filteredData = useMemo(() => {
    let data = tenderData;
    
    if (search) {
      const searchLower = search.toLowerCase();
      data = data.filter(t => 
        t.tenderName.toLowerCase().includes(searchLower) ||
        t.tenderNo.toLowerCase().includes(searchLower) ||
        t.client.toLowerCase().includes(searchLower)
      );
    }
    
    if (statusFilter) {
      data = data.filter(t => t.status === statusFilter);
    }
    
    return data;
  }, [tenderData, search, statusFilter]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    tenderData.forEach(t => {
      counts[t.status] = (counts[t.status] || 0) + 1;
    });
    return counts;
  }, [tenderData]);

  const upcomingDeadlines = useMemo(() => {
    return tenderData
      .filter(t => t.daysToSubmission > 0 && t.daysToSubmission <= 14 && !t.submittedDate)
      .sort((a, b) => a.daysToSubmission - b.daysToSubmission)
      .slice(0, 5);
  }, [tenderData]);

  const formatCurrency = (value: number) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
    return `$${value}`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FileSpreadsheet className="h-6 w-6 text-primary" />
          Tenders
        </h1>
        <p className="text-muted-foreground">{filteredData.length} tenders in your pipeline</p>
      </div>

      {/* Status Pills */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant={statusFilter === null ? "default" : "outline"}
          size="sm"
          onClick={() => setStatusFilter(null)}
        >
          All ({tenderData.length})
        </Button>
        {Object.entries(statusCounts).map(([status, count]) => (
          <Button
            key={status}
            variant={statusFilter === status ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter(status)}
          >
            {status} ({count})
          </Button>
        ))}
      </div>

      {/* Upcoming Deadlines Alert */}
      {upcomingDeadlines.length > 0 && (
        <Card className="border-warning/50 bg-warning/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-warning">
              <Clock className="h-4 w-4" />
              Upcoming Submission Deadlines
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {upcomingDeadlines.map((t) => (
                <Badge
                  key={t.tenderNo}
                  variant="outline"
                  className={cn(
                    "py-2 px-3",
                    t.daysToSubmission <= 7 ? "border-destructive/50 bg-destructive/10" : "border-warning/50"
                  )}
                >
                  <div className="text-left">
                    <p className="font-medium text-xs">{t.tenderNo}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.daysToSubmission} days left
                    </p>
                  </div>
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search tenders..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Tender Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tender No.</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Received</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead className="text-right">Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredData.map((tender) => (
                <TableRow key={tender.tenderNo} className="hover:bg-muted/50">
                  <TableCell className="font-mono text-sm">{tender.tenderNo}</TableCell>
                  <TableCell className="max-w-[200px] truncate">{tender.tenderName}</TableCell>
                  <TableCell>{tender.client}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        tender.status === 'Awarded' ? 'default' :
                        tender.status === 'Lost/Regretted' ? 'destructive' :
                        'secondary'
                      }
                    >
                      {tender.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {tender.dateReceived || '-'}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <span className="text-sm">{tender.plannedSubmission || '-'}</span>
                      {tender.willMissDeadline && (
                        <AlertTriangle className="h-3 w-3 text-destructive" />
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {tender.submittedDate ? (
                      <div className="flex items-center gap-1 text-success">
                        <CheckCircle className="h-3 w-3" />
                        <span className="text-sm">{tender.submittedDate}</span>
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(tender.value)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default Tenders;
