import { useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search, ChevronLeft, ChevronRight, CheckCircle, XCircle, Clock } from 'lucide-react';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useApproval } from '@/contexts/ApprovalContext';

interface Opportunity {
  id: string;
  opportunityRefNo: string;
  tenderName: string;
  clientName: string;
  canonicalStage: string;
  internalLead: string;
  opportunityValue: number;
  opportunityValue_imputed: boolean;
  probability: number;
  expectedValue: number;
  agedDays: number;
  isAtRisk: boolean;
}

interface OpportunitiesTableProps {
  data: Opportunity[];
  onSelectOpportunity: (opp: Opportunity) => void;
}

export function OpportunitiesTable({ data, onSelectOpportunity }: OpportunitiesTableProps) {
  const { formatCurrency } = useCurrency();
  const { getApprovalStatus, updateApprovalStatus } = useApproval();
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const filteredData = data.filter(opp =>
    opp.tenderName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    opp.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    opp.opportunityRefNo.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedData = filteredData.slice(startIndex, startIndex + itemsPerPage);

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      'Pre-bid': 'bg-blue-100 text-blue-800',
      'In Progress': 'bg-yellow-100 text-yellow-800',
      'Submitted': 'bg-purple-100 text-purple-800',
      'Awarded': 'bg-green-100 text-green-800',
      'Lost/Regretted': 'bg-red-100 text-red-800',
      'On Hold/Paused': 'bg-gray-100 text-gray-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const getApprovalIcon = (status: string) => {
    switch (status) {
      case 'approved':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'rejected':
        return <XCircle className="h-4 w-4 text-red-600" />;
      case 'pending':
        return <Clock className="h-4 w-4 text-yellow-600" />;
      default:
        return <Clock className="h-4 w-4 text-gray-400" />;
    }
  };

  const getApprovalBadgeColor = (status: string) => {
    switch (status) {
      case 'approved':
        return 'bg-green-100 text-green-800';
      case 'rejected':
        return 'bg-red-100 text-red-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>All Opportunities ({filteredData.length})</CardTitle>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search opportunities..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="pl-8 w-64"
              />
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ref No</TableHead>
                <TableHead>Tender Name</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Approval</TableHead>
                <TableHead>Lead</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead className="text-right">Probability</TableHead>
                <TableHead className="text-right">Expected Value</TableHead>
                <TableHead className="text-right">Days Aging</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-muted-foreground">
                    No opportunities found
                  </TableCell>
                </TableRow>
              ) : (
                paginatedData.map((opp) => {
                  const approvalStatus = getApprovalStatus(opp.id);
                  
                  return (
                    <TableRow
                      key={opp.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => onSelectOpportunity(opp)}
                    >
                      <TableCell className="font-medium">{opp.opportunityRefNo}</TableCell>
                      <TableCell className="max-w-xs truncate">{opp.tenderName}</TableCell>
                      <TableCell>{opp.clientName}</TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(opp.canonicalStage)} variant="secondary">
                          {opp.canonicalStage}
                        </Badge>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Select
                          value={approvalStatus}
                          onValueChange={(value) => updateApprovalStatus(opp.id, value as any)}
                        >
                          <SelectTrigger className="w-32">
                            <div className="flex items-center gap-2">
                              {getApprovalIcon(approvalStatus)}
                              <SelectValue />
                            </div>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending">
                              <div className="flex items-center gap-2">
                                <Clock className="h-4 w-4 text-yellow-600" />
                                Pending
                              </div>
                            </SelectItem>
                            <SelectItem value="approved">
                              <div className="flex items-center gap-2">
                                <CheckCircle className="h-4 w-4 text-green-600" />
                                Approved
                              </div>
                            </SelectItem>
                            <SelectItem value="rejected">
                              <div className="flex items-center gap-2">
                                <XCircle className="h-4 w-4 text-red-600" />
                                Rejected
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>{opp.internalLead || '-'}</TableCell>
                      <TableCell className={`text-right ${opp.opportunityValue_imputed ? 'text-blue-600 font-semibold' : ''}`}>
                        {formatCurrency(opp.opportunityValue)}
                        {opp.opportunityValue_imputed && (
                          <span className="ml-1 text-xs">(dummy)</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">{opp.probability}%</TableCell>
                      <TableCell className={`text-right ${opp.opportunityValue_imputed ? 'text-blue-600' : ''}`}>
                        {formatCurrency(opp.expectedValue)}
                      </TableCell>
                      <TableCell className="text-right">
                        {opp.isAtRisk && <Badge variant="destructive" className="mr-2">At Risk</Badge>}
                        {opp.agedDays} days
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <p className="text-sm text-muted-foreground">
              Showing {startIndex + 1} to {Math.min(startIndex + itemsPerPage, filteredData.length)} of {filteredData.length} opportunities
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <span className="text-sm">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
