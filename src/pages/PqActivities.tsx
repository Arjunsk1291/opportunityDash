import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTrackedAction } from '@/hooks/useTrackedAction';
import { ActionProgressBar } from '@/components/ActionProgressBar';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { CalendarIcon, Copy, FileDown, FileUp, Plus, Search, Trash2, Pencil, AlertTriangle, FileText } from 'lucide-react';

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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { withPerf } from '@/lib/perfLogger';
import { Progress } from '@/components/ui/progress';
import { useProgressLoader } from '@/lib/useProgressLoader';
import { downloadWorkbook } from '@/lib/excelWorkbook';

const API_URL = import.meta.env.VITE_API_URL || '/api';

type PqStatus = 'Prequalified' | 'Registered' | 'Registration on Process';

type PqActivityRow = {
  id: string;
  tenant?: string;
  sNo: number;
  company: string;
  status: PqStatus;
  workgroup?: string;
  registeredEmail: string;
  userId: string;
  password: string;
  link: string;
  imageLink?: string;
  renewalDate: string | null;
  lastUpdateDate: string | null;
  notes: string;
  enquiries?: string;
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
  workgroup: z.string().trim().max(120).optional().default(''),
  registeredEmail: z.string().trim().max(200).optional().default(''),
  userId: z.string().trim().max(200).optional().default('-'),
  password: z.string().max(500).optional().default(''),
  link: z.string().trim().max(800).optional().default('-'),
  imageLink: z.string().trim().max(1200).optional().default(''),
  lastUpdateDate: z.date().nullable().optional().default(null),
  notes: z.string().trim().max(1000).optional().default(''),
  enquiries: z.string().trim().max(2000).optional().default(''),
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
const PQ_TENANTS = [
  { key: 'avenir_abudhabi', brand: 'Avenir', location: 'Abu Dhabi' },
  { key: 'avenir_india', brand: 'Avenir', location: 'India' },
  { key: 'avenir_energy', brand: 'Avenir', location: 'Energy' },
  { key: 'avenir_oilfield', brand: 'Avenir', location: 'Oilfield' },
  { key: 'lauren', brand: 'Lauren', location: '' },
  { key: 'bcts_dubai', brand: 'BCTS', location: 'Dubai' },
  { key: 'bcts_abudhabi', brand: 'BCTS', location: 'Abu Dhabi' },
] as const;
type PqTenantKey = typeof PQ_TENANTS[number]['key'];

const getTenantLogoPath = (tenant: PqTenantKey) => `/pq-logos/${tenant}/logo.png`;

export default function PqActivities() {
  const { token, canPerformAction, isMaster } = useAuth();
  const { status: trackedStatus } = useTrackedAction();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [rows, setRows] = useState<PqActivityRow[]>([]);
  const [loading, setLoading] = useState(false);
  const loadProgress = useProgressLoader(loading);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState<PqStatus | 'All'>('All');

  const [detailRow, setDetailRow] = useState<PqActivityRow | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<PqActivityRow | null>(null);
  const [activeTenant, setActiveTenant] = useState<PqTenantKey>('avenir_abudhabi');
  const [showStaleOnly, setShowStaleOnly] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<PqActivityRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const form = useForm<PqFormValues>({
    resolver: zodResolver(pqFormSchema),
    defaultValues: {
      sNo: 0,
      company: '',
      status: 'Registration on Process',
      workgroup: '',
      registeredEmail: '',
      userId: '-',
      password: '',
      link: '-',
      imageLink: '',
      lastUpdateDate: new Date(),
      notes: '',
      enquiries: '',
    },
  });

  const canView = canPerformAction('pq_activities_view');
  const canWrite = canPerformAction('pq_activities_manage');

  const getRowLastUpdateMs = useCallback((row: PqActivityRow) => {
    // Notice-board reminder should be driven by the explicit "Last Update Date"
    // field, not by Mongo's updatedAt (which changes on any edit/import).
    const raw = row.lastUpdateDate || null;
    if (!raw) return null;
    const ms = new Date(raw).getTime();
    return Number.isNaN(ms) ? null : ms;
  }, []);

  const isRowStale = useCallback((row: PqActivityRow, nowMs = Date.now()) => {
    const lastMs = getRowLastUpdateMs(row);
    if (!lastMs) return true;
    return (nowMs - lastMs) > THIRTY_DAYS_MS;
  }, [getRowLastUpdateMs]);

  const staleRows = useMemo(() => {
    const now = Date.now();
    return rows.filter((row) => isRowStale(row, now));
  }, [isRowStale, rows]);

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
          || String(r.workgroup || '').toLowerCase().includes(normalizedQ)
          || String(r.registeredEmail || '').toLowerCase().includes(normalizedQ)
          || String(r.enquiries || '').toLowerCase().includes(normalizedQ)
        );
      });

    // Deduplicate identical rows for display (keep most recently updated).
    const seen = new Map<string, PqActivityRow>();
    for (const row of filtered) {
      const key = [
        row.company,
        row.status,
        row.workgroup,
        row.registeredEmail,
        row.userId,
        row.password,
        row.link,
        row.imageLink,
        row.lastUpdateDate,
        row.notes,
        row.enquiries,
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
  }, [isRowStale, q, rows, showStaleOnly, statusFilter]);

  useEffect(() => {
    setExpandedId(null);
  }, [activeTenant]);

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

  const loadRows = async (reason: string) => {
    if (!token) return;
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      qs.set('tenant', activeTenant);
      if (q.trim()) qs.set('q', q.trim());
      if (statusFilter !== 'All') qs.set('status', statusFilter);

      const data = await withPerf(
        'pq.activities.load',
        { reason, tenant: activeTenant, q: q.trim(), status: statusFilter, route: window.location.pathname },
        async () => {
          const res = await fetch(`${API_URL}/pq-activities?${qs.toString()}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const parsed = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(parsed.error || 'Failed to load PQ activities');
          return parsed as { rows?: unknown };
        },
      );
      setRows(Array.isArray((data as { rows?: unknown }).rows) ? (data as { rows: PqActivityRow[] }).rows : []);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRows('tenant_or_mount');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, activeTenant]);

  const openCreate = () => {
    setEditing(null);
    form.reset({
      sNo: 0,
      company: '',
      status: 'Registration on Process',
      workgroup: '',
      registeredEmail: '',
      userId: '-',
      password: '',
      link: '-',
      imageLink: '',
      lastUpdateDate: new Date(),
      notes: '',
      enquiries: '',
    });
    setSheetOpen(true);
  };

  const openEdit = (row: PqActivityRow) => {
    setEditing(row);
    form.reset({
      sNo: row.sNo ?? 0,
      company: row.company || '',
      status: row.status || 'Registration on Process',
      workgroup: row.workgroup || '',
      registeredEmail: row.registeredEmail || '',
      userId: row.userId || '-',
      password: row.password || '',
      link: row.link || '-',
      imageLink: row.imageLink || '',
      lastUpdateDate: row.lastUpdateDate ? new Date(row.lastUpdateDate) : (row.updatedAt ? new Date(row.updatedAt) : null),
      notes: row.notes || '',
      enquiries: row.enquiries || '',
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
        tenant: activeTenant,
        ...values,
        lastUpdateDate: nextLastUpdateDate ? nextLastUpdateDate.toISOString() : null,
      };

      const url = editing
        ? `${API_URL}/pq-activities/${editing.id}?tenant=${encodeURIComponent(activeTenant)}`
        : `${API_URL}/pq-activities`;
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
      await loadRows('save_create');
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const confirmDelete = async () => {
    if (!token || !deleteTarget || !canWrite) return;
    setDeleting(true);
    try {
      const res = await fetch(`${API_URL}/pq-activities/${deleteTarget.id}?tenant=${encodeURIComponent(activeTenant)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Delete failed');
      toast.success('Entry deleted');
      setDeleteTarget(null);
      await loadRows('save_update');
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
      const res = await fetch(`${API_URL}/pq-activities/import?tenant=${encodeURIComponent(activeTenant)}`, {
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
      await loadRows('import_rows');
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const exportXlsx = async () => {
    if (!token || !canView) return;
    try {
      const res = await fetch(`${API_URL}/pq-activities/export?tenant=${encodeURIComponent(activeTenant)}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Export failed');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pq-activities-${activeTenant}-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('Export started');
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const downloadTemplate = async () => {
    try {
      setLoading(true);
      const ExcelJS = await import('exceljs');
      const headers = [
        'S.No',
        'Company',
        'Status',
        'Workgroup',
        'Registered Email',
        'User ID (Portal)',
        'Password(Portal)',
        'Link(Portal)',
        'Image Link',
        'Enquiries',
      ];
      const sample = {
        'S.No': 1,
        Company: 'Sample Company LLC',
        Status: 'Registration on Process',
        Workgroup: 'Procurement',
        'Registered Email': 'ops@example.com',
        'User ID (Portal)': 'username',
        'Password(Portal)': 'password',
        'Link(Portal)': 'https://portal.example.com',
        'Image Link': 'https://example.com/logo.png',
        Enquiries: 'Notes / enquiries for this company',
      };
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('PQ Activities');
      worksheet.addRow(headers);
      worksheet.addRow(headers.map((h) => (sample as Record<string, unknown>)[h] ?? ''));
      await downloadWorkbook(workbook as unknown as Parameters<typeof downloadWorkbook>[0], `pq-activities-template-${activeTenant}-${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success('Template downloaded.');
    } catch (error) {
      toast.error((error as Error).message || 'Failed to download template');
    } finally {
      setLoading(false);
    }
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
    <>
    <ActionProgressBar status={trackedStatus} />
    <div className="min-h-[calc(100vh-64px)] bg-background text-foreground">
      <div className="mx-auto max-w-7xl px-3 sm:px-6 py-6 sm:py-10">
        <header className="flex flex-col gap-2">
          <h1 className="font-display text-2xl sm:text-3xl md:text-4xl tracking-tight">Pre-Qualification</h1>
          <p className="text-sm sm:text-base text-navytrust-foreground/80 max-w-2xl">
            Track supplier portal prequalification and registration credentials with safe, role-gated access.
          </p>
        </header>

        <div className="mt-5">
          <Tabs value={activeTenant} onValueChange={(v) => setActiveTenant(v as PqTenantKey)}>
            <TabsList className="bg-transparent p-0 h-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {PQ_TENANTS.map((tenant) => (
                  <TabsTrigger
                    key={tenant.key}
                    value={tenant.key}
                    className="h-auto p-0 rounded-[1.75rem] border border-white/10 bg-white/5 hover:bg-white/10 data-[state=active]:border-primary data-[state=active]:bg-primary/10 transition-all"
                  >
                    <div className="w-full p-5 flex items-center gap-4">
                      <div className="h-12 w-12 rounded-2xl bg-navytrust-elevated/40 border border-white/10 overflow-hidden flex items-center justify-center">
                        <img
                          src={getTenantLogoPath(tenant.key)}
                          alt={`${tenant.brand} ${tenant.location}`}
                          className="h-10 w-10 object-contain"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      </div>
                      <div className="min-w-0 text-left">
                        <div className="text-xs font-black uppercase tracking-[0.3em] text-primary/80">{tenant.brand}</div>
                        <div className="mt-1 text-base font-bold text-navytrust-foreground truncate">{tenant.location}</div>
                      </div>
                    </div>
                  </TabsTrigger>
                ))}
              </div>
            </TabsList>
            <TabsContent value={activeTenant}>

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
            </TabsContent>
          </Tabs>
        </div>

        <>
	        <div className="mt-6 rounded-2xl bg-navytrust-surface/35 backdrop-blur border border-white/10 shadow-elegant p-3 sm:p-4">
	          {loading && (
	            <div className="mb-3">
	              <Progress value={loadProgress} className="h-2" />
	              <div className="mt-1 text-xs text-navytrust-foreground/70">Working… {loadProgress}%</div>
	            </div>
	          )}
	          <div className="flex flex-col lg:flex-row lg:items-center gap-3">
	            <div className="flex-1 flex items-center gap-2">
	              <div className="relative w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-navytrust-foreground/70" aria-hidden="true" />
	                <Input
	                  className="pl-9 bg-navytrust-elevated/40 border-white/10 text-navytrust-foreground placeholder:text-navytrust-foreground/60"
	                  placeholder="Search company, workgroup, email, enquiries…"
	                  value={q}
	                  onChange={(e) => setQ(e.target.value)}
	                  aria-label="Search company, workgroup, email, enquiries"
	                />
              </div>
	              <Button variant="secondary" className="bg-navytrust-elevated/50 border border-white/10 text-navytrust-foreground hover:bg-navytrust-elevated/70" onClick={() => loadRows('refresh_click')} loading={loading}>
	                Refresh
	              </Button>
            </div>

            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as PqStatus | 'All')}>
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

              <Button variant="secondary" className="w-full sm:w-auto bg-navytrust-elevated/50 border border-white/10 text-navytrust-foreground hover:bg-navytrust-elevated/70 gap-2" onClick={onPickImportFile} loading={loading} disabled={!canWrite}>
                <FileUp className="h-4 w-4" aria-hidden="true" />
                Import .xlsx
              </Button>
              <Button variant="secondary" className="w-full sm:w-auto bg-navytrust-elevated/50 border border-white/10 text-navytrust-foreground hover:bg-navytrust-elevated/70 gap-2" onClick={exportXlsx} loading={loading} disabled={!canView}>
                <FileDown className="h-4 w-4" aria-hidden="true" />
                Export .xlsx
              </Button>
              <Button
                variant="secondary"
                className="w-full sm:w-auto bg-navytrust-elevated/50 border border-white/10 text-navytrust-foreground hover:bg-navytrust-elevated/70 gap-2"
                onClick={downloadTemplate}
                loading={loading}
              >
                <FileText className="h-4 w-4" aria-hidden="true" />
                Template .xlsx
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
                        setDetailRow(row);
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
	                  <th className="px-4 py-3 font-semibold">Workgroup</th>
	                  <th className="px-4 py-3 font-semibold">Last Update</th>
	                  <th className="px-4 py-3 font-semibold">Notes</th>
	                  <th className="px-4 py-3 font-semibold">Enquiries</th>
	                  <th className="px-4 py-3 font-semibold text-right">Actions</th>
	                </tr>
              </thead>
              <tbody>
                <AnimatePresence initial={false}>
	                  {filteredRows.map((row, idx) => {
	                    const isPreq = row.status === 'Prequalified';
	                    return (
                      <motion.tr
                        key={row.id}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 6 }}
	                        transition={{ duration: 0.18, delay: Math.min(idx * 0.012, 0.12) }}
	                        className="border-t border-white/10 hover:bg-white/5 cursor-pointer"
	                        onClick={() => setDetailRow(row)}
	                      >
                        <td className="px-4 py-3 text-navytrust-foreground/80">{row.sNo || idx + 1}</td>
                        <td className="px-4 py-3 font-medium text-navytrust-foreground">{row.company}</td>
                        <td className="px-4 py-3">
                          <Badge className={statusBadgeClass(row.status)}>
                            {isPreq && <span className="mr-2 inline-block h-2 w-2 rounded-full bg-warning" aria-hidden="true" />}
                            {row.status}
                          </Badge>
                        </td>
	                        <td className="px-4 py-3 text-navytrust-foreground/90">{row.workgroup || '—'}</td>
                        <td className="px-4 py-3 text-navytrust-foreground/90">
                          <div className="flex items-center gap-2">
                            <span>{formatIsoDate(row.lastUpdateDate || row.updatedAt || null)}</span>
                            {isRowStale(row) && (
                              <Badge className="bg-warning/20 text-warning border border-warning/30">Reminder</Badge>
                            )}
                          </div>
                        </td>
	                        <td className="px-4 py-3 text-navytrust-foreground/80 max-w-[320px] truncate">{row.notes || '—'}</td>
	                        <td className="px-4 py-3 text-navytrust-foreground/80 max-w-[320px] truncate">{row.enquiries || '—'}</td>
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

	          <Dialog open={Boolean(detailRow)} onOpenChange={(open) => { if (!open) setDetailRow(null); }}>
	            <DialogContent className="max-w-4xl">
	              <DialogHeader>
	                <DialogTitle>{detailRow?.company || 'PQ Activity'}</DialogTitle>
	                <DialogDescription>Registered Email is shown only in this popup.</DialogDescription>
	              </DialogHeader>
	              {detailRow ? (
	                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
	                  <div className="space-y-3">
	                    <p className="font-semibold text-navytrust-foreground">Portal Credentials</p>
	                    <div className="rounded-2xl bg-navytrust-elevated/35 border border-white/10 p-4 space-y-3">
	                      <div className="flex items-center justify-between gap-2">
	                        <div className="min-w-0">
	                          <div className="text-xs uppercase tracking-[0.18em] text-navytrust-foreground/70">Registered Email</div>
	                          <div className="mt-1 font-mono text-navytrust-foreground truncate">{detailRow.registeredEmail || '—'}</div>
	                        </div>
	                        <Button size="icon" variant="secondary" className="bg-navytrust-elevated/55 border border-white/10 hover:bg-navytrust-elevated/75" onClick={() => copyText(detailRow.registeredEmail || '', 'Registered Email')} aria-label="Copy Registered Email">
	                          <Copy className="h-4 w-4" />
	                        </Button>
	                      </div>
	                      <div className="flex items-center justify-between gap-2">
	                        <div className="min-w-0">
	                          <div className="text-xs uppercase tracking-[0.18em] text-navytrust-foreground/70">User ID</div>
	                          <div className="mt-1 font-mono text-navytrust-foreground truncate">{detailRow.userId || '—'}</div>
	                        </div>
	                        <Button size="icon" variant="secondary" className="bg-navytrust-elevated/55 border border-white/10 hover:bg-navytrust-elevated/75" onClick={() => copyText(detailRow.userId || '', 'User ID')} aria-label="Copy User ID">
	                          <Copy className="h-4 w-4" />
	                        </Button>
	                      </div>
	                      <div className="flex items-center justify-between gap-2">
	                        <div className="min-w-0">
	                          <div className="text-xs uppercase tracking-[0.18em] text-navytrust-foreground/70">Password</div>
	                          <div className="mt-1 font-mono text-navytrust-foreground truncate">{detailRow.password || '—'}</div>
	                        </div>
	                        <Button size="icon" variant="secondary" className="bg-navytrust-elevated/55 border border-white/10 hover:bg-navytrust-elevated/75" onClick={() => copyText(detailRow.password || '', 'Password')} aria-label="Copy password">
	                          <Copy className="h-4 w-4" />
	                        </Button>
	                      </div>
	                      <div className="flex items-center justify-between gap-2">
	                        <div className="min-w-0">
	                          <div className="text-xs uppercase tracking-[0.18em] text-navytrust-foreground/70">Portal Link</div>
	                          <div className="mt-1 text-navytrust-foreground truncate">
	                            {safeUrl(detailRow.link) ? (
	                              <a className="underline decoration-white/30 hover:decoration-white/70" href={safeUrl(detailRow.link)} target="_blank" rel="noreferrer">
	                                {detailRow.link}
	                              </a>
	                            ) : '—'}
	                          </div>
	                        </div>
	                        <Button size="icon" variant="secondary" className="bg-navytrust-elevated/55 border border-white/10 hover:bg-navytrust-elevated/75" onClick={() => copyText(detailRow.link || '', 'Portal link')} aria-label="Copy portal link">
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
	                          <div className="text-xs uppercase tracking-[0.18em] text-navytrust-foreground/70">Status</div>
	                          <div className="mt-1 text-navytrust-foreground">{detailRow.status || '—'}</div>
	                        </div>
	                        <div>
	                          <div className="text-xs uppercase tracking-[0.18em] text-navytrust-foreground/70">Workgroup</div>
	                          <div className="mt-1 text-navytrust-foreground">{detailRow.workgroup || '—'}</div>
	                        </div>
	                        <div>
	                          <div className="text-xs uppercase tracking-[0.18em] text-navytrust-foreground/70">Last Update</div>
	                          <div className="mt-1 text-navytrust-foreground">{formatIsoDate(detailRow.lastUpdateDate || detailRow.updatedAt || null)}</div>
	                        </div>
	                        <div>
	                          <div className="text-xs uppercase tracking-[0.18em] text-navytrust-foreground/70">Renewal</div>
	                          <div className="mt-1 text-navytrust-foreground">{formatIsoDate(detailRow.renewalDate || null)}</div>
	                        </div>
	                      </div>
	                      <div>
	                        <div className="text-xs uppercase tracking-[0.18em] text-navytrust-foreground/70">Notes</div>
	                        <div className="mt-1 whitespace-pre-wrap text-navytrust-foreground/90">{detailRow.notes || '—'}</div>
	                      </div>
	                      <div>
	                        <div className="text-xs uppercase tracking-[0.18em] text-navytrust-foreground/70">Enquiries</div>
	                        <div className="mt-1 whitespace-pre-wrap text-navytrust-foreground/90">{detailRow.enquiries || '—'}</div>
	                      </div>
	                      <div className="flex items-center justify-between gap-2">
	                        <div className="min-w-0">
	                          <div className="text-xs uppercase tracking-[0.18em] text-navytrust-foreground/70">Image Link</div>
	                          <div className="mt-1 text-navytrust-foreground truncate">
	                            {safeUrl(detailRow.imageLink || '') ? (
	                              <a className="underline decoration-white/30 hover:decoration-white/70" href={safeUrl(detailRow.imageLink || '')} target="_blank" rel="noreferrer">
	                                {detailRow.imageLink}
	                              </a>
	                            ) : (detailRow.imageLink || '—')}
	                          </div>
	                        </div>
	                        <Button size="icon" variant="secondary" className="bg-navytrust-elevated/55 border border-white/10 hover:bg-navytrust-elevated/75" onClick={() => copyText(detailRow.imageLink || '', 'Image link')} aria-label="Copy image link">
	                          <Copy className="h-4 w-4" />
	                        </Button>
	                      </div>
	                      {safeUrl(detailRow.imageLink || '') ? (
	                        <div className="rounded-2xl border border-white/10 bg-black/10 overflow-hidden">
	                          <img src={safeUrl(detailRow.imageLink || '')} alt="Company logo" className="w-full max-h-48 object-contain bg-white/5" />
	                        </div>
	                      ) : null}
	                    </div>
	                  </div>
	                </div>
	              ) : null}
	            </DialogContent>
	          </Dialog>
        </div>

        {/* Mobile cards */}
	        <div className="md:hidden mt-6 space-y-3">
	          <AnimatePresence initial={false}>
	            {filteredRows.map((row, idx) => {
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
	                    onClick={() => setDetailRow(row)}
	                    aria-label={`Open details for ${row.company}`}
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
	                    <div className="mt-3 text-sm text-navytrust-foreground/90 truncate">{row.workgroup || '—'}</div>
	                    <div className="text-xs text-navytrust-foreground/70 truncate">Last update: {formatIsoDate(row.lastUpdateDate || row.updatedAt || null)}</div>
	                  </button>
	                </motion.div>
	              );
	            })}
	          </AnimatePresence>
	        </div>
        </>

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
                            <Input type="text" {...field} autoComplete="off" />
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
    </>
  );
}
