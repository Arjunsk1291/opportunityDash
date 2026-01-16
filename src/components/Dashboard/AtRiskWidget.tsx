import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, AlertTriangle } from 'lucide-react';
import { Opportunity } from '@/data/opportunityData';

interface AtRiskWidgetProps {
  data: Opportunity[];
  onSelectOpportunity?: (opp: Opportunity) => void;
}

export function AtRiskWidget({ data, onSelectOpportunity }: AtRiskWidgetProps) {
  const submissionNearItems = data
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
          <Clock className="h-5 w-5 text-pending" />
          Submission Near
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 max-h-[280px] overflow-auto scrollbar-thin">
          {submissionNearItems.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No tenders with upcoming submissions</p>
          ) : (
            submissionNearItems.map((item) => (
              <div 
                key={item.id} 
                className={`flex items-center justify-between p-2 rounded-lg bg-muted/50 transition-colors ${onSelectOpportunity ? 'cursor-pointer hover:bg-muted hover:ring-1 hover:ring-primary/20' : 'hover:bg-muted'}`}
                onClick={() => onSelectOpportunity?.(item)}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate text-primary hover:underline">{item.tenderName}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-muted-foreground">{item.clientName}</span>
                    <span className="text-xs text-muted-foreground">•</span>
                    <span className="text-xs text-muted-foreground">{item.internalLead || 'Unassigned'}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-2">
                  {item.willMissDeadline ? (
                    <Badge variant="destructive" className="text-xs">
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      {item.daysToPlannedSubmission}d left
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs text-pending border-pending">
                      <Clock className="h-3 w-3 mr-1" />
                      {item.daysToPlannedSubmission}d left
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
