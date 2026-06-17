import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { relinkBidDecisionToOpportunity } from '@/lib/bidDecision';
import { relinkPotentialOpportunity } from '@/lib/potentialOpportunities';
import { dismissMatch, type ManualMatchCandidate } from '@/lib/manualMatchFinder';

interface ManualMatchDialogProps {
  token: string | null;
  matches: ManualMatchCandidate[];
  onResolved: (match: ManualMatchCandidate) => void;
  onClose: () => void;
}

export function ManualMatchDialog({ token, matches, onResolved, onClose }: ManualMatchDialogProps) {
  const [processingKey, setProcessingKey] = useState<string | null>(null);

  const keyOf = (match: ManualMatchCandidate) => `${match.kind}:${match.recordId}:${match.opportunityRefNo}`;

  const handleYes = async (match: ManualMatchCandidate) => {
    if (!token) return;
    const key = keyOf(match);
    setProcessingKey(key);
    try {
      if (match.kind === 'bidDecision') {
        await relinkBidDecisionToOpportunity(token, match.recordId, match.opportunityRefNo);
      } else {
        await relinkPotentialOpportunity(token, match.recordId, match.opportunityRefNo);
      }
      toast.success(`Linked "${match.manualName || match.manualRef}" to ${match.opportunityRefNo}`);
      onResolved(match);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to link entry');
    } finally {
      setProcessingKey(null);
    }
  };

  const handleNo = (match: ManualMatchCandidate) => {
    dismissMatch(match.recordId, match.opportunityRefNo);
    onResolved(match);
  };

  return (
    <Dialog open={matches.length > 0} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Possible duplicate manual entries found</DialogTitle>
          <DialogDescription>
            These manually entered records look like they refer to opportunities just uploaded. Confirm if they're the same.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[55vh] overflow-auto space-y-3">
          {matches.map((match) => {
            const key = keyOf(match);
            const isProcessing = processingKey === key;
            return (
              <div key={key} className="rounded-md border p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant={match.confidence === 'high' ? 'default' : 'secondary'}>
                    {match.confidence === 'high' ? 'Same ref no' : 'Similar name'}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {match.kind === 'bidDecision' ? 'Bid Decision (manual)' : 'Potential Opportunity (unmatched)'}
                  </span>
                </div>
                <div className="text-sm">
                  <div>
                    <span className="text-muted-foreground">Manual entry: </span>
                    <span className="font-medium">{match.manualName || '—'}</span>
                    <span className="text-muted-foreground"> (ref {match.manualRef || '—'})</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Uploaded opportunity: </span>
                    <span className="font-medium">{match.opportunityName || '—'}</span>
                    <span className="text-muted-foreground"> (ref {match.opportunityRefNo})</span>
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2">
                  <Button size="sm" variant="outline" disabled={isProcessing} onClick={() => handleNo(match)}>
                    No, different
                  </Button>
                  <Button size="sm" disabled={isProcessing} onClick={() => handleYes(match)}>
                    {isProcessing ? 'Linking…' : 'Yes, same opportunity'}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
