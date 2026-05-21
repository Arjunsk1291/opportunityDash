import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { CalendarIcon, Copy, Eye, EyeOff, FileDown, FileUp, Plus, Search, Trash2, Pencil, AlertTriangle, Building2, ListChecks } from 'lucide-react';

import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';

const API_URL = import.meta.env.VITE_API_URL || '/api';

type PqStatus = 'Prequalified' | 'Registered' | 'Registration on Process';

type PqActivityRow = {
  id: string;
  sNo: number;
  company: string;
  status: PqStatus;
  registeredEmail: string;
  userId: string;
  password: string;
  link: string;
  renewalDate: string | null;
  lastUpdateDate: string | null;
  notes: string;
  createdAt?: string;
  updatedAt?: string;
};

const STATUS_OPTIONS: Array<{ value: PqStatus | 'All'; label: string }> = [
  { value: 'All', label: 'All statuses' },
  { value: 'Prequalified', label: 'Prequalified' },
  { value: 'Registered', label: 'Registered' },
  { value: 'Registration on Process', label: 'Registration on Process' },
];

const STATUS_ORDER: Record<PqStatus, number> = {
  'Prequalified': 0,
  'Registered': 1,
  'Registration on Process': 2,
};

const pqFormSchema = z.object({
  sNo: z.coerce.number().int().nonnegative().optional().default(0),
  company: z.string().trim().min(1, 'Company is required').max(120),
  status: z.enum(['Prequalified', 'Registered', 'Registration on Process']).default('Registration on Process'),
  registeredEmail: z.string().trim().max(200).optional().default(''),
  userId: z.string().trim().max(200).optional().default('-'),
  password: z.string().max(500).optional().default(''),
  link: z.string().trim().max(800).optional().default('-'),
  lastUpdateDate: z.date().nullable().optional().default(null),
  notes: z.string().trim().max(1000).optional().default(''),
});

type PqFormValues = z.infer<typeof pqFormSchema>;

const formatIsoDate = (value?: string | null) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toISOString().slice(0, 10);
};

