import { useEffect, useMemo, useState } from 'react';
import { Search, ShieldAlert, ClipboardList, StickyNote, CalendarClock, Plus } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { useCurrency } from '@/contexts/CurrencyContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import type { Opportunity } from '@/data/opportunityData';
import { createProjectUpdate, getProjectUpdates, getTenderProjectUpdates, type ProjectUpdate, type ProjectUpdateType, type FinalDecision } from '@/lib/tenderUpdates';
import { createFollowUp, getFollowUps, type TenderFollowUp } from '@/lib/tenderFollowUps';
import { UpdateTimeline } from '@/components/TenderUpdates/UpdateTimeline';
import { getDisplayResult, getDisplayStatus } from '@/lib/opportunityStatus';
import { AddUpdateForm } from '@/components/TenderUpdates/AddUpdateForm';

const normalize = (value: unknown) => String(value || '').trim().toUpperCase();
const API_URL = import.meta.env.VITE_API_URL || '/api';

const isGtsTender = (opp: Opportunity) => normalize(opp.groupClassification) === 'GTS';

function formatDate(value?: string | null) {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString();
}

function TenderSummary({ tender, updates, followUps }: { tender: Opportunity; updates: ProjectUpdate[]; followUps: TenderFollowUp[] }) {
  const { formatCurrency } = useCurrency();
  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <span>{tender.opportunityRefNo}</span>
          <Badge variant="outline">{tender.groupClassification || '—'}</Badge>
          <Badge variant="outline">{getDisplayStatus(tender) || '—'}</Badge>
        </CardTitle>
        <CardDescription>{tender.tenderName || 'Untitled tender'}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div><div className="text-xs text-muted-foreground">Client</div><div className="font-medium">{tender.clientName || '—'}</div></div>
        <div><div className="text-xs text-muted-foreground">Lead</div><div className="font-medium">{tender.internalLead || '—'}</div></div>
        <div><div className="text-xs text-muted-foreground">Value</div><div className="font-medium">{formatCurrency(Number(tender.opportunityValue || 0))}</div></div>
        <div><div className="text-xs text-muted-foreground">Result</div><div className="font-medium">{getDisplayResult(tender) || '—'}</div></div>
        <div><div className="text-xs text-muted-foreground">RFP Received</div><div className="font-medium">{formatDate(tender.dateTenderReceived)}</div></div>
        <div><div className="text-xs text-muted-foreground">Submission</div><div className="font-medium">{formatDate(tender.tenderPlannedSubmissionDate)}</div></div>
        <div><div className="text-xs text-muted-foreground">Updates</div><div className="font-medium">{updates.length}</div></div>
        <div><div className="text-xs text-muted-foreground">Follow-Ups</div><div className="font-medium">{followUps.length}</div></div>
      </CardContent>
    </Card>
  );
}

const EMPTY_PROJECT_UPDATE = {
  updateType: 'general_note' as ProjectUpdateType,
  vendorName: '',
  parentUpdateId: '',
  responseDetails: '',
  contactDate: '',
  responseDate: '',
  extensionDate: '',
  finalizedDate: '',
  finalDecision: '' as FinalDecision | '',
  finalInstructions: '',
  finalPrice: '',
  notes: '',
};

