import { useEffect, useMemo, useRef, useState } from 'react';
import { FileUp, Plus, Search, Sparkles, Wand2 } from 'lucide-react';
import { toast } from 'sonner';

import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { getFirstWorksheet, loadWorkbookFromArrayBuffer, worksheetToMatrix } from '@/lib/excelWorkbook';
import { perfLog, withPerf } from '@/lib/perfLogger';
import { Progress } from '@/components/ui/progress';
import { useProgressLoader } from '@/lib/useProgressLoader';

const API_URL = import.meta.env.VITE_API_URL || '/api';
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_UPLOAD_ROWS = 5000;

type PotentialRow = {
  id: string;
  opportunityRefNo: string;
  isPotential: boolean;
  extras: Record<string, unknown>;
  updatedBy?: string;
  updatedAt?: string;
  createdAt?: string;
  opportunity?: OpportunityLite | null;
};

const normalizeRef = (v: string) => String(v || '').trim().toLowerCase();

type OpportunityLite = {
  id?: string;
  opportunityRefNo?: string;
  tenderName?: string;
  clientName?: string;
  internalLead?: string;
  avenirStatus?: string;
};

type MarkRow = {
  _id?: string;
  id?: string;
  opportunityRefNo?: string;
  isPotential?: boolean;
  extras?: Record<string, unknown>;
  updatedAt?: string;
  createdAt?: string;
};

async function fetchJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  const data = await res.json().catch(() => ({}));
  const err = (data && typeof data === 'object' && 'error' in data) ? String((data as { error?: unknown }).error || '') : '';
  if (!res.ok) throw new Error(err || 'Request failed');
  return data as T;
}

const getExtrasKeys = (source: PotentialRow[]) => {
  const keys = new Set<string>();
  source.forEach((row) => {
    Object.keys(row.extras || {}).forEach((k) => keys.add(k));
  });
  return Array.from(keys).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
};

