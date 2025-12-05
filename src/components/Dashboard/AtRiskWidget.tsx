import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Clock } from 'lucide-react';
import { Opportunity } from '@/data/opportunityData';

interface AtRiskWidgetProps {
  data: Opportunity[];
}

export function AtRiskWidget({ data }: AtRiskWidgetProps) {
  const atRiskItems = data
    .filter(o => o.isAtRisk || o.willMissDeadline)
    .sort((a, b) => {
      if (a.willMissDeadline && !b.willMissDeadline) return -1;
      if (!a.willMissDeadline && b.willMissDeadline) return 1;
      return a.daysToPlannedSubmission - b.daysToPlannedSubmission;
    })
    .slice(0, 8);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-warning" />
          At Risk & Upcoming Deadlines
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 max-h-[280px] overflow-auto scrollbar-thin">
          {atRiskItems.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No at-risk opportunities</p>
          ) : (
            atRiskItems.map((item) => (
              <div key={item.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{item.tenderName}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-muted-foreground">{item.clientName}</span>
                    <span className="text-xs text-muted-foreground">•</span>
                    <span className="text-xs text-muted-foreground">{item.internalLead || 'Unassigned'}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-2">
                  {item.willMissDeadline && (
                    <Badge variant="destructive" className="text-xs">
                      <Clock className="h-3 w-3 mr-1" />
                      {item.daysToPlannedSubmission}d
                    </Badge>
                  )}
                  {item.isAtRisk && !item.willMissDeadline && (
                    <Badge variant="outline" className="text-xs text-warning border-warning">
                      {item.agedDays}d aged
                    </Badge>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
