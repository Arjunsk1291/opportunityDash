import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Opportunity } from '@/data/opportunityData';
import { Info } from 'lucide-react';

interface OpportunityDetailDialogProps {
  opportunity: Opportunity | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formatCurrency: (value: number) => string;
}

const getStageTone = (opportunity: Opportunity) => {
  if (opportunity.canonicalStage === 'AWARDED') {
    return 'bg-emerald-100 text-emerald-700 border-emerald-200';
  }
  if (opportunity.isAtRisk) {
    return 'bg-red-100 text-red-700 border-red-200';
  }
  return 'bg-blue-100 text-blue-700 border-blue-200';
};

const InfoRow = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-lg border bg-background p-3">
    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
    <p className="mt-1 text-sm font-medium text-foreground break-words">{value || '—'}</p>
  </div>
);

export function OpportunityDetailDialog({
  opportunity,
  open,
  onOpenChange,
  formatCurrency,
}: OpportunityDetailDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto p-0 gap-0">
        {opportunity && (
          <>
            <DialogHeader className="border-b bg-muted/30 px-6 py-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-2">
                  <DialogTitle className="text-left text-2xl leading-tight">{opportunity.tenderName || 'Untitled Opportunity'}</DialogTitle>
                  <p className="text-sm text-muted-foreground">{opportunity.clientName || 'No client mapped'}</p>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className="font-mono">{opportunity.opportunityRefNo || 'N/A'}</Badge>
                    <Badge className={getStageTone(opportunity)}>{opportunity.canonicalStage || 'UNKNOWN'}</Badge>
                    <Badge variant="secondary">{opportunity.groupClassification || 'N/A'}</Badge>
                    {opportunity.isAtRisk && <Badge variant="destructive">Submission Near</Badge>}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-right">
                  <div className="rounded-lg border bg-background px-3 py-2">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Probability</p>
                    <p className="text-lg font-semibold">{opportunity.probability || 0}%</p>
                  </div>
                  <div className="rounded-lg border bg-background px-3 py-2">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Expected Value</p>
                    <p className="text-lg font-semibold text-emerald-700">{formatCurrency(opportunity.expectedValue || 0)}</p>
                  </div>
                </div>
              </div>
            </DialogHeader>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 px-6 py-5">
              <div className="lg:col-span-2 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <InfoRow label="Opportunity Value" value={formatCurrency(opportunity.opportunityValue || 0)} />
                  <InfoRow label="Internal Lead" value={opportunity.internalLead || 'Unassigned'} />
                  <InfoRow label="Tender Type" value={opportunity.opportunityClassification || 'N/A'} />
                  <InfoRow label="Tender Result" value={opportunity.tenderResult || 'N/A'} />
                  <InfoRow label="Received" value={opportunity.dateTenderReceived || String(opportunity.rawGraphData?.rfpReceivedDisplay || 'N/A')} />
                  <InfoRow label="Submission" value={opportunity.tenderPlannedSubmissionDate || 'N/A'} />
                </div>

                <div className="rounded-lg border p-4 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Remarks</p>
                  <p className="text-sm text-foreground">{opportunity.remarksReason || 'No remarks available.'}</p>
                  <Separator />
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Comments</p>
                  <p className="text-sm text-foreground">{opportunity.comments || 'No comments available.'}</p>
                </div>

                {(opportunity.opportunityValue_imputed || opportunity.probability_imputed) && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-2">
                    <p className="text-sm font-medium flex items-center gap-2 text-amber-800">
                      <Info className="h-4 w-4" />
                      Imputation Notes
                    </p>
                    {opportunity.opportunityValue_imputed && (
                      <p className="text-xs text-amber-900"><strong>Value:</strong> {opportunity.opportunityValue_imputation_reason}</p>
                    )}
                    {opportunity.probability_imputed && (
                      <p className="text-xs text-amber-900"><strong>Probability:</strong> {opportunity.probability_imputation_reason}</p>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div className="rounded-lg border p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Metadata</p>
                  <div className="space-y-2 text-sm">
                    <p><span className="text-muted-foreground">Client Type:</span> {opportunity.clientType || 'N/A'}</p>
                    <p><span className="text-muted-foreground">Country:</span> {opportunity.country || 'N/A'}</p>
                    <p><span className="text-muted-foreground">Avenir Status:</span> {opportunity.avenirStatus || 'N/A'}</p>
                    <p><span className="text-muted-foreground">Award Status:</span> {opportunity.awardStatus || 'N/A'}</p>
                    <p><span className="text-muted-foreground">Domain:</span> {opportunity.domainSubGroup || 'N/A'}</p>
                  </div>
                </div>

                <div className="rounded-lg border p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Sheet Snapshot</p>
                  <div className="max-h-56 overflow-auto space-y-2 pr-1">
                    {Object.entries(opportunity.rawGraphData?.rowSnapshot || {}).length > 0 ? (
                      Object.entries(opportunity.rawGraphData?.rowSnapshot || {}).map(([key, value]) => (
                        <div key={key} className="text-xs border-b pb-1">
                          <p className="text-muted-foreground">{key}</p>
                          <p className="font-medium text-foreground break-words">{String(value ?? '—')}</p>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-muted-foreground">No sheet snapshot available.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
