import { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/contexts/AuthContext';
import { Plus, Pencil, Trash2, Search } from 'lucide-react';
import { toast } from 'sonner';

const API = import.meta.env.VITE_API_URL || '/api';

// Roles allowed to create/edit/delete follow-ups. Mirrors the backend
// DEFAULT_ACTION_ROLE_ACCESS.tender_follow_ups_write list; the backend is the
// real enforcement boundary — this only controls whether write UI is shown.
const WRITE_ROLES = ['Master', 'Admin', 'ProposalHead', 'SVP', 'BDTeam'];

interface FollowUp {
  id: string;
  opportunityRefNo: string;
  tenderName: string;
  clientName: string;
  date: string;
  note: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

interface TenderOption {
  opportunityRefNo: string;
  tenderName: string;
  clientName: string;
}

const BLANK: Partial<FollowUp> = {
  opportunityRefNo: '', tenderName: '', clientName: '', date: '', note: '',
};

const asText = (value: unknown): string => (typeof value === 'string' ? value : value == null ? '' : String(value));

export default function FollowUps() {
  const { token, user } = useAuth();
  const canWrite = !!user && WRITE_ROLES.includes(user.role);

  const [rows, setRows] = useState<FollowUp[]>([]);
  const [tenders, setTenders] = useState<TenderOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<FollowUp> | null>(null);
  const [saving, setSaving] = useState(false);
  const [tenderSearch, setTenderSearch] = useState('');

  const fetchRows = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/tender-follow-ups`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json().catch(() => []);
      if (!res.ok) throw new Error(data?.error || 'Failed to load follow-ups');
      setRows(Array.isArray(data) ? data : []);
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
      // Selector is best-effort; the ref can still be seen on existing rows.
    }
  }, [token]);

  useEffect(() => { fetchRows(); fetchTenders(); }, [fetchRows, fetchTenders]);

  const openCreate = () => { setEditing({ ...BLANK }); setTenderSearch(''); setDialogOpen(true); };
  const openEdit = (row: FollowUp) => { setEditing({ ...row }); setTenderSearch(''); setDialogOpen(true); };

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
      const isNew = !editing.id;
      const res = await fetch(
        isNew ? `${API}/tender-follow-ups` : `${API}/tender-follow-ups/${editing.id}`,
        {
          method: isNew ? 'POST' : 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            opportunityRefNo: editing.opportunityRefNo?.trim(),
            tenderName: editing.tenderName?.trim() || '',
            clientName: editing.clientName?.trim() || '',
            date: editing.date?.trim() || '',
            note: editing.note?.trim() || '',
          }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Failed to save follow-up');
      toast.success(isNew ? 'Follow-up added' : 'Follow-up updated');
      setDialogOpen(false);
      await fetchRows();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save follow-up');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row: FollowUp) => {
    if (!token) return;
    if (!confirm(`Delete this follow-up for ${row.opportunityRefNo}?`)) return;
    try {
      const res = await fetch(`${API}/tender-follow-ups/${row.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Failed to delete follow-up');
      toast.success('Follow-up deleted');
      await fetchRows();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete follow-up');
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      r.opportunityRefNo.toLowerCase().includes(q) ||
      r.tenderName.toLowerCase().includes(q) ||
      r.clientName.toLowerCase().includes(q) ||
      r.note.toLowerCase().includes(q) ||
      r.updatedBy.toLowerCase().includes(q)
    );
  }, [rows, search]);

  const tenderMatches = useMemo(() => {
    const q = tenderSearch.trim().toLowerCase();
    if (!q) return [] as TenderOption[];
    return tenders
      .filter((t) => t.opportunityRefNo.toLowerCase().includes(q) || t.tenderName.toLowerCase().includes(q) || t.clientName.toLowerCase().includes(q))
      .slice(0, 40);
  }, [tenders, tenderSearch]);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Tender Follow-Ups</h1>
          <p className="text-sm text-slate-500 mt-1">Follow-up notes tracked against individual tenders.</p>
        </div>
        {canWrite && (
          <Button onClick={openCreate} size="sm">
            <Plus className="h-4 w-4 mr-1" /> Add Follow-Up
          </Button>
        )}
      </div>

      <div className="relative mb-4 max-w-sm">
        <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search ref, tender, client, note…"
          className="pl-9"
        />
      </div>

      {loading && <p className="text-slate-400 text-sm">Loading…</p>}

      {!loading && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">Date</TableHead>
                <TableHead className="w-32">Tender Ref</TableHead>
                <TableHead>Tender</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Note</TableHead>
                <TableHead className="w-44">Added By</TableHead>
                {canWrite && <TableHead className="w-20 text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={canWrite ? 7 : 6} className="text-center text-slate-400 py-8 text-sm">
                    {rows.length === 0 ? 'No follow-ups yet.' : 'No follow-ups match your search.'}
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="text-sm text-slate-600">{row.date || '—'}</TableCell>
                  <TableCell className="text-sm font-medium text-slate-800">{row.opportunityRefNo}</TableCell>
                  <TableCell className="text-sm text-slate-600 max-w-[16rem] truncate" title={row.tenderName}>{row.tenderName || '—'}</TableCell>
                  <TableCell className="text-sm text-slate-600">{row.clientName || '—'}</TableCell>
                  <TableCell className="text-sm text-slate-600 max-w-[22rem] whitespace-pre-wrap">{row.note}</TableCell>
                  <TableCell className="text-xs text-slate-500">{row.updatedBy || '—'}</TableCell>
                  {canWrite && (
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => openEdit(row)} className="text-slate-400 hover:text-slate-700 p-0.5" aria-label="Edit">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => handleDelete(row)} className="text-slate-400 hover:text-red-500 p-0.5" aria-label="Delete">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

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
              <Input
                type="date"
                value={editing?.date || ''}
                onChange={(e) => setEditing((p) => ({ ...p, date: e.target.value }))}
              />
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
