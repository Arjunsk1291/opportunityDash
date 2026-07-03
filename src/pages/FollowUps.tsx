import { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';
import { Plus, Pencil, Trash2, Search, CalendarClock, Building2, StickyNote, ClipboardList } from 'lucide-react';
import { toast } from 'sonner';
import {
  type TenderFollowUp,
  getFollowUps,
  createFollowUp,
  updateFollowUp,
  deleteFollowUp,
  canWriteFollowUps,
  accentFor,
  initialsOf,
} from '@/lib/tenderFollowUps';

const API = import.meta.env.VITE_API_URL || '/api';

interface TenderOption {
  opportunityRefNo: string;
  tenderName: string;
  clientName: string;
}

type EditState = Partial<TenderFollowUp>;

const asText = (value: unknown): string => (typeof value === 'string' ? value : value == null ? '' : String(value));

const prettyDate = (iso: string): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
};

export default function FollowUps() {
  const { token, user } = useAuth();
  const canWrite = canWriteFollowUps(user?.role);

  const [rows, setRows] = useState<TenderFollowUp[]>([]);
  const [tenders, setTenders] = useState<TenderOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);
  const [tenderSearch, setTenderSearch] = useState('');

  const fetchRows = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      setRows(await getFollowUps(token));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load follow-ups');
    } finally {
      setLoading(false);
    }
  }, [token]);

  const fetchTenders = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API}/opportunities?view=lite`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json().catch(() => []);
      if (!Array.isArray(data)) return;
      const seen = new Set<string>();
      const options: TenderOption[] = [];
      for (const opp of data) {
        const refNo = asText((opp as Record<string, unknown>).opportunityRefNo).trim();
        if (!refNo || seen.has(refNo)) continue;
        seen.add(refNo);
        options.push({
          opportunityRefNo: refNo,
          tenderName: asText((opp as Record<string, unknown>).tenderName).trim(),
          clientName: asText((opp as Record<string, unknown>).clientName).trim(),
        });
      }
      options.sort((a, b) => a.opportunityRefNo.localeCompare(b.opportunityRefNo));
      setTenders(options);
    } catch {
      /* selector is best-effort */
    }
  }, [token]);

  useEffect(() => { fetchRows(); fetchTenders(); }, [fetchRows, fetchTenders]);

  const openCreate = () => { setEditing({}); setTenderSearch(''); setDialogOpen(true); };
  const openEdit = (row: TenderFollowUp) => { setEditing({ ...row }); setTenderSearch(''); setDialogOpen(true); };

  const selectTender = (opt: TenderOption) => {
    setEditing((p) => ({ ...p, opportunityRefNo: opt.opportunityRefNo, tenderName: opt.tenderName, clientName: opt.clientName }));
    setTenderSearch('');
  };

  const handleSave = async () => {
    if (!editing || !token) return;
    if (!editing.opportunityRefNo?.trim()) { toast.error('Select a tender first'); return; }
    if (!editing.note?.trim()) { toast.error('A note is required'); return; }
    setSaving(true);
    try {
      const input = {
        opportunityRefNo: editing.opportunityRefNo.trim(),
        tenderName: editing.tenderName?.trim() || '',
        clientName: editing.clientName?.trim() || '',
        date: editing.date?.trim() || '',
        note: editing.note.trim(),
      };
      if (editing.id) await updateFollowUp(token, editing.id, input);
      else await createFollowUp(token, input);
      toast.success(editing.id ? 'Follow-up updated' : 'Follow-up added');
      setDialogOpen(false);
      await fetchRows();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save follow-up');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row: TenderFollowUp) => {
    if (!token) return;
    if (!confirm(`Delete this follow-up for ${row.opportunityRefNo}?`)) return;
    try {
      await deleteFollowUp(token, row.id);
      toast.success('Follow-up deleted');
      await fetchRows();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete follow-up');
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = !q ? rows : rows.filter((r) =>
      r.opportunityRefNo.toLowerCase().includes(q) ||
      r.tenderName.toLowerCase().includes(q) ||
      r.clientName.toLowerCase().includes(q) ||
      r.note.toLowerCase().includes(q) ||
      r.updatedBy.toLowerCase().includes(q));
    return [...base].sort((a, b) => (b.date || b.createdAt || '').localeCompare(a.date || a.createdAt || ''));
  }, [rows, search]);

  const tenderMatches = useMemo(() => {
    const q = tenderSearch.trim().toLowerCase();
    if (!q) return [] as TenderOption[];
    return tenders
      .filter((t) => t.opportunityRefNo.toLowerCase().includes(q) || t.tenderName.toLowerCase().includes(q) || t.clientName.toLowerCase().includes(q))
      .slice(0, 40);
  }, [tenders, tenderSearch]);

  const tenderCount = useMemo(() => new Set(rows.map((r) => r.opportunityRefNo)).size, [rows]);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="rounded-2xl bg-gradient-to-r from-indigo-600 via-indigo-600 to-violet-600 text-white p-6 mb-6 shadow-lg shadow-indigo-200/50">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-white/15 grid place-items-center">
              <ClipboardList className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold leading-tight">Tender Follow-Ups</h1>
              <p className="text-sm text-white/80 mt-0.5">Track follow-up notes against individual tenders.</p>
            </div>
          </div>
          {canWrite && (
            <Button onClick={openCreate} className="bg-white text-indigo-700 hover:bg-white/90 shadow-sm">
              <Plus className="h-4 w-4 mr-1" /> Add Follow-Up
            </Button>
          )}
        </div>
        <div className="flex gap-6 mt-5">
          <div>
            <div className="text-2xl font-bold tabular-nums">{rows.length}</div>
            <div className="text-xs text-white/70 uppercase tracking-wide">Follow-ups</div>
          </div>
          <div className="w-px bg-white/20" />
          <div>
            <div className="text-2xl font-bold tabular-nums">{tenderCount}</div>
            <div className="text-xs text-white/70 uppercase tracking-wide">Tenders covered</div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-5 max-w-sm">
        <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search ref, tender, client, note…"
          className="pl-9"
        />
      </div>

      {loading && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-40 rounded-2xl bg-slate-100 animate-pulse" />
          ))}
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-12 text-center">
          <StickyNote className="h-8 w-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500">{rows.length === 0 ? 'No follow-ups yet.' : 'No follow-ups match your search.'}</p>
          {canWrite && rows.length === 0 && (
            <Button onClick={openCreate} size="sm" variant="outline" className="mt-3">
              <Plus className="h-4 w-4 mr-1" /> Add the first one
            </Button>
          )}
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((row) => {
            const accent = accentFor(row.opportunityRefNo);
            return (
              <div
                key={row.id}
                className="group relative flex flex-col rounded-2xl border border-slate-200 bg-white shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all overflow-hidden"
              >
                <div className={`absolute left-0 top-0 h-full w-1.5 ${accent.bar}`} />
                <div className="p-4 pl-5 flex flex-col gap-2 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ring-1 ${accent.chip}`}>
                      {row.opportunityRefNo}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                      <CalendarClock className="h-3.5 w-3.5" />
                      {prettyDate(row.date) || '—'}
                    </span>
                  </div>

                  <div>
                    <p className="text-sm font-semibold text-slate-800 leading-snug line-clamp-2" title={row.tenderName}>
                      {row.tenderName || 'Untitled tender'}
                    </p>
                    {row.clientName && (
                      <p className="inline-flex items-center gap-1 text-xs text-slate-400 mt-0.5">
                        <Building2 className="h-3 w-3" /> {row.clientName}
                      </p>
                    )}
                  </div>

                  <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap line-clamp-4 flex-1">{row.note}</p>

                  <div className="flex items-center justify-between pt-2 mt-1 border-t border-slate-100">
                    <span className="inline-flex items-center gap-1.5 text-xs text-slate-400" title={row.updatedBy}>
                      <span className={`h-5 w-5 rounded-full ${accent.dot} text-white grid place-items-center text-[9px] font-bold`}>
                        {initialsOf(row.updatedBy)}
                      </span>
                      <span className="max-w-[10rem] truncate">{row.updatedBy || 'unknown'}</span>
                    </span>
                    {canWrite && (
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => openEdit(row)} className="text-slate-400 hover:text-indigo-600 p-1" aria-label="Edit">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => handleDelete(row)} className="text-slate-400 hover:text-red-500 p-1" aria-label="Delete">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing?.id ? 'Edit Follow-Up' : 'New Follow-Up'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Tender</Label>
              {editing?.opportunityRefNo ? (
                <div className="flex items-center justify-between gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm">
                  <span className="truncate">
                    <span className="font-medium text-slate-800">{editing.opportunityRefNo}</span>
                    {editing.tenderName ? <span className="text-slate-500"> — {editing.tenderName}</span> : null}
                  </span>
                  <button
                    type="button"
                    className="text-xs text-slate-400 hover:text-slate-700 shrink-0"
                    onClick={() => setEditing((p) => ({ ...p, opportunityRefNo: '', tenderName: '', clientName: '' }))}
                  >
                    Change
                  </button>
                </div>
              ) : (
                <>
                  <Input
                    value={tenderSearch}
                    onChange={(e) => setTenderSearch(e.target.value)}
                    placeholder="Search tender by ref, name, or client…"
                  />
                  {tenderMatches.length > 0 && (
                    <div className="mt-1 max-h-48 overflow-auto rounded-md border border-slate-200 bg-white shadow-sm">
                      {tenderMatches.map((opt) => (
                        <button
                          key={opt.opportunityRefNo}
                          type="button"
                          onClick={() => selectTender(opt)}
                          className="w-full text-left px-3 py-1.5 text-sm hover:bg-slate-50 border-b border-slate-100 last:border-b-0"
                        >
                          <span className="font-medium text-slate-800">{opt.opportunityRefNo}</span>
                          {opt.tenderName ? <span className="text-slate-500"> — {opt.tenderName}</span> : null}
                          {opt.clientName ? <span className="block text-xs text-slate-400">{opt.clientName}</span> : null}
                        </button>
                      ))}
                    </div>
                  )}
                  {tenderSearch.trim() && tenderMatches.length === 0 && (
                    <p className="mt-1 text-xs text-slate-400">No matching tenders.</p>
                  )}
                </>
              )}
            </div>
            <div>
              <Label>Date</Label>
              <Input type="date" value={editing?.date || ''} onChange={(e) => setEditing((p) => ({ ...p, date: e.target.value }))} />
            </div>
            <div>
              <Label>Note</Label>
              <Textarea
                value={editing?.note || ''}
                onChange={(e) => setEditing((p) => ({ ...p, note: e.target.value }))}
                rows={4}
                placeholder="Follow-up details…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !editing?.opportunityRefNo?.trim() || !editing?.note?.trim()}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