export default function PotentialOpportunities() {
  const { token, canPerformAction } = useAuth();
  const { opportunities, refreshData } = useData();
  const canWrite = Boolean(canPerformAction?.('opportunities_write'));

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [rows, setRows] = useState<PotentialRow[]>([]);
  const [loading, setLoading] = useState(false);
  const loadProgress = useProgressLoader(loading);
  const [q, setQ] = useState('');
  type TabKey = 'grid' | 'excel' | 'search' | 'manual';
  const [activeTab, setActiveTab] = useState<TabKey>('grid');

  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<PotentialRow | null>(null);
  const [extrasText, setExtrasText] = useState('{}');
  const [newColumnName, setNewColumnName] = useState('');
  const [pageIndex, setPageIndex] = useState(0);
  const pageSize = 50;

  useEffect(() => {
    // Only fetch heavy opportunities dataset if/when the user needs "Advanced Search".
    if (activeTab !== 'search') return;
    if (!token) return;
    if (Array.isArray(opportunities) && opportunities.length) return;
    perfLog('potential.opportunities.ensure_opps_load', { reason: 'tab_search_opened', route: window.location.pathname });
    void refreshData({ background: false }).catch(() => {});
  }, [activeTab, opportunities, refreshData, token]);

  const load = async (reason: string) => {
    if (!token) return;
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (q.trim()) qs.set('q', q.trim());
      const data = await withPerf(
        'potential.opportunities.load',
        { reason, q: q.trim(), route: window.location.pathname },
        () => fetchJson<{ success: boolean; rows: PotentialRow[] }>(`${API_URL}/potential-opportunities?${qs.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      setRows(Array.isArray(data.rows) ? data.rows : []);
      setPageIndex(0);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load('initial_mount');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const stats = useMemo(() => {
    const total = rows.length;
    const withExtras = rows.filter((r) => r.extras && Object.keys(r.extras).length > 0).length;
    const withOpp = rows.filter((r) => r.opportunity).length;
    return { total, withExtras, withOpp };
  }, [rows]);

  const rowsByRef = useMemo(() => new Map(rows.map((r) => [normalizeRef(r.opportunityRefNo), r])), [rows]);
  const extrasKeys = useMemo(() => getExtrasKeys(rows), [rows]);
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const pagedRows = useMemo(() => {
    const start = pageIndex * pageSize;
    return rows.slice(start, start + pageSize);
  }, [pageIndex, rows]);

  const openEdit = (row: PotentialRow) => {
    setEditing(row);
    setExtrasText(JSON.stringify(row.extras || {}, null, 2));
    setEditOpen(true);
  };

  const saveExtras = async () => {
    if (!token || !editing) return;
    try {
      const next = JSON.parse(extrasText || '{}');
      const data = await fetchJson<{ success: boolean; row: MarkRow }>(`${API_URL}/potential-opportunities/${editing.id}/extras`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ extras: next }),
      });
      toast.success('Saved extras.');
      setEditOpen(false);
      setEditing(null);
      setRows((prev) => prev.map((r) => (r.id === editing.id ? { ...r, extras: data.row.extras || {}, updatedAt: data.row.updatedAt } : r)));
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const markPotential = async (opportunityRefNo: string, isPotential: boolean) => {
    if (!token) return null;
    const data = await fetchJson<{ success: boolean; row: MarkRow }>(`${API_URL}/potential-opportunities/mark`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ opportunityRefNo, isPotential }),
    });
    return data.row || null;
  };

  const handleExcelUpload = async (file: File) => {
    if (!token) return;
    try {
      if (!canWrite) throw new Error('You do not have permission to update potential opportunities.');
      if (file.size > MAX_UPLOAD_BYTES) throw new Error('File too large (max 10MB).');
      const lower = String(file.name || '').toLowerCase();
      if (!lower.endsWith('.xlsx')) throw new Error('Only .xlsx files are supported.');

      const buffer = await file.arrayBuffer();
      const workbook = await loadWorkbookFromArrayBuffer(buffer);
      const worksheet = getFirstWorksheet(workbook);
      if (!worksheet) throw new Error('No worksheet found.');
      const matrix = worksheetToMatrix(worksheet, { maxRows: MAX_UPLOAD_ROWS, maxColumns: 64 });
      if (!matrix.length) throw new Error('No data found.');

      const normalizeHeader = (v: unknown) => String(v || '').trim().toLowerCase().replace(/\s+/g, ' ');
      const header = matrix[0].map(normalizeHeader);
      const refIdx = header.findIndex((h) => ['opportunity ref no', 'ref no', 'ref', 'tender no'].includes(h));
      if (refIdx < 0) throw new Error('Missing required header: Opportunity Ref No');

      const extraKeys: Array<{ idx: number; key: string }> = header
        .map((h, idx) => ({ idx, key: String(matrix[0][idx] || '').trim() }))
        .filter((x) => x.idx !== refIdx && x.key);

      const payloadRows = matrix.slice(1)
        .map((r) => {
          const ref = String(r[refIdx] || '').trim();
          if (!ref) return null;
          const extras: Record<string, unknown> = {};
          for (const k of extraKeys) extras[k.key] = r[k.idx] ?? '';
          return { opportunityRefNo: ref, extras };
        })
        .filter(Boolean) as Array<{ opportunityRefNo: string; extras: Record<string, unknown> }>;

      if (!payloadRows.length) throw new Error('No rows with Opportunity Ref No found.');

      const result = await fetchJson<{ success: boolean; upserted: number; modified: number; touched: number }>(`${API_URL}/potential-opportunities/import`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: payloadRows }),
      });
      toast.success(`Imported ${result.touched} rows (new ${result.upserted}, updated ${result.modified}).`);
      await load('excel_import_completed');
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const [searchAddQ, setSearchAddQ] = useState('');
  const candidates = useMemo<OpportunityLite[]>(() => {
    const nq = searchAddQ.trim().toLowerCase();
    const source = (opportunities || []) as OpportunityLite[];
    const base = nq
      ? source.filter((o) => [o.opportunityRefNo, o.tenderName, o.clientName, o.internalLead].join(' ').toLowerCase().includes(nq))
      : source.slice(0, 50);
    return base.slice(0, 100);
  }, [opportunities, searchAddQ]);

  const [manualRef, setManualRef] = useState('');
  const [manualExtras, setManualExtras] = useState('{}');

  const renderCellValue = (value: unknown) => {
    const raw = value === null || value === undefined ? '' : String(value);
    if (!raw) return <span className="text-muted-foreground">—</span>;
    if (raw.length <= 40) return raw;
    return `${raw.slice(0, 37)}…`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            Potential Opportunities
          </h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            A focused shortlist mapped from MongoDB. Only items explicitly marked as potential appear here. Extra columns are stored separately so Opportunity updates never overwrite them.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => load('refresh_click')} disabled={loading}>
            Refresh
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleExcelUpload(f);
              e.currentTarget.value = '';
            }}
          />
          <Button
            variant="default"
            onClick={() => fileInputRef.current?.click()}
            disabled={!canWrite}
          >
            <FileUp className="mr-2 h-4 w-4" />
            Excel Update
          </Button>
        </div>
      </div>

      {loading && (
        <div className="rounded-2xl border bg-card p-3">
          <Progress value={loadProgress} className="h-2" />
          <div className="mt-1 text-xs text-muted-foreground">Working… {loadProgress}%</div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="rounded-2xl bg-gradient-to-br from-primary/15 via-background to-background border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs tracking-[0.24em] uppercase text-muted-foreground">Potential</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{stats.total}</CardContent>
        </Card>
        <Card className="rounded-2xl bg-gradient-to-br from-emerald-500/10 via-background to-background border-emerald-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs tracking-[0.24em] uppercase text-muted-foreground">With Extras</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{stats.withExtras}</CardContent>
        </Card>
        <Card className="rounded-2xl bg-gradient-to-br from-indigo-500/10 via-background to-background border-indigo-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs tracking-[0.24em] uppercase text-muted-foreground">Matched Opps</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{stats.withOpp}</CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabKey)}>
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="grid">List</TabsTrigger>
          <TabsTrigger value="excel">Excel Update</TabsTrigger>
          <TabsTrigger value="search">Advanced Search</TabsTrigger>
          <TabsTrigger value="manual">Manual Entry</TabsTrigger>
        </TabsList>

        <TabsContent value="grid" className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <Input
                className="pl-9"
                placeholder="Search by ref / tender / client / lead…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void load('search_enter');
                }}
              />
            </div>
            <Button variant="outline" onClick={() => load('search_apply_click')} disabled={loading}>
              <Wand2 className="mr-2 h-4 w-4" />
              Apply
            </Button>
          </div>

          <div className="rounded-2xl border bg-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[160px]">Ref No</TableHead>
                  <TableHead>Tender</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead className="w-[140px]">Lead</TableHead>
                  {extrasKeys.map((k) => (
                    <TableHead key={k} className="min-w-[180px]">{k}</TableHead>
                  ))}
                  <TableHead className="w-[140px]">
                    <div className="flex items-center gap-2">
                      <span>Extras</span>
                      <Input
                        className="h-8 w-[180px]"
                        placeholder="Add column…"
                        value={newColumnName}
                        onChange={(e) => setNewColumnName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key !== 'Enter') return;
                          const name = newColumnName.trim();
                          if (!name) return;
                          if (extrasKeys.some((x) => x.toLowerCase() === name.toLowerCase())) {
                            toast.error('Column already exists.');
                            return;
                          }
                          setRows((prev) => prev.map((r) => ({ ...r, extras: { ...(r.extras || {}), [name]: r.extras?.[name] ?? '' } })));
                          setNewColumnName('');
                        }}
                      />
                    </div>
                  </TableHead>
                  <TableHead className="w-[160px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagedRows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium whitespace-normal break-words">{r.opportunityRefNo}</TableCell>
                    <TableCell className="whitespace-normal break-words">{r.opportunity?.tenderName || <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="whitespace-normal break-words">{r.opportunity?.clientName || <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="whitespace-normal break-words">{r.opportunity?.internalLead || <span className="text-muted-foreground">—</span>}</TableCell>
                    {extrasKeys.map((k) => (
                      <TableCell key={`${r.id}:${k}`} className="whitespace-normal break-words">
                        {renderCellValue((r.extras || {})[k])}
                      </TableCell>
                    ))}
                    <TableCell>
                      <Badge variant={r.extras && Object.keys(r.extras).length ? 'default' : 'secondary'}>
                        {r.extras && Object.keys(r.extras).length ? `${Object.keys(r.extras).length} fields` : 'none'}
                      </Badge>
                    </TableCell>
                    <TableCell className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => openEdit(r)}>Edit extras</Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={!canWrite}
                        onClick={async () => {
                          try {
                            if (!canWrite) return;
                            await markPotential(r.opportunityRefNo, false);
                            toast.success('Removed from potential list.');
                            setRows((prev) => prev.filter((x) => x.id !== r.id));
                          } catch (error) {
                            toast.error((error as Error).message);
                          }
                        }}
                      >
                        Remove
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!rows.length && (
                  <TableRow>
                    <TableCell colSpan={6 + extrasKeys.length} className="py-10 text-center text-muted-foreground">
                      {loading ? 'Loading…' : 'No potential opportunities yet.'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {rows.length > pageSize && (
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm text-muted-foreground">
                Showing {pageIndex * pageSize + 1}-{Math.min((pageIndex + 1) * pageSize, rows.length)} of {rows.length}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setPageIndex(0)} disabled={pageIndex === 0}>First</Button>
                <Button variant="outline" size="sm" onClick={() => setPageIndex((p) => Math.max(0, p - 1))} disabled={pageIndex === 0}>Prev</Button>
                <Button variant="outline" size="sm" onClick={() => setPageIndex((p) => Math.min(pageCount - 1, p + 1))} disabled={pageIndex >= pageCount - 1}>Next</Button>
                <Button variant="outline" size="sm" onClick={() => setPageIndex(pageCount - 1)} disabled={pageIndex >= pageCount - 1}>Last</Button>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="excel" className="space-y-3">
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="text-base">Excel Update (same header)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <div>Required header: <span className="font-medium text-foreground">Opportunity Ref No</span></div>
              <div>Any extra columns become <span className="font-medium text-foreground">extras</span> for that ref.</div>
              <div className="text-xs">Tip: you can add columns like “Owner”, “Priority”, “Next Action”, etc.</div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="search" className="space-y-4">
          <Card className="rounded-2xl">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Advanced Search + Selection</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                placeholder="Search in Opportunities (ref / tender / client / lead)…"
                value={searchAddQ}
                onChange={(e) => setSearchAddQ(e.target.value)}
              />
              <div className="rounded-xl border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[160px]">Ref No</TableHead>
                      <TableHead>Tender</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead className="w-[140px]">Lead</TableHead>
                      <TableHead className="w-[120px]">Status</TableHead>
                      <TableHead className="w-[140px]">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {candidates.map((o) => {
                      const ref = String(o.opportunityRefNo || '').trim();
                      const already = rowsByRef.has(normalizeRef(ref));
                      return (
                        <TableRow key={o.id || ref}>
                          <TableCell className="font-medium">{ref || '—'}</TableCell>
                          <TableCell>{o.tenderName || '—'}</TableCell>
                          <TableCell>{o.clientName || '—'}</TableCell>
                          <TableCell>{o.internalLead || '—'}</TableCell>
                          <TableCell>{o.avenirStatus || '—'}</TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              variant={already ? 'secondary' : 'default'}
                              disabled={!canWrite || !ref || already}
                              onClick={async () => {
                                try {
                                  if (!ref) return;
                                  await markPotential(ref, true);
                                  toast.success('Marked as potential.');
                                  await load('advanced_search_added');
                                } catch (error) {
                                  toast.error((error as Error).message);
                                }
                              }}
                            >
                              <Plus className="mr-2 h-4 w-4" />
                              {already ? 'Added' : 'Add'}
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="manual" className="space-y-4">
          <Card className="rounded-2xl">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Manual Entry</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                placeholder="Opportunity Ref No…"
                value={manualRef}
                onChange={(e) => setManualRef(e.target.value)}
              />
              <Textarea
                className="min-h-[140px] font-mono text-xs"
                value={manualExtras}
                onChange={(e) => setManualExtras(e.target.value)}
                placeholder={`{\n  "Priority": "High",\n  "Owner": "..."\n}`}
              />
              <div className="flex gap-2">
                <Button
                  disabled={!canWrite || !manualRef.trim()}
                  onClick={async () => {
                    try {
                      if (!token) return;
                      const ref = manualRef.trim();
                      const extras = JSON.parse(manualExtras || '{}');
                      const marked = await markPotential(ref, true);
                      const id = String(marked?._id || marked?.id || '').trim();
                      if (!id) throw new Error('Failed to mark potential');
                      await fetchJson(`${API_URL}/potential-opportunities/${id}/extras`, {
                        method: 'PUT',
                        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ extras }),
                      });
                      toast.success('Added.');
                      setManualRef('');
                      setManualExtras('{}');
                      await load('manual_entry_added');
                    } catch (error) {
                      toast.error((error as Error).message);
                    }
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add Potential
                </Button>
                <Button variant="outline" onClick={() => { setManualRef(''); setManualExtras('{}'); }}>
                  Clear
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={editOpen} onOpenChange={(open) => setEditOpen(open)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit extras: {editing?.opportunityRefNo}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Textarea className="min-h-[260px] font-mono text-xs" value={extrasText} onChange={(e) => setExtrasText(e.target.value)} />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
              <Button onClick={() => void saveExtras()} disabled={!canWrite}>Save</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
