import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, Clock } from 'lucide-react';
import { useApproval } from '@/contexts/ApprovalContext';
import { Opportunity } from '@/data/opportunityData';

interface ApprovalStatsWidgetProps {
  data: Opportunity[];
}

export function ApprovalStatsWidget({ data }: ApprovalStatsWidgetProps) {
  const { getApprovalStatus } = useApproval();

  // ✅ UPDATED: Count from filteredData using approval context
  const approvedCount = data.filter(opp => 
    getApprovalStatus(opp.opportunityRefNo) === 'approved'
  ).length;

  const pendingCount = data.filter(opp => 
    getApprovalStatus(opp.opportunityRefNo) === 'pending'
  ).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-primary" />
          Approval Status
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between p-3 bg-success/10 rounded-lg">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-success" />
            <span className="text-sm">Approved</span>
          </div>
          <Badge className="bg-success/20 text-success">{approvedCount}</Badge>
        </div>
        <div className="flex items-center justify-between p-3 bg-warning/10 rounded-lg">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-warning" />
            <span className="text-sm">Pending</span>
          </div>
          <Badge className="bg-warning/20 text-warning">{pendingCount}</Badge>
        </div>
        <div className="text-xs text-muted-foreground mt-2">
          Total: {approvedCount + pendingCount} tenders tracked
        </div>
      </CardContent>
    </Card>
  );
}
