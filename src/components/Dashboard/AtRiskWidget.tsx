import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, AlertTriangle } from 'lucide-react';
import { Opportunity } from '@/data/opportunityData';

interface AtRiskWidgetProps {
  data: Opportunity[];
  onSelectOpportunity?: (opp: Opportunity) => void;
}

export function AtRiskWidget({ data, onSelectOpportunity }: AtRiskWidgetProps) {
  // Submission Near = tender submitted/planned submission date within next 7 days
  const getSubmissionDate = (opp: Opportunity): Date | null => {
    const raw = opp.tenderSubmittedDate || opp.tenderPlannedSubmissionDate;
    if (!raw) return null;
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const isSubmissionNear = (opp: Opportunity): boolean => {
    const submissionDate = getSubmissionDate(opp);
    if (!submissionDate) return false;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(submissionDate);
    target.setHours(0, 0, 0, 0);

    const diffDays = Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays >= 0 && diffDays <= 7;
  };

  const submissionNear = data
    .filter(o => isSubmissionNear(o))
    .sort((a, b) => {
      const dateA = getSubmissionDate(a)?.getTime() || 0;
      const dateB = getSubmissionDate(b)?.getTime() || 0;
      return dateA - dateB;
    })
    .slice(0, 8);

  const getDaysToDeadline = (opp: Opportunity): number => {
    const submissionDate = getSubmissionDate(opp);
    if (!submissionDate) return 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(submissionDate);
    target.setHours(0, 0, 0, 0);

    const diffDays = Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(0, diffDays);
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Clock className="h-5 w-5 text-pending" />
          Submission Within a Week
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 max-h-[280px] overflow-auto scrollbar-thin">
          {submissionNear.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No tenders due within 7 days</p>
          ) : (
            submissionNear.map((item) => {
              const daysLeft = getDaysToDeadline(item);
              const isUrgent = daysLeft <= 2;
              
              return (
                <div
                  key={item.id}
                  className={`flex items-center justify-between p-2 rounded-lg transition-colors ${
                    isUrgent ? 'bg-destructive/10' : 'bg-muted/50'
                  } ${
                    onSelectOpportunity ? 'cursor-pointer hover:ring-1 hover:ring-primary/20' : ''
                  }`}
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
                    {isUrgent ? (
                      <Badge variant="destructive" className="text-xs">
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        {daysLeft}d left
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs text-pending border-pending">
                        <Clock className="h-3 w-3 mr-1" />
                        {daysLeft}d left
                      </Badge>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}
