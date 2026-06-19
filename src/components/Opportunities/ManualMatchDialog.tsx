import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
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

const keyOf = (match: ManualMatchCandidate) => `${match.kind}:${match.recordId}:${match.opportunityRefNo}`;

export function ManualMatchDialog({ token, matches, onResolved, onClose }: ManualMatchDialogProps) {
  // Everything is selected (i.e. approved/linked) by default; the user deselects the
  // ones they don't want to link, then approves the rest in one action.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    setSelected(new Set(matches.map(keyOf)));
  }, [matches]);

  const allSelected = matches.length > 0 && selected.size === matches.length;
  const selectedCount = selected.size;

  const toggle = (key: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key); else next.delete(key);
      return next;
    });
  };

  const toggleAll = (checked: boolean) => {
    setSelected(checked ? new Set(matches.map(keyOf)) : new Set());
  };

  const linkMatch = async (match: ManualMatchCandidate) => {
    if (match.kind === 'bidDecision') {
      await relinkBidDecisionToOpportunity(token as string, match.recordId, match.opportunityRefNo);
    } else {
      await relinkPotentialOpportunity(token as string, match.recordId, match.opportunityRefNo);
    }
  };

  const handleApprove = async () => {
    if (!token || !matches.length) return;
    setProcessing(true);
    let linked = 0;
    let failed = 0;
    try {
      for (const match of matches) {
        const isSelected = selected.has(keyOf(match));
        try {
          if (isSelected) {
            await linkMatch(match);
            linked += 1;
          } else {
            // Unchecked entries are explicitly marked "not the same" so they won't resurface.
            dismissMatch(match.recordId, match.opportunityRefNo);
          }
          onResolved(match);
        } catch {
          failed += 1;
        }
      }
      if (linked) toast.success(`Linked ${linked} manual ${linked === 1 ? 'entry' : 'entries'}.`);
      if (failed) toast.error(`Failed to link ${failed} ${failed === 1 ? 'entry' : 'entries'}.`);
      onClose();
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Dialog open={matches.length > 0} onOpenChange={(open) => { if (!open && !processing) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Possible duplicate manual entries found</DialogTitle>
          <DialogDescription>
            These manually entered records look like they refer to opportunities just uploaded. Selected entries
            will be linked; deselect any that aren't the same, then approve.
          </DialogDescription>
        </DialogHeader>

        <label className="flex items-center gap-3 rounded-md border px-3 py-2 cursor-pointer hover:bg-muted/30">
          <Checkbox checked={allSelected} onCheckedChange={(checked) => toggleAll(checked === true)} disabled={processing} />
          <span className="text-sm font-medium">Select all ({matches.length})</span>
        </label>

        <div className="max-h-[55vh] overflow-auto space-y-3">
          {matches.map((match) => {
            const key = keyOf(match);
            const isChecked = selected.has(key);
            return (
              <label
                key={key}
                className="flex items-start gap-3 rounded-md border p-3 cursor-pointer hover:bg-muted/20"
              >
                <Checkbox
                  className="mt-1"
                  checked={isChecked}
                  onCheckedChange={(checked) => toggle(key, checked === true)}
                  disabled={processing}
                />
                <div className="flex-1 min-w-0 space-y-2">
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
                </div>
              </label>
            );
          })}
        </div>

        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" disabled={processing} onClick={onClose}>Skip</Button>
          <Button disabled={processing} onClick={() => void handleApprove()}>
            {processing
              ? 'Applying…'
              : selectedCount === matches.length
                ? `Approve All (${matches.length})`
                : `Approve ${selectedCount} Selected`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