export default function Handover() {
  const { opportunities } = useData();
  const { token, isMaster, isAdmin } = useAuth();
  const [search, setSearch] = useState('');
  const [selectedRefNo, setSelectedRefNo] = useState<string>('');
  const [projectUpdates, setProjectUpdates] = useState<ProjectUpdate[]>([]);
  const [followUps, setFollowUps] = useState<TenderFollowUp[]>([]);
  const [followUpDate, setFollowUpDate] = useState('');
  const [followUpNote, setFollowUpNote] = useState('');
  const [savingFollowUp, setSavingFollowUp] = useState(false);
  const [updateType, setUpdateType] = useState<ProjectUpdateType>('general_note');
  const [updateVendorName, setUpdateVendorName] = useState('');
  const [updateNotes, setUpdateNotes] = useState('');
  const [savingUpdate, setSavingUpdate] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const handoverTenders = useMemo(() => opportunities.filter(isGtsTender), [opportunities]);

  const filteredTenders = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return handoverTenders;
    return handoverTenders.filter((opp) => [
      opp.opportunityRefNo,
      opp.tenderNo,
      opp.tenderName,
      opp.clientName,
      opp.internalLead,
      opp.avenirStatus,
      opp.comments,
    ].join(' ').toLowerCase().includes(q));
  }, [handoverTenders, search]);

  const selectedTender = useMemo(
    () => filteredTenders.find((opp) => opp.opportunityRefNo === selectedRefNo)
      || handoverTenders.find((opp) => opp.opportunityRefNo === selectedRefNo)
      || null,
    [filteredTenders, handoverTenders, selectedRefNo]
  );

  useEffect(() => {
    if (!selectedRefNo && filteredTenders.length > 0) {
      setSelectedRefNo(filteredTenders[0].opportunityRefNo);
    }
  }, [filteredTenders, selectedRefNo]);

  useEffect(() => {
    const loadHistory = async () => {
      if (!token || !selectedTender) return;
      setLoadingHistory(true);
      try {
        const [updates, followUpRows] = await Promise.all([
          getProjectUpdates(token),
          getFollowUps(token, selectedTender.opportunityRefNo),
        ]);
        setProjectUpdates(updates);
        setFollowUps(followUpRows);
      } catch (error) {
        toast.error((error as Error).message || 'Failed to load handover history');
      } finally {
        setLoadingHistory(false);
      }
    };
    void loadHistory();
  }, [selectedTender, token]);

  const selectedTenderUpdates = selectedTender
    ? getTenderProjectUpdates(selectedTender.id, selectedTender.opportunityRefNo, projectUpdates)
    : [];

  const refreshSelectedTender = async () => {
    if (!token || !selectedTender) return;
    const [updates, followUpRows] = await Promise.all([
      getProjectUpdates(token),
      getFollowUps(token, selectedTender.opportunityRefNo),
    ]);
    setProjectUpdates(updates);
    setFollowUps(followUpRows);
  };

  const handleAddFollowUp = async () => {
    if (!token || !selectedTender || !followUpNote.trim()) return;
    setSavingFollowUp(true);
    try {
      await createFollowUp(token, {
        opportunityRefNo: selectedTender.opportunityRefNo,
        tenderName: selectedTender.tenderName || '',
        clientName: selectedTender.clientName || '',
        date: followUpDate,
        note: followUpNote.trim(),
      });
      setFollowUpNote('');
      setFollowUpDate('');
      await refreshSelectedTender();
      toast.success('Follow-up added');
    } catch (error) {
      toast.error((error as Error).message || 'Failed to add follow-up');
    } finally {
      setSavingFollowUp(false);
    }
  };

  const handleAddProjectUpdate = async (payload: Omit<ProjectUpdate, 'id' | 'createdAt' | 'updatedBy' | 'tenderId' | 'tenderRefNo'>) => {
    if (!token || !selectedTender) return;
    setSavingUpdate(true);
    try {
      await createProjectUpdate(token, {
        ...payload,
        tenderId: selectedTender.id,
        tenderRefNo: selectedTender.opportunityRefNo,
      });
      setUpdateType('general_note');
      setUpdateVendorName('');
      setUpdateNotes('');
      await refreshSelectedTender();
      toast.success('Project update added');
    } catch (error) {
      toast.error((error as Error).message || 'Failed to add project update');
    } finally {
      setSavingUpdate(false);
    }
  };

  if (!isMaster && !isAdmin) {
    return (
      <Card className="mx-auto mt-8 max-w-2xl border-amber-300/60 bg-amber-50/80">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-amber-900">
            <ShieldAlert className="h-5 w-5" />
            Access Denied
          </CardTitle>
          <CardDescription className="text-amber-800">
            Only Master and Admin users can access Handover.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border bg-gradient-to-r from-slate-950 via-slate-900 to-cyan-950 p-6 text-white shadow-xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-cyan-200/80">
              <ClipboardList className="h-4 w-4" />
              Master Handover
            </div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">GTS Tender Handover</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-300">
              Review the full tender packet in one place: master data, follow-ups, project updates, and notes ready for handover.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="text-2xl font-semibold tabular-nums">{handoverTenders.length}</div>
              <div className="text-xs text-slate-300">GTS tenders</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="text-2xl font-semibold tabular-nums">{selectedTenderUpdates.length}</div>
              <div className="text-xs text-slate-300">Updates</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="text-2xl font-semibold tabular-nums">{followUps.length}</div>
              <div className="text-xs text-slate-300">Follow-Ups</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="text-2xl font-semibold tabular-nums">{loadingHistory ? '…' : 'OK'}</div>
              <div className="text-xs text-slate-300">History load</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Tender Search</CardTitle>
            <CardDescription>Filter GTS tenders by ref no, tender number, name, client, lead, or status.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" placeholder="Search GTS tenders..." />
            </div>
            <ScrollArea className="h-[56vh] rounded-lg border">
              <div className="divide-y">
                {filteredTenders.map((opp) => (
                  <button
                    key={opp.id}
                    type="button"
                    onClick={() => setSelectedRefNo(opp.opportunityRefNo)}
                    className={`w-full px-3 py-3 text-left transition-colors hover:bg-muted/60 ${selectedTender?.id === opp.id ? 'bg-muted' : ''}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-mono text-xs text-muted-foreground">{opp.opportunityRefNo}</div>
                      <Badge variant="outline">{opp.groupClassification || 'GTS'}</Badge>
                    </div>
                    <div className="mt-1 truncate font-medium">{opp.tenderName || 'Untitled tender'}</div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">{opp.clientName || '—'}{opp.internalLead ? ` • ${opp.internalLead}` : ''}</div>
                  </button>
                ))}
                {filteredTenders.length === 0 && (
                  <div className="px-3 py-8 text-center text-sm text-muted-foreground">No GTS tenders match your search.</div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {selectedTender ? (
            <>
              <TenderSummary tender={selectedTender} updates={selectedTenderUpdates} followUps={followUps} />

              <div className="grid gap-4 xl:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <CalendarClock className="h-4 w-4" />
                      Follow-Ups
                    </CardTitle>
                    <CardDescription>Notes and handover breadcrumbs tied to this tender.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {followUps.length === 0 ? (
                      <div className="text-sm text-muted-foreground">No follow-ups yet.</div>
                    ) : (
                      <div className="space-y-2">
                        {followUps.map((row) => (
                          <div key={row.id} className="rounded-lg border bg-muted/20 p-3">
                            <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                              <span>{formatDate(row.date)}</span>
                              <span>{row.updatedBy || 'unknown'}</span>
                            </div>
                            <div className="whitespace-pre-wrap text-sm">{row.note}</div>
                          </div>
                        ))}
                      </div>
                    )}
                    <Separator />
                    <div className="space-y-3">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">Add Follow-Up</div>
                      <Input type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} />
                      <Textarea value={followUpNote} onChange={(e) => setFollowUpNote(e.target.value)} rows={3} placeholder="Write a follow-up note..." />
                      <div className="flex justify-end">
                        <Button onClick={() => void handleAddFollowUp()} disabled={savingFollowUp || !followUpNote.trim()}>
                          <Plus className="mr-2 h-4 w-4" />
                          {savingFollowUp ? 'Saving…' : 'Add Follow-Up'}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <StickyNote className="h-4 w-4" />
                      Tender Notes
                    </CardTitle>
                    <CardDescription>Use the full timeline to review status changes and project-side notes.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {selectedTender.comments || selectedTender.remarksReason || selectedTender.tenderStatusRemark ? (
                      <div className="space-y-3 text-sm">
                        {selectedTender.comments ? <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Comments</div><div className="mt-1 whitespace-pre-wrap">{selectedTender.comments}</div></div> : null}
                        {selectedTender.remarksReason ? <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Remarks / Reason</div><div className="mt-1 whitespace-pre-wrap">{selectedTender.remarksReason}</div></div> : null}
                        {selectedTender.tenderStatusRemark ? <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Status Remark</div><div className="mt-1 whitespace-pre-wrap">{selectedTender.tenderStatusRemark}</div></div> : null}
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground">No tender notes available.</div>
                    )}
                    <Separator className="my-4" />
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Project Update Timeline</div>
                    <div className="mt-3">
                      {selectedTenderUpdates.length > 0 ? <UpdateTimeline updates={selectedTenderUpdates} /> : <div className="text-sm text-muted-foreground">No project updates logged yet.</div>}
                    </div>
                    <Separator />
                    <div className="space-y-3">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">Add Project Update</div>
                      <div className="rounded-lg border p-3">
                        <AddUpdateForm
                          existingUpdates={selectedTenderUpdates}
                          onSubmit={(formData) => void handleAddProjectUpdate(formData)}
                          onCancel={() => {
                            setUpdateType('general_note');
                            setUpdateVendorName('');
                            setUpdateNotes('');
                          }}
                        />
                      </div>
                      {savingUpdate ? <div className="text-xs text-muted-foreground">Saving update…</div> : null}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </>
          ) : (
            <Card>
              <CardContent className="flex min-h-[50vh] items-center justify-center text-muted-foreground">
                Select a GTS tender to view its handover packet.
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
