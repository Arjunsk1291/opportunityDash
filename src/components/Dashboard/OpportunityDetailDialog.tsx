import { useState, useEffect, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { CalendarClock, Plus, StickyNote } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { Opportunity } from '@/data/opportunityData';
import { getDisplayResult, getDisplayStatus, isEoiNormalizedOpportunity, normalizeCanonicalStatus } from '@/lib/opportunityStatus';
import { OPPORTUNITY_COLUMN_HEADERS } from '@/lib/opportunities/columns';
import { type TenderFollowUp, getFollowUps, createFollowUp, canWriteFollowUps, initialsOf } from '@/lib/tenderFollowUps';

const prettyDate = (iso: string): string => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
};

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

const RAW_COLUMN_HEADERS = OPPORTUNITY_COLUMN_HEADERS;

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
  const { token, user } = useAuth();
  const canWrite = canWriteFollowUps(user?.role);
  const refNo = opportunity?.opportunityRefNo || '';

  const [followUps, setFollowUps] = useState<TenderFollowUp[]>([]);
  const [fuLoading, setFuLoading] = useState(false);
  const [newDate, setNewDate] = useState('');
  const [newNote, setNewNote] = useState('');
  const [adding, setAdding] = useState(false);

  const loadFollowUps = useCallback(async () => {
    if (!token || !refNo) { setFollowUps([]); return; }
    setFuLoading(true);
    try { setFollowUps(await getFollowUps(token, refNo)); }
    catch { /* keep the detail dialog usable even if follow-ups fail */ }
    finally { setFuLoading(false); }
  }, [token, refNo]);

  useEffect(() => {
    if (open && refNo) loadFollowUps();
    else setFollowUps([]);
  }, [open, refNo, loadFollowUps]);

  const handleAddFollowUp = async () => {
    if (!token || !refNo || !newNote.trim()) return;
    setAdding(true);
    try {
      await createFollowUp(token, {
        opportunityRefNo: refNo,
        tenderName: opportunity?.tenderName || '',
        clientName: opportunity?.clientName || '',
        date: newDate,
        note: newNote.trim(),
      });
      setNewNote('');
      setNewDate('');
      toast.success('Follow-up added');
      await loadFollowUps();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add follow-up');
    } finally {
      setAdding(false);
    }
  };

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

          {/* Follow-Ups for this tender */}
          <div>
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-3">
              <StickyNote className="h-4 w-4 text-indigo-500" /> Follow-Ups
              <span className="text-xs font-medium text-slate-400">({followUps.length})</span>
            </h3>

            {fuLoading ? (
              <p className="text-xs text-slate-400">Loading…</p>
            ) : followUps.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No follow-ups yet for this tender.</p>
            ) : (
              <ul className="space-y-2">
                {followUps.map((f) => (
                  <li key={f.id} className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                    <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                      <span className="inline-flex items-center gap-1">
                        <CalendarClock className="h-3 w-3" /> {prettyDate(f.date) || '—'}
                      </span>
                      <span className="inline-flex items-center gap-1.5" title={f.updatedBy}>
                        <span className="h-4 w-4 rounded-full bg-indigo-500 text-white grid place-items-center text-[8px] font-bold">
                          {initialsOf(f.updatedBy)}
                        </span>
                        <span className="max-w-[9rem] truncate">{f.updatedBy || 'unknown'}</span>
                      </span>
                    </div>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">{f.note}</p>
                  </li>
                ))}
              </ul>
            )}

            {canWrite && (
              <div className="mt-3 rounded-lg border border-dashed border-slate-300 p-3 space-y-2">
                <Input
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="h-8 text-xs w-44"
                />
                <Textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  rows={2}
                  placeholder="Add a follow-up note for this tender…"
                  className="text-sm"
                />
                <div className="flex justify-end">
                  <Button size="sm" onClick={handleAddFollowUp} disabled={adding || !newNote.trim()}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> {adding ? 'Adding…' : 'Add Follow-Up'}
                  </Button>
                </div>
              </div>
            )}
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
