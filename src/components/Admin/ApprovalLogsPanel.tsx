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
          History of approval actions performed by admin and master users
        </CardDescription>
      </CardHeader>
      <CardContent>
        {approvalLogs.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No approval actions recorded yet.
          </p>
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
  const isApproved = log.action === 'approved';

  return (
    <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
      <div className={`mt-0.5 ${isApproved ? 'text-success' : 'text-destructive'}`}>
        {isApproved ? <CheckCircle className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
      </div>
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">{log.performedBy}</span>
          <Badge variant="outline" className="text-xs">
            {log.performedByRole}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {isApproved ? 'Approved' : 'Reverted to pending'} tender{' '}
          <span className="font-mono text-xs text-foreground">{log.opportunityId}</span>
        </p>
        <p className="text-xs text-muted-foreground">
          {format(parseISO(log.timestamp), 'MMM d, yyyy HH:mm:ss')}
        </p>
      </div>
    </div>
  );
}
