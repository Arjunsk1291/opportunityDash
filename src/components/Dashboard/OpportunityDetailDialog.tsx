import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Opportunity } from '@/data/opportunityData';

interface OpportunityDetailDialogProps {
  opportunity: Opportunity | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formatCurrency: (value: number) => string;
}

const DetailRow = ({ label, value }: { label: string; value: string | React.ReactNode }) => (
  <div className="flex justify-between items-start py-3 border-b border-slate-200 last:border-b-0">
    <p className="text-sm font-semibold text-slate-500 uppercase">{label}</p>
    <p className="text-sm text-slate-900 font-medium text-right max-w-xs">{value || '—'}</p>
  </div>
);

export function OpportunityDetailDialog({
  opportunity,
  open,
  onOpenChange,
  formatCurrency,
}: OpportunityDetailDialogProps) {
  if (!opportunity) return null;

  const getHeaderColor = () => {
    if (opportunity.canonicalStage === 'AWARDED') return 'bg-emerald-600';
    if (opportunity.isAtRisk) return 'bg-red-600';
    return 'bg-slate-700';
  };

  const getSubmissionDisplay = () => {
    return opportunity.tenderSubmittedDate
      || opportunity.tenderPlannedSubmissionDate
      || opportunity.rawGraphData?.tenderSubmittedDisplay
      || opportunity.rawGraphData?.plannedSubmissionDisplay
      || '—';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden border-none bg-white">
        <DialogHeader className="sr-only">
          <DialogTitle>Opportunity details</DialogTitle>
          <DialogDescription>Detailed information for the selected opportunity.</DialogDescription>
        </DialogHeader>
        {/* Header */}
        <div className={`${getHeaderColor()} text-white p-6 -m-6 mb-0 rounded-t-lg`}>
          <Badge className="mb-3 bg-white/20 hover:bg-white/30 text-white border-none">
            {opportunity.opportunityRefNo || 'N/A'}
          </Badge>
          <h2 className="text-2xl font-bold">{opportunity.tenderName || 'Untitled Tender'}</h2>
          <p className="text-sm text-white/80 mt-1">{opportunity.clientName || 'N/A'}</p>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(85vh-150px)]">
          <div className="space-y-1">
            <DetailRow label="AVE No." value={opportunity.opportunityRefNo || '—'} />
            <DetailRow label="Tender Name" value={opportunity.tenderName || '—'} />
            <DetailRow label="Tender Type" value={opportunity.opportunityClassification || '—'} />
            <DetailRow label="Client" value={opportunity.clientName || '—'} />
            <DetailRow label="Group" value={opportunity.groupClassification || '—'} />
            <DetailRow 
              label="RFP Received" 
              value={opportunity.dateTenderReceived || opportunity.rawGraphData?.rfpReceivedDisplay || '—'} 
            />
            <DetailRow label="Submission" value={getSubmissionDisplay()} />
            <DetailRow label="Lead" value={opportunity.internalLead || '—'} />
            <DetailRow label="Status" value={opportunity.avenirStatus || '—'} />
            <DetailRow label="Remarks" value={opportunity.remarksReason || '—'} />
            <DetailRow label="Result" value={opportunity.tenderResult || '—'} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
