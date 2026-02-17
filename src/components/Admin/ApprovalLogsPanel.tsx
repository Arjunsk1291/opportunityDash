import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useApproval, ApprovalLogEntry } from '@/contexts/ApprovalContext';
import { CheckCircle, RotateCcw, Clock } from 'lucide-react';
import { format, parseISO } from 'date-fns';

export default function ApprovalLogsPanel() {
  const { approvalLogs } = useApproval();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-primary" />
          Approval Logs
        </CardTitle>
        <CardDescription>
          History of two-step approval actions (Proposal Head → SVP)
        </CardDescription>
      </CardHeader>
      <CardContent>
        {approvalLogs.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No approval actions recorded yet.</p>
        ) : (
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-3">
              {approvalLogs.map((log) => (
                <LogEntry key={log.id} log={log} />
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

function LogEntry({ log }: { log: ApprovalLogEntry }) {
  const getActionText = () => {
    switch (log.action) {
      case 'proposal_head_approved':
        return 'Proposal Head approved';
      case 'svp_approved':
        return `SVP approved${log.group ? ` (${log.group})` : ''}`;
      case 'reverted':
      default:
        return 'Reverted to pending';
    }
  };

  const icon = log.action === 'reverted'
    ? <RotateCcw className="h-4 w-4 text-destructive" />
    : <CheckCircle className="h-4 w-4 text-success" />;

  return (
    <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
      <div className="mt-0.5">{icon}</div>
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">{log.performedBy}</span>
          <Badge variant="outline" className="text-xs">{log.performedByRole}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {getActionText()} tender <span className="font-mono text-xs text-foreground">{log.opportunityRefNo}</span>
        </p>
        <p className="text-xs text-muted-foreground">{format(parseISO(log.timestamp), 'MMM d, yyyy HH:mm:ss')}</p>
      </div>
    </div>
  );
}