const safeUrl = (value: string) => {
  const raw = String(value || '').trim();
  if (!raw || raw === '-') return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
};

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export default function PqActivities() {
  const { token, canPerformAction } = useAuth();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [rows, setRows] = useState<PqActivityRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState<PqStatus | 'All'>('All');

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [passwordVisibleFor, setPasswordVisibleFor] = useState<Record<string, boolean>>({});

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<PqActivityRow | null>(null);
  const [activeTab, setActiveTab] = useState<'entries' | 'bulk'>('entries');
  const [showStaleOnly, setShowStaleOnly] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [bulkPreview, setBulkPreview] = useState<Array<Partial<PqActivityRow> & { _line: number; _error?: string }>>([]);
  const [bulkSaving, setBulkSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<PqActivityRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const form = useForm<PqFormValues>({
    resolver: zodResolver(pqFormSchema),
    defaultValues: {
      sNo: 0,
      company: '',
      status: 'Registration on Process',
      registeredEmail: '',
      userId: '-',
      password: '',
      link: '-',
      lastUpdateDate: new Date(),
      notes: '',
    },
  });

  const canView = canPerformAction('pq_activities_view');
  const canWrite = canPerformAction('pq_activities_manage');

  const getRowLastUpdateMs = (row: PqActivityRow) => {
    // Notice-board reminder should be driven by the explicit "Last Update Date"
    // field, not by Mongo's updatedAt (which changes on any edit/import).
    const raw = row.lastUpdateDate || null;
    if (!raw) return null;
    const ms = new Date(raw).getTime();
    return Number.isNaN(ms) ? null : ms;
  };

  const isRowStale = (row: PqActivityRow, nowMs = Date.now()) => {
    const lastMs = getRowLastUpdateMs(row);
    if (!lastMs) return true;
    return (nowMs - lastMs) > THIRTY_DAYS_MS;
  };

  const staleRows = useMemo(() => {
    const now = Date.now();
    return rows.filter((row) => isRowStale(row, now));
  }, [rows]);

  const stats = useMemo(() => {
    const total = rows.length;
    const prequalified = rows.filter((r) => r.status === 'Prequalified').length;
    const registered = rows.filter((r) => r.status === 'Registered').length;
    const inProcess = rows.filter((r) => r.status === 'Registration on Process').length;
    return { total, prequalified, registered, inProcess };
  }, [rows]);

  const filteredRows = useMemo(() => {
    const now = Date.now();
    const normalizedQ = q.trim().toLowerCase();
    const filtered = rows.filter((r) => {
      if (showStaleOnly && !isRowStale(r, now)) return false;
      if (statusFilter !== 'All' && r.status !== statusFilter) return false;
      if (!normalizedQ) return true;
      return (
        String(r.company || '').toLowerCase().includes(normalizedQ)
        || String(r.registeredEmail || '').toLowerCase().includes(normalizedQ)
      );
    });

    // Deduplicate identical rows for display (keep most recently updated).
    const seen = new Map<string, PqActivityRow>();
    for (const row of filtered) {
      const key = [
        row.company,
        row.status,
        row.registeredEmail,
        row.userId,
        row.password,
        row.link,
        row.lastUpdateDate,
        row.notes,
      ].map((v) => String(v ?? '').trim()).join('|');
      const existing = seen.get(key);
      if (!existing) {
        seen.set(key, row);
        continue;
      }
      const existingTs = existing.updatedAt ? new Date(existing.updatedAt).getTime() : 0;
      const rowTs = row.updatedAt ? new Date(row.updatedAt).getTime() : 0;
      if (rowTs >= existingTs) seen.set(key, row);
    }

    return Array.from(seen.values()).sort((a, b) => {
      const aNo = Number.isFinite(a.sNo) ? a.sNo : Number.MAX_SAFE_INTEGER;
      const bNo = Number.isFinite(b.sNo) ? b.sNo : Number.MAX_SAFE_INTEGER;
      if (aNo !== bNo) return aNo - bNo;
      const aOrder = STATUS_ORDER[a.status] ?? 99;
      const bOrder = STATUS_ORDER[b.status] ?? 99;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return String(a.company || '').localeCompare(String(b.company || ''), undefined, { sensitivity: 'base' });
    });
  }, [rows, q, statusFilter, showStaleOnly]);

  const parseBulkText = (input: string) => {
    const lines = String(input || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'));

    return lines.map((line, idx) => {
      const parts = line.includes('\t') ? line.split('\t') : line.split(',');
      const [companyRaw, statusRaw, emailRaw, userIdRaw, passwordRaw, linkRaw, lastUpdateRaw, notesRaw] = parts.map((p) => String(p ?? '').trim());
      const company = companyRaw;
      if (!company) return { _line: idx + 1, _error: 'Missing company name' };

      const statusCandidate = statusRaw as PqStatus;
      const status: PqStatus = (['Prequalified', 'Registered', 'Registration on Process'] as const).includes(statusCandidate)
        ? statusCandidate
        : 'Registration on Process';

      const lastUpdateDate = lastUpdateRaw
        ? (() => {
          const d = new Date(lastUpdateRaw);
          return Number.isNaN(d.getTime()) ? null : d.toISOString();
        })()
        : null;

      return {
        _line: idx + 1,
        company,
        status,
        registeredEmail: emailRaw || '',
        userId: userIdRaw || '-',
        password: passwordRaw || '',
        link: linkRaw || '-',
        lastUpdateDate,
        notes: notesRaw || '',
      };
    });
  };

  useEffect(() => {
    if (activeTab !== 'bulk') return;
    setBulkPreview(parseBulkText(bulkText));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bulkText, activeTab]);

  const statusBadgeClass = (status: PqStatus) => {
    switch (status) {
      case 'Prequalified':
        return 'bg-warning text-warning-foreground border border-warning/20';
      case 'Registered':
        return 'bg-accent text-accent-foreground border border-accent/20';
      case 'Registration on Process':
      default:
        return 'bg-info text-info-foreground border border-info/20';
    }
  };

  const loadRows = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (q.trim()) qs.set('q', q.trim());
      if (statusFilter !== 'All') qs.set('status', statusFilter);

      const res = await fetch(`${API_URL}/pq-activities?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to load PQ activities');
      setRows(Array.isArray(data.rows) ? data.rows : []);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const openCreate = () => {
    setEditing(null);
    form.reset({
      sNo: 0,
      company: '',
      status: 'Registration on Process',
      registeredEmail: '',
      userId: '-',
      password: '',
      link: '-',
      lastUpdateDate: new Date(),
      notes: '',
    });
    setSheetOpen(true);
  };

  const openEdit = (row: PqActivityRow) => {
    setEditing(row);
    form.reset({
      sNo: row.sNo ?? 0,
      company: row.company || '',
      status: row.status || 'Registration on Process',
      registeredEmail: row.registeredEmail || '',
      userId: row.userId || '-',
      password: row.password || '',
      link: row.link || '-',
      lastUpdateDate: row.lastUpdateDate ? new Date(row.lastUpdateDate) : (row.updatedAt ? new Date(row.updatedAt) : null),
      notes: row.notes || '',
    });
    setSheetOpen(true);
  };

  const submitForm = async (values: PqFormValues) => {
    if (!token || !canWrite) return;
    try {
      let nextLastUpdateDate = values.lastUpdateDate ? new Date(values.lastUpdateDate) : null;
      if (editing) {
        const notesChanged = String(values.notes || '') !== String(editing.notes || '');
        if (notesChanged) {
          const bump = window.confirm('You updated Notes. Change Last Update date to today?');
          if (bump) nextLastUpdateDate = new Date();
        }
      } else {
        nextLastUpdateDate = new Date();
      }
      const payload = {
        ...values,
        lastUpdateDate: nextLastUpdateDate ? nextLastUpdateDate.toISOString() : null,
      };

      const url = editing ? `${API_URL}/pq-activities/${editing.id}` : `${API_URL}/pq-activities`;
      const method = editing ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Save failed');
      toast.success(editing ? 'Entry updated' : 'Entry created');
      setSheetOpen(false);
      await loadRows();
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const commitBulkAdd = async () => {
    if (!token || !canWrite) return;
    const preview = parseBulkText(bulkText);
    const valid = preview.filter((row) => !row._error) as Array<Partial<PqActivityRow> & { _line: number }>;
    if (valid.length === 0) {
      toast.error('No valid rows to add.');
      return;
    }
    setBulkSaving(true);
    try {
      let created = 0;
      for (const row of valid) {
        const payload = {
          company: row.company,
          status: row.status,
          registeredEmail: row.registeredEmail || '',
          userId: row.userId || '-',
          password: row.password || '',
          link: row.link || '-',
          lastUpdateDate: row.lastUpdateDate || null,
          notes: row.notes || '',
        };
        const res = await fetch(`${API_URL}/pq-activities`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(`Line ${row._line}: ${data?.error || 'Create failed'}`);
        created += 1;
      }
      toast.success(`Added ${created} compan${created === 1 ? 'y' : 'ies'}.`);
      setBulkText('');
      setBulkPreview([]);
      setActiveTab('entries');
      await loadRows();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBulkSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!token || !deleteTarget || !canWrite) return;
    setDeleting(true);
    try {
      const res = await fetch(`${API_URL}/pq-activities/${deleteTarget.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Delete failed');
      toast.success('Entry deleted');
      setDeleteTarget(null);
      if (expandedId === deleteTarget.id) setExpandedId(null);
      await loadRows();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setDeleting(false);
    }
  };

  const onPickImportFile = () => fileInputRef.current?.click();

  const importXlsx = async (file: File) => {
    if (!token || !canWrite) return;
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      toast.error('Please select a .xlsx file');
      return;
    }
    try {
      setLoading(true);
      const body = await file.arrayBuffer();
      const res = await fetch(`${API_URL}/pq-activities/import`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/octet-stream',
        },
        body,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Import failed');
      toast.success(`Imported: added ${data.added || 0}, updated ${data.updated || 0}`);
      await loadRows();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const exportXlsx = async () => {
    if (!token || !canView) return;
    try {
      const res = await fetch(`${API_URL}/pq-activities/export`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Export failed');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pq-activities-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('Export started');
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const togglePasswordVisibility = (id: string) => {
    setPasswordVisibleFor((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const copyText = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(String(value || ''));
      toast.success(`${label} copied`);
    } catch {
      toast.error('Copy failed');
    }
  };

  return (
    <div className="min-h-[calc(100vh-64px)] bg-background text-foreground">
      <div className="mx-auto max-w-7xl px-3 sm:px-6 py-6 sm:py-10">
        <header className="flex flex-col gap-2">
          <h1 className="font-display text-2xl sm:text-3xl md:text-4xl tracking-tight">Pre-Qualification</h1>
          <p className="text-sm sm:text-base text-navytrust-foreground/80 max-w-2xl">
            Track supplier portal prequalification and registration credentials with safe, role-gated access.
          </p>
        </header>

        <div className="mt-5">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
            <TabsList className="bg-navytrust-elevated/40 border border-white/10">
              <TabsTrigger value="entries" className="gap-2">
                <ListChecks className="h-4 w-4" aria-hidden="true" />
                Entries
              </TabsTrigger>
              <TabsTrigger value="bulk" className="gap-2">
                <Building2 className="h-4 w-4" aria-hidden="true" />
                Add Companies (Bulk)
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {activeTab === 'entries' ? (
        <>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mt-6">
          <Card className="rounded-2xl bg-navytrust-surface/40 backdrop-blur border-white/10 shadow-elegant">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs tracking-[0.24em] uppercase text-navytrust-foreground/70">Total</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">{stats.total}</CardContent>
          </Card>
          <Card className="rounded-2xl bg-navytrust-surface/40 backdrop-blur border-white/10 shadow-elegant">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs tracking-[0.24em] uppercase text-navytrust-foreground/70 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-navytrust-gold shadow-nt-gold animate-pulse" aria-hidden="true" />
                Prequalified
              </CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">{stats.prequalified}</CardContent>
          </Card>
          <Card className="rounded-2xl bg-navytrust-surface/40 backdrop-blur border-white/10 shadow-elegant">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs tracking-[0.24em] uppercase text-navytrust-foreground/70">Registered</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">{stats.registered}</CardContent>
          </Card>
          <Card className="rounded-2xl bg-navytrust-surface/40 backdrop-blur border-white/10 shadow-elegant">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs tracking-[0.24em] uppercase text-navytrust-foreground/70">In Process</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">{stats.inProcess}</CardContent>
          </Card>
        </div>
        </>
        ) : (
          <div className="mt-6 rounded-2xl bg-navytrust-surface/35 backdrop-blur border border-white/10 shadow-elegant p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-lg font-semibold text-navytrust-foreground">Add Companies (Bulk)</div>
                <div className="text-xs text-navytrust-foreground/70 mt-1">
                  Paste one company per line. Columns (comma or tab): company, status, email, userId, password, link, lastUpdateDate, notes.
                </div>
              </div>
              <Button
                type="button"
                className="bg-navytrust-primary hover:bg-navytrust-primary/90 text-white shadow-nt-glow"
                onClick={commitBulkAdd}
                disabled={!canWrite || bulkSaving}
              >
                {bulkSaving ? 'Saving…' : 'Create'}
              </Button>
            </div>

            <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div>
                <Textarea
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                  className="min-h-[260px] bg-navytrust-elevated/30 border-white/10 text-navytrust-foreground"
                  placeholder={"Acme Co, Registered, buyer@acme.com, buyer, pass123, https://portal.example.com, 2026-01-15, renewal pending\nAnother Co, Registration on Process"}
                />
                <div className="mt-2 text-xs text-navytrust-foreground/70">
                  Tip: use “Import .xlsx” in Entries for large structured imports.
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-navytrust-elevated/20 overflow-hidden">
                <div className="px-4 py-3 border-b border-white/10 text-sm font-semibold text-navytrust-foreground">
                  Preview ({bulkPreview.filter((r) => !r._error).length} valid / {bulkPreview.length} total)
                </div>
                <div className="max-h-[320px] overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-navytrust-elevated/25">
                      <tr className="text-left text-navytrust-foreground/80">
                        <th className="px-3 py-2 w-12">#</th>
                        <th className="px-3 py-2">Company</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2">Last Update</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bulkPreview.slice(0, 50).map((row) => (
                        <tr key={row._line} className="border-t border-white/10">
                          <td className="px-3 py-2 text-navytrust-foreground/70">{row._line}</td>
                          <td className="px-3 py-2">
                            <div className="text-navytrust-foreground">{row.company || '—'}</div>
                            {row._error && <div className="text-xs text-warning">{row._error}</div>}
                          </td>
                          <td className="px-3 py-2 text-navytrust-foreground/90">{String(row.status || '—')}</td>
                          <td className="px-3 py-2 text-navytrust-foreground/70">{formatIsoDate((row as any).lastUpdateDate || null)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {bulkPreview.length > 50 && (
                  <div className="px-4 py-2 text-xs text-navytrust-foreground/70 border-t border-white/10">
                    Showing first 50 lines.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'entries' && (
        <>
        <div className="mt-6 rounded-2xl bg-navytrust-surface/35 backdrop-blur border border-white/10 shadow-elegant p-3 sm:p-4">
          <div className="flex flex-col lg:flex-row lg:items-center gap-3">
            <div className="flex-1 flex items-center gap-2">
              <div className="relative w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-navytrust-foreground/70" aria-hidden="true" />
                <Input
                  className="pl-9 bg-navytrust-elevated/40 border-white/10 text-navytrust-foreground placeholder:text-navytrust-foreground/60"
                  placeholder="Search company or email…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  aria-label="Search company or email"
                />
              </div>
              <Button variant="secondary" className="bg-navytrust-elevated/50 border border-white/10 text-navytrust-foreground hover:bg-navytrust-elevated/70" onClick={loadRows} disabled={loading}>
                Refresh
              </Button>
            </div>

            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
                <SelectTrigger className="bg-navytrust-elevated/40 border-white/10 text-navytrust-foreground">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) importXlsx(file);
                  e.currentTarget.value = '';
                }}
              />

              <Button variant="secondary" className="w-full sm:w-auto bg-navytrust-elevated/50 border border-white/10 text-navytrust-foreground hover:bg-navytrust-elevated/70 gap-2" onClick={onPickImportFile} disabled={loading || !canWrite}>
                <FileUp className="h-4 w-4" aria-hidden="true" />
                Import .xlsx
              </Button>
              <Button variant="secondary" className="w-full sm:w-auto bg-navytrust-elevated/50 border border-white/10 text-navytrust-foreground hover:bg-navytrust-elevated/70 gap-2" onClick={exportXlsx} disabled={loading || !canView}>
                <FileDown className="h-4 w-4" aria-hidden="true" />
                Export .xlsx
              </Button>
              <Button className="w-full sm:w-auto bg-navytrust-primary hover:bg-navytrust-primary/90 text-white gap-2 shadow-nt-glow" onClick={openCreate} disabled={!canWrite}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add Entry
              </Button>
            </div>
          </div>
        </div>

        <div className="mt-6">
          <Card className="rounded-2xl bg-navytrust-surface/40 backdrop-blur border border-warning/25 shadow-elegant">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle className="text-xs tracking-[0.24em] uppercase text-navytrust-foreground/70 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-warning" aria-hidden="true" />
                    Notice Board
                  </CardTitle>
                  <div className="mt-1 text-2xl font-semibold text-navytrust-foreground">
                    {staleRows.length}
                    <span className="ml-2 text-sm font-normal text-navytrust-foreground/70">not updated in 30+ days</span>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  className="bg-navytrust-elevated/50 border border-white/10 text-navytrust-foreground hover:bg-navytrust-elevated/70"
                  onClick={() => setShowStaleOnly((v) => !v)}
                >
                  {showStaleOnly ? 'Show all' : 'View stale'}
                </Button>
              </div>
            </CardHeader>
            {staleRows.length > 0 && (
              <CardContent className="pt-0">
                <div className="text-xs text-navytrust-foreground/70 mb-2">Top stale companies</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {staleRows.slice(0, 8).map((row) => (
                    <button
                      key={row.id}
                      type="button"
                      className="rounded-xl border border-white/10 bg-navytrust-elevated/30 hover:bg-navytrust-elevated/45 px-3 py-2 text-left"
                      onClick={() => {
                        setQ(row.company || '');
                        setExpandedId(row.id);
                      }}
                    >
                      <div className="font-medium text-navytrust-foreground truncate">{row.company || '—'}</div>
                      <div className="text-xs text-navytrust-foreground/70">
                        Last update: {formatIsoDate(row.lastUpdateDate || null)}
                      </div>
                    </button>
                  ))}
                </div>
                {staleRows.length > 8 && (
                  <div className="mt-3 text-xs text-navytrust-foreground/70">
                    +{staleRows.length - 8} more (use “View stale” to filter the table)
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        </div>

        {/* Desktop table */}
        <div className="hidden md:block mt-6">
          <div className="rounded-2xl border border-white/10 bg-navytrust-surface/25 backdrop-blur shadow-elegant overflow-hidden">
            <table className="w-full text-sm" aria-label="PQ activities table">
              <thead className="bg-navytrust-elevated/35">
                <tr className="text-left text-navytrust-foreground/80">
                  <th className="px-4 py-3 font-semibold">#</th>
                  <th className="px-4 py-3 font-semibold">Company</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Registered Email</th>
                  <th className="px-4 py-3 font-semibold">Last Update</th>
                  <th className="px-4 py-3 font-semibold">Notes</th>
                  <th className="px-4 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence initial={false}>
                  {filteredRows.map((row, idx) => {
                    const expanded = expandedId === row.id;
                    const isPreq = row.status === 'Prequalified';
                    return (
                      <motion.tr
                        key={row.id}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 6 }}
                        transition={{ duration: 0.18, delay: Math.min(idx * 0.012, 0.12) }}
                        className="border-t border-white/10 hover:bg-white/5 cursor-pointer"
                        onClick={() => setExpandedId((cur) => (cur === row.id ? null : row.id))}
                      >
                        <td className="px-4 py-3 text-navytrust-foreground/80">{row.sNo || idx + 1}</td>
                        <td className="px-4 py-3 font-medium text-navytrust-foreground">{row.company}</td>
                        <td className="px-4 py-3">
                          <Badge className={statusBadgeClass(row.status)}>
                            {isPreq && <span className="mr-2 inline-block h-2 w-2 rounded-full bg-warning" aria-hidden="true" />}
                            {row.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-navytrust-foreground/90">{row.registeredEmail || '—'}</td>
                        <td className="px-4 py-3 text-navytrust-foreground/90">
                          <div className="flex items-center gap-2">
                            <span>{formatIsoDate(row.lastUpdateDate || row.updatedAt || null)}</span>
                            {isRowStale(row) && (
                              <Badge className="bg-warning/20 text-warning border border-warning/30">Reminder</Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-navytrust-foreground/80 max-w-[320px] truncate">{row.notes || '—'}</td>
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <div className="flex justify-end gap-2">
                            <Button size="icon" variant="secondary" className="bg-navytrust-elevated/45 border border-white/10 hover:bg-navytrust-elevated/70" onClick={() => openEdit(row)} aria-label={`Edit ${row.company}`} disabled={!canWrite}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="destructive" className="bg-red-500/80 hover:bg-red-500" onClick={() => setDeleteTarget(row)} aria-label={`Delete ${row.company}`} disabled={!canWrite}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
              </tbody>
            </table>
          </div>

          <AnimatePresence initial={false}>
            {expandedId ? (
              <motion.div
                key={expandedId}
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.22 }}
                className="mt-3 rounded-2xl border border-white/10 bg-navytrust-surface/28 backdrop-blur shadow-elegant overflow-hidden"
              >
                {(() => {
                  const row = rows.find((r) => r.id === expandedId);
                  if (!row) return null;
                  const showPassword = Boolean(passwordVisibleFor[row.id]);
                  const url = safeUrl(row.link);
                  return (
                    <div className="p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="font-semibold text-navytrust-foreground">Portal Credentials</p>
                          <div className="text-xs text-navytrust-foreground/70">Updated: {formatIsoDate(row.updatedAt || null)}</div>
                        </div>
                        <div className="rounded-2xl bg-navytrust-elevated/35 border border-white/10 p-4 space-y-3">
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <div className="text-xs uppercase tracking-[0.18em] text-navytrust-foreground/70">User ID</div>
                              <div className="mt-1 font-mono text-navytrust-foreground">{row.userId || '—'}</div>
                            </div>
                            <Button size="icon" variant="secondary" className="bg-navytrust-elevated/55 border border-white/10 hover:bg-navytrust-elevated/75" onClick={() => copyText(row.userId, 'User ID')} aria-label="Copy User ID">
                              <Copy className="h-4 w-4" />
                            </Button>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <div className="text-xs uppercase tracking-[0.18em] text-navytrust-foreground/70">Password</div>
                              <div className="mt-1 font-mono text-navytrust-foreground">{showPassword ? (row.password || '—') : (row.password ? '••••••••' : '—')}</div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button size="icon" variant="secondary" className="bg-navytrust-elevated/55 border border-white/10 hover:bg-navytrust-elevated/75" onClick={() => togglePasswordVisibility(row.id)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
                                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </Button>
                              <Button size="icon" variant="secondary" className="bg-navytrust-elevated/55 border border-white/10 hover:bg-navytrust-elevated/75" onClick={() => copyText(row.password, 'Password')} aria-label="Copy password">
                                <Copy className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <div className="text-xs uppercase tracking-[0.18em] text-navytrust-foreground/70">Portal Link</div>
                              <div className="mt-1 text-navytrust-foreground">
                                {url ? (
                                  <a className="underline decoration-white/30 hover:decoration-white/70" href={url} target="_blank" rel="noreferrer">
                                    {row.link}
                                  </a>
                                ) : '—'}
                              </div>
                            </div>
                            <Button size="icon" variant="secondary" className="bg-navytrust-elevated/55 border border-white/10 hover:bg-navytrust-elevated/75" onClick={() => copyText(row.link, 'Portal link')} aria-label="Copy portal link">
                              <Copy className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <p className="font-semibold text-navytrust-foreground">Details</p>
                        <div className="rounded-2xl bg-navytrust-elevated/35 border border-white/10 p-4 space-y-3">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <div className="text-xs uppercase tracking-[0.18em] text-navytrust-foreground/70">Last Update</div>
                              <div className="mt-1 flex items-center gap-2 text-navytrust-foreground">
                                <span>{formatIsoDate(row.lastUpdateDate || row.updatedAt || null)}</span>
                                {isRowStale(row) && (
                                  <Badge className="bg-warning/20 text-warning border border-warning/30">Reminder</Badge>
                                )}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs uppercase tracking-[0.18em] text-navytrust-foreground/70">Last Update</div>
                              <div className="mt-1 text-navytrust-foreground">{formatIsoDate(row.updatedAt || null)}</div>
                            </div>
                          </div>
                          <div>
                            <div className="text-xs uppercase tracking-[0.18em] text-navytrust-foreground/70">Notes</div>
                            <div className="mt-1 whitespace-pre-wrap text-navytrust-foreground/90">{row.notes || '—'}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden mt-6 space-y-3">
          <AnimatePresence initial={false}>
            {filteredRows.map((row, idx) => {
              const expanded = expandedId === row.id;
              const isPreq = row.status === 'Prequalified';
              return (
                <motion.div
                  key={row.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                  transition={{ duration: 0.18, delay: Math.min(idx * 0.01, 0.12) }}
                  className="rounded-2xl border border-white/10 bg-navytrust-surface/28 backdrop-blur shadow-elegant overflow-hidden"
                >
                  <button
                    type="button"
                    className="w-full text-left p-4"
                    onClick={() => setExpandedId((cur) => (cur === row.id ? null : row.id))}
                    aria-label={`Toggle details for ${row.company}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs uppercase tracking-[0.18em] text-navytrust-foreground/70">Company</div>
                        <div className="mt-1 font-semibold text-navytrust-foreground truncate">{row.company}</div>
                        <div className="mt-2 flex flex-wrap gap-2 items-center">
                          <Badge className={statusBadgeClass(row.status)}>
                            {isPreq && <span className="mr-2 inline-block h-2 w-2 rounded-full bg-warning" aria-hidden="true" />}
                            {row.status}
                          </Badge>
                          <span className="text-xs text-navytrust-foreground/70">#{row.sNo || idx + 1}</span>
                        </div>
                      </div>
                      <div className="flex gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <Button size="icon" variant="secondary" className="bg-navytrust-elevated/45 border border-white/10 hover:bg-navytrust-elevated/70" onClick={() => openEdit(row)} aria-label={`Edit ${row.company}`} disabled={!canWrite}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="destructive" className="bg-red-500/80 hover:bg-red-500" onClick={() => setDeleteTarget(row)} aria-label={`Delete ${row.company}`} disabled={!canWrite}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="mt-3 text-sm text-navytrust-foreground/90 truncate">{row.registeredEmail || '—'}</div>
                    <div className="text-xs text-navytrust-foreground/70 truncate">Last update: {formatIsoDate(row.lastUpdateDate || row.updatedAt || null)}</div>
                  </button>

                  <AnimatePresence initial={false}>
                    {expanded ? (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.22 }}
                        className="border-t border-white/10 px-4 pb-4"
                      >
                        <div className="pt-4 space-y-3">
                          <div className="rounded-2xl bg-navytrust-elevated/35 border border-white/10 p-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs uppercase tracking-[0.18em] text-navytrust-foreground/70">User ID</span>
                              <Button size="icon" variant="secondary" className="bg-navytrust-elevated/55 border border-white/10 hover:bg-navytrust-elevated/75" onClick={() => copyText(row.userId, 'User ID')} aria-label="Copy User ID">
                                <Copy className="h-4 w-4" />
                              </Button>
                            </div>
                            <div className="font-mono text-sm text-navytrust-foreground">{row.userId || '—'}</div>
                          </div>
                          <div className="rounded-2xl bg-navytrust-elevated/35 border border-white/10 p-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs uppercase tracking-[0.18em] text-navytrust-foreground/70">Password</span>
                              <div className="flex gap-2">
                                <Button size="icon" variant="secondary" className="bg-navytrust-elevated/55 border border-white/10 hover:bg-navytrust-elevated/75" onClick={() => togglePasswordVisibility(row.id)} aria-label={passwordVisibleFor[row.id] ? 'Hide password' : 'Show password'}>
                                  {passwordVisibleFor[row.id] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </Button>
                                <Button size="icon" variant="secondary" className="bg-navytrust-elevated/55 border border-white/10 hover:bg-navytrust-elevated/75" onClick={() => copyText(row.password, 'Password')} aria-label="Copy password">
                                  <Copy className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                            <div className="font-mono text-sm text-navytrust-foreground">{passwordVisibleFor[row.id] ? (row.password || '—') : (row.password ? '••••••••' : '—')}</div>
                          </div>
                          <div className="rounded-2xl bg-navytrust-elevated/35 border border-white/10 p-3 space-y-1">
                            <div className="text-xs uppercase tracking-[0.18em] text-navytrust-foreground/70">Last Update</div>
                            <div className="text-sm text-navytrust-foreground">{formatIsoDate(row.lastUpdateDate || row.updatedAt || null)}</div>
                          </div>
                          <div className="rounded-2xl bg-navytrust-elevated/35 border border-white/10 p-3 space-y-1">
                            <div className="text-xs uppercase tracking-[0.18em] text-navytrust-foreground/70">Notes</div>
                            <div className="text-sm text-navytrust-foreground/90 whitespace-pre-wrap">{row.notes || '—'}</div>
                          </div>
                        </div>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
        </>
        )}

        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent side="right" className="w-full sm:max-w-xl pointer-events-auto">
            <SheetHeader>
              <SheetTitle className="font-display">{editing ? 'Edit Entry' : 'Add Entry'}</SheetTitle>
            </SheetHeader>
            <div className="mt-6">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(submitForm)} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="sNo"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>S.No</FormLabel>
                          <FormControl>
                            <Input type="number" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="status"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Status</FormLabel>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select status" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="Prequalified">Prequalified</SelectItem>
                              <SelectItem value="Registered">Registered</SelectItem>
                              <SelectItem value="Registration on Process">Registration on Process</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="company"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Company</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="registeredEmail"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Registered Email</FormLabel>
                          <FormControl>
                            <Input type="email" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="userId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>User ID (Portal)</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Password (Portal)</FormLabel>
                          <FormControl>
                            <Input type="password" {...field} autoComplete="new-password" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="link"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Link (Portal)</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="lastUpdateDate"
                      render={({ field }) => (
                        <FormItem className="flex flex-col">
                          <FormLabel>Last Update Date</FormLabel>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                type="button"
                                variant="outline"
                                className="justify-start text-left font-normal"
                              >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {field.value ? field.value.toISOString().slice(0, 10) : 'Pick a date'}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0 pointer-events-auto" align="start">
                              <Calendar
                                mode="single"
                                selected={field.value ?? undefined}
                                onSelect={(d) => field.onChange(d ?? null)}
                                initialFocus
                              />
                            </PopoverContent>
                          </Popover>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Notes</FormLabel>
                        <FormControl>
                          <Textarea rows={4} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <Button type="button" variant="secondary" onClick={() => setSheetOpen(false)}>Cancel</Button>
                    <Button type="submit" className="bg-navytrust-primary hover:bg-navytrust-primary/90 text-white shadow-nt-glow">
                      {editing ? 'Save Changes' : 'Create'}
                    </Button>
                  </div>
                </form>
              </Form>
            </div>
          </SheetContent>
        </Sheet>

        <AlertDialog open={!!deleteTarget} onOpenChange={(open) => (!open ? setDeleteTarget(null) : null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete entry?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently remove the PQ activity record for <span className="font-semibold">{deleteTarget?.company}</span>.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={confirmDelete} disabled={deleting} className="bg-red-600 hover:bg-red-600/90">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
