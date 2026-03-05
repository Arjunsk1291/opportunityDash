import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Opportunity } from '@/data/opportunityData';

interface OpportunityDetailDialogProps {
  opportunity: Opportunity | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formatCurrency: (value: number) => string;
}

function displayUnknown(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value)) return value.map((item) => String(item)).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

const DetailItem = ({ label, value }: { label: string; value: string | React.ReactNode }) => (
  <div className="space-y-1">
    <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
    <p className="text-sm font-medium text-slate-900 break-words">{value || '—'}</p>
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
    if (opportunity.isAtRisk) return 'bg-red-700';
    return 'bg-slate-800';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] p-0 overflow-hidden border-none bg-slate-50/95 backdrop-blur-md">
        <div className="flex flex-col h-full">
          <DialogHeader className="sr-only">
            <DialogTitle>{opportunity.tenderName}</DialogTitle>
          </DialogHeader>

          {/* Header Section */}
          <div className={`p-6 text-white ${getHeaderColor()}`}>
            <div className="flex justify-between items-start gap-4">
              <div>
                <Badge className="mb-2 bg-white/20 hover:bg-white/30 text-white border-none">
                  {opportunity.opportunityRefNo || 'N/A'}
                </Badge>
                <h2 className="text-3xl font-bold tracking-tight text-white">
                  {opportunity.tenderName || 'Untitled Tender'}
                </h2>
                <p className="text-sm text-white/80 mt-2">{opportunity.clientName || 'No client mapped'}</p>
              </div>
              <div className="text-right">
                <p className="text-white/60 text-xs uppercase font-bold tracking-widest">Win Probability</p>
                <p className="text-4xl font-black">{opportunity.probability || 0}%</p>
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="p-8 grid grid-cols-1 md:grid-cols-3 gap-6 overflow-y-auto flex-1">
            {/* Left Column - Main Content */}
            <div className="md:col-span-2 space-y-6">
              {/* Value Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
                  <p className="text-slate-500 text-xs font-semibold uppercase">Total Value</p>
                  <p className="text-2xl font-bold text-slate-900">{formatCurrency(opportunity.opportunityValue || 0)}</p>
                </div>
                <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
                  <p className="text-slate-500 text-xs font-semibold uppercase">Weighted Value</p>
                  <p className="text-2xl font-bold text-emerald-600">{formatCurrency(opportunity.expectedValue || 0)}</p>
                </div>
              </div>

              {/* Win Confidence Circular Progress */}
              <div className="flex items-center gap-6 p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
                <div className="relative flex items-center justify-center">
                  <svg className="w-20 h-20 transform -rotate-90">
                    <circle cx="40" cy="40" r="36" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-slate-200" />
                    <circle
                      cx="40"
                      cy="40"
                      r="36"
                      stroke="currentColor"
                      strokeWidth="8"
                      fill="transparent"
                      strokeDasharray={226}
                      strokeDashoffset={226 - (226 * Math.max(0, Math.min(100, opportunity.probability || 0))) / 100}
                      className={`${(opportunity.probability || 0) > 70 ? 'text-emerald-500' : 'text-amber-500'} transition-all duration-1000`}
                    />
                  </svg>
                  <span className="absolute text-lg font-bold">{opportunity.probability || 0}%</span>
                </div>

                <div>
                  <h4 className="text-sm font-semibold text-slate-900 uppercase tracking-wider">Win Confidence</h4>
                  <p className="text-xs text-slate-500 max-w-[220px]">
                    Stage: <span className="font-medium text-slate-700">{opportunity.canonicalStage || 'N/A'}</span> · Result: <span className="font-medium text-slate-700">{opportunity.tenderResult || 'N/A'}</span>
                  </p>
                  <div className="mt-2 flex gap-1">
                    {[1, 2, 3, 4, 5].map((step) => (
                      <div
                        key={step}
                        className={`h-1.5 w-6 rounded-full ${step <= ((opportunity.probability || 0) / 20) ? 'bg-emerald-400' : 'bg-slate-200'}`}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Analysis & Remarks */}
              <div className="space-y-2">
                <h4 className="text-sm font-bold text-slate-400 uppercase">Analysis & Remarks</h4>
                <div className="p-4 bg-slate-100 rounded-lg italic text-slate-700 border-l-4 border-slate-300">
                  "{opportunity.remarksReason || 'No remarks/reason provided from sheet.'}"
                </div>
                <div className="p-4 bg-white rounded-lg text-slate-700 border border-slate-200">
                  <p className="text-xs uppercase text-slate-500 font-semibold mb-2">Comments</p>
                  <p className="text-sm">{opportunity.comments || 'No internal comments provided.'}</p>
                </div>
              </div>

              {/* Sheet Snapshot */}
              <div className="space-y-3">
                <h4 className="text-sm font-bold text-slate-400 uppercase">Key Fields from Source</h4>
                <div className="rounded-xl border border-slate-200 bg-white p-4 max-h-80 overflow-auto">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    {Object.entries(opportunity.rawGraphData?.rowSnapshot || {}).map(([key, value]) => (
                      <div key={key}>
                        <p className="text-xs text-slate-500">{key}</p>
                        <p className="font-medium break-words text-slate-900">{displayUnknown(value)}</p>
                      </div>
                    ))}
                    {!opportunity.rawGraphData?.rowSnapshot && (
                      <p className="text-sm text-slate-500 col-span-full">No source data available.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Right Sidebar */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xl space-y-6 h-fit">
              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase mb-3">Tender Metadata</h4>
                <div className="space-y-4">
                  <DetailItem label="Client" value={opportunity.clientName || 'N/A'} />
                  <DetailItem label="Lead" value={opportunity.internalLead || 'N/A'} />
                  <DetailItem label="Group" value={opportunity.groupClassification || 'N/A'} />
                  <DetailItem label="Client Type" value={opportunity.clientType || 'N/A'} />
                  <DetailItem label="Country/Region" value={opportunity.country || 'N/A'} />
                  <DetailItem label="Avenir Status" value={opportunity.avenirStatus || 'N/A'} />
                  <DetailItem label="RFP Received" value={opportunity.dateTenderReceived || opportunity.rawGraphData?.rfpReceivedDisplay || 'N/A'} />
                  <DetailItem label="Submission Deadline" value={opportunity.tenderPlannedSubmissionDate || 'N/A'} />
                </div>
              </div>

              <Separator />

              <div className={`p-3 rounded-lg text-center font-bold text-xs ${
                opportunity.isAtRisk ? 'bg-red-50 text-red-600 animate-pulse' : 'bg-blue-50 text-blue-600'
              }`}>
                {opportunity.isAtRisk ? '⚠️ SUBMISSION URGENT' : '✓ Schedule Stable'}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
