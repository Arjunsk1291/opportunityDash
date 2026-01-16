import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckCircle, Clock } from "lucide-react";
import type { Opportunity } from "@/data/opportunityData";
import { useApproval } from "@/contexts/ApprovalContext";
import { useCurrency } from "@/contexts/CurrencyContext";

interface ApprovalStatsWidgetProps {
  data: Opportunity[];
}

export function ApprovalStatsWidget({ data }: ApprovalStatsWidgetProps) {
  const { getApprovalStatus } = useApproval();
  const { formatCurrency } = useCurrency();

  const stats = useMemo(() => {
    let approvedCount = 0;
    let pendingCount = 0;
    let approvedValue = 0;
    let pendingValue = 0;

    for (const t of data) {
      const status = getApprovalStatus(t.id);
      if (status === "approved") {
        approvedCount += 1;
        approvedValue += t.opportunityValue || 0;
      } else {
        pendingCount += 1;
        pendingValue += t.opportunityValue || 0;
      }
    }

    const total = approvedCount + pendingCount;
    const approvedPct = total === 0 ? 0 : Math.round((approvedCount / total) * 100);

    return { approvedCount, pendingCount, approvedValue, pendingValue, total, approvedPct };
  }, [data, getApprovalStatus]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Approval Status</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-success" />
              <span className="text-sm font-medium">Approved</span>
            </div>
            <Badge variant="outline" className="border-success text-success">
              {stats.approvedCount}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Total value: <span className="font-medium text-foreground">{formatCurrency(stats.approvedValue)}</span>
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-pending" />
              <span className="text-sm font-medium">Pending</span>
            </div>
            <Badge variant="secondary">{stats.pendingCount}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Total value: <span className="font-medium text-foreground">{formatCurrency(stats.pendingValue)}</span>
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Approved coverage</span>
            <span>{stats.approvedPct}%</span>
          </div>
          <Progress value={stats.approvedPct} className="h-2" />
        </div>
      </CardContent>
    </Card>
  );
}
