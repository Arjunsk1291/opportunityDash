import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Opportunity } from '@/data/opportunityData';
import { getDisplayResult, getDisplayStatus, isEoiNormalizedOpportunity, normalizeCanonicalStatus } from '@/lib/opportunityStatus';

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

const normalizeHeader = (value: string) => String(value || '').trim().toUpperCase().replace(/\s+/g, ' ');

const RAW_COLUMN_HEADERS = [
  'Sr.no',
  'Year',
  'Tender no',
  'Tender name',
  'Client',
  'END USER',
  'ADNOC RFT NO',
  'Tender Location (Execution)',
  'GDS/GES',
  'Assigned Person',
  'Stage of project, Concept, FEED, DE',
  'Tender Type',
  'date tender recd',
  'Tender Due  date',
  'Tender  Submitted  date',
  'AVENIR STATUS',
  'REMARKS/REASON',
  'TENDER RESULT',
  'TENDER STATUS -',
  'Currency, USD/AED',
  'GM%',
  'Tender value',
  'Sub-contract value',
  'GM Value',
  'Go%',
  'Get %',
  'GO/Get %',
  'go/get value',
  'USD to AED',
  'who was awarded the project',
  'final awarded price',
] as const;

function getSnapshotValue(opportunity: Opportunity, headerLabel: string): string {
  const snapshot = opportunity.rawGraphData?.rowSnapshot;
  if (!snapshot || typeof snapshot !== 'object') return '';
  const target = normalizeHeader(headerLabel);
  for (const [key, rawValue] of Object.entries(snapshot)) {
    if (normalizeHeader(key) !== target) continue;
    const text = rawValue === null || rawValue === undefined ? '' : String(rawValue).trim();
    return text;
  }
  return '';
}

function getSmartValue(opportunity: Opportunity, headerLabel: string): string {
  const header = normalizeHeader(headerLabel);
  switch (header) {
    case 'YEAR':
      return String(opportunity.rawSheetYear || opportunity.rawGraphData?.year || '').trim();
    case 'TENDER NO':
    case 'REF NO':
      return String(opportunity.tenderNo || opportunity.opportunityRefNo || '').trim();
    case 'TENDER NAME':
      return String(opportunity.tenderName || '').trim();
    case 'CLIENT':
      return String(opportunity.clientName || '').trim();
    case 'GDS/GES':
      return String(opportunity.groupClassification || '').trim();
    case 'ASSIGNED PERSON':
    case 'LEAD':
      return String(opportunity.internalLead || '').trim();
    case 'TENDER TYPE':
      return String(opportunity.opportunityClassification || '').trim();
    case 'DATE TENDER RECD':
    case 'RFP RECEIVED':
      return String(opportunity.dateTenderReceived || opportunity.rawGraphData?.rfpReceivedDisplay || '').trim();
    case 'TENDER DUE DATE':
    case 'SUBMISSION':
      return String(
        opportunity.tenderPlannedSubmissionDate
        || opportunity.rawGraphData?.plannedSubmissionDisplay
        || '',
      ).trim();
    case 'TENDER SUBMITTED DATE':
      return String(
        opportunity.tenderSubmittedDate
        || opportunity.rawGraphData?.tenderSubmittedDisplay
        || '',
      ).trim();
    case 'AVENIR STATUS':
      return String(opportunity.avenirStatus || opportunity.rawAvenirStatus || '').trim();
    case 'REMARKS/REASON':
      return String(opportunity.remarksReason || '').trim();
    case 'TENDER RESULT':
      return String(opportunity.tenderResult || opportunity.rawTenderResult || '').trim();
    case 'TENDER STATUS -':
      return String(opportunity.tenderStatusRemark || '').trim();
    default:
      return '';
  }
}

function getDisplayValue(opportunity: Opportunity, headerLabel: string): string {
  const primary = getSmartValue(opportunity, headerLabel);
  if (primary) return primary;
  return getSnapshotValue(opportunity, headerLabel);
}

export function OpportunityDetailDialog({
  opportunity,
  open,
  onOpenChange,
  formatCurrency,
}: OpportunityDetailDialogProps) {
  if (!opportunity) return null;

  const getHeaderColor = () => {
    if (normalizeCanonicalStatus(getDisplayStatus(opportunity)) === 'AWARDED') return 'bg-emerald-600';
    if (opportunity.isAtRisk) return 'bg-red-600';
    if (isEoiNormalizedOpportunity(opportunity)) return 'bg-violet-700';
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
            <DetailRow label="Avenir Ref" value={opportunity.opportunityRefNo || '—'} />
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
            <DetailRow label="Status" value={getDisplayStatus(opportunity) || '—'} />
            <DetailRow label="Awarded Date" value={opportunity.awardedDate || '—'} />
            <DetailRow label="Remarks" value={opportunity.remarksReason || '—'} />
            <DetailRow label="Result" value={getDisplayResult(opportunity) || '—'} />
          </div>

          <Separator className="my-6" />

          <div className="space-y-1">
            {RAW_COLUMN_HEADERS.map((header) => {
              const value = getDisplayValue(opportunity, header);
              return <DetailRow key={header} label={header} value={value || '—'} />;
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
