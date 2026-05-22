import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FileDown, FileUp, Plus, Search, Sparkles, Wand2, Edit2, Trash2, CheckCircle2, LayoutGrid, List as ListIcon, X, ExternalLink, Eye, Link as LinkIcon } from 'lucide-react';
import { toast } from 'sonner';
import ExcelJS from 'exceljs';

import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { downloadWorkbook, getFirstWorksheet, loadWorkbookFromArrayBuffer, worksheetToMatrix } from '@/lib/excelWorkbook';
import { perfLog, withPerf } from '@/lib/perfLogger';
import { Progress } from '@/components/ui/progress';
import { useProgressLoader } from '@/lib/useProgressLoader';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';

const API_URL = import.meta.env.VITE_API_URL || '/api';
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_UPLOAD_ROWS = 5000;

type PotentialRow = {
  id: string;
  opportunityRefNo: string;
  isPotential: boolean;
  extras: Record<string, unknown> & { overview?: string };
  updatedBy?: string;
  updatedAt?: string;
  createdAt?: string;
  opportunity?: OpportunityLite | null;
};

const normalizeRef = (v: string) => String(v || '').trim().toLowerCase();
const normalizeExtraKey = (v: string) => String(v || '').trim();
const normalizeExtraKeySlug = (v: string) => normalizeExtraKey(v).toLowerCase().replace(/\s+/g, ' ').trim();

const getExtrasTenderName = (extras: Record<string, unknown> | null | undefined) => {
  if (!extras) return '';
  const entries = Object.entries(extras);
  const found = entries.find(([k]) => ['tender name', 'tendername', 'tender'].includes(normalizeExtraKeySlug(k)));
  const value = found ? found[1] : '';
  return String(value || '').trim();
};

const getExtrasSowLink = (extras: Record<string, unknown> | null | undefined) => {
  if (!extras) return '';
  const entries = Object.entries(extras);
  const found = entries.find(([k]) => ['sow link', 'sow', 'scope of work link', 'scope of work', 'sowlink'].includes(normalizeExtraKeySlug(k)));
  const value = found ? found[1] : '';
  return String(value || '').trim();
};

const looksLikeUrl = (value: string) => /^https?:\/\//i.test(String(value || '').trim());
const isSharePointOrOneDriveUrl = (value: string) => {
  const url = String(value || '').trim();
  return /sharepoint\.com/i.test(url) || /onedrive\.live\.com/i.test(url) || /my\.sharepoint\.com/i.test(url);
};

const toSowPreviewUrl = (value: string) => {
  const raw = String(value || '').trim();
  if (!looksLikeUrl(raw)) return '';
  // Many SharePoint/OneDrive share links block iframe embedding due to CSP/X-Frame-Options.
  // Using Office Apps viewer works for many public/accessible links without storing anything locally.
  if (isSharePointOrOneDriveUrl(raw)) {
    return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(raw)}`;
  }
  return raw;
};

type OpportunityLite = {
  id?: string;
  opportunityRefNo?: string;
  tenderName?: string;
  clientName?: string;
  internalLead?: string;
  avenirStatus?: string;
  groupClassification?: string;
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

const VERTICAL_OPTIONS = ['GTS', 'GDS', 'GES', 'OTHERS'] as const;
type Vertical = typeof VERTICAL_OPTIONS[number];

export default function PotentialOpportunities() {
  const { token, canPerformAction, isMaster } = useAuth();
  const { opportunities, refreshData } = useData();
  const canWrite = Boolean(canPerformAction?.('opportunities_write'));

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [rows, setRows] = useState<PotentialRow[]>([]);
  const [loading, setLoading] = useState(false);
  const loadProgress = useProgressLoader(loading, { capAt: 92 });
  const [q, setQ] = useState('');
  type TabKey = 'cards' | 'grid' | 'excel' | 'search' | 'manual';
  const [activeTab, setActiveTab] = useState<TabKey>('cards');
  const [selectedVertical, setSelectedVertical] = useState<Vertical | 'ALL'>('ALL');

  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<PotentialRow | null>(null);
  const [editOverview, setEditOverview] = useState('');
  const [editExtraPairs, setEditExtraPairs] = useState<Array<{ key: string; value: string }>>([]);
  const [editSowLink, setEditSowLink] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (activeTab !== 'search') return;
    if (!token) return;
    if (Array.isArray(opportunities) && opportunities.length) return;
    void refreshData({ background: false }).catch(() => {});
  }, [activeTab, opportunities, refreshData, token]);

  const load = useCallback(async (reason: string) => {
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
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token, q]);

  useEffect(() => {
    void load('initial_mount');
  }, [load]);

  const filteredRows = useMemo(() => {
    let base = rows;
    if (selectedVertical !== 'ALL') {
      base = base.filter(r => {
        const v = (r.opportunity?.groupClassification || 'OTHERS').toUpperCase();
        if (selectedVertical === 'OTHERS') return !['GTS', 'GDS', 'GES'].includes(v);
        return v === selectedVertical;
      });
    }
    return base;
  }, [rows, selectedVertical]);

  const stats = useMemo(() => {
    const total = rows.length;
    const gts = rows.filter(r => (r.opportunity?.groupClassification || '').toUpperCase() === 'GTS').length;
    const gds = rows.filter(r => (r.opportunity?.groupClassification || '').toUpperCase() === 'GDS').length;
    const ges = rows.filter(r => (r.opportunity?.groupClassification || '').toUpperCase() === 'GES').length;
    return { total, gts, gds, ges };
  }, [rows]);

  const opportunitiesByRef = useMemo(() => {
    const map = new Map<string, OpportunityLite>();
    (opportunities || []).forEach((opp) => {
      const ref = normalizeRef(String((opp as unknown as { opportunityRefNo?: string })?.opportunityRefNo || ''));
      if (!ref) return;
      map.set(ref, opp as unknown as OpportunityLite);
    });
    return map;
  }, [opportunities]);

  const toExtraPairs = (extras: Record<string, unknown>) => {
    const pairs = Object.entries(extras || {})
      .filter(([k]) => normalizeExtraKeySlug(k) !== 'overview')
      .filter(([_, v]) => v !== null && v !== undefined && String(v).trim() !== '')
      .map(([k, v]) => ({ key: String(k), value: String(v ?? '') }));
    // Keep SOW link editable via its dedicated field, but also preserve it in pairs if user added a custom key.
    return pairs
      .filter((p) => !['sow link', 'sow', 'scope of work link', 'scope of work', 'sowlink'].includes(normalizeExtraKeySlug(p.key)));
  };

  const pairsToExtras = (pairs: Array<{ key: string; value: string }>) => {
    const out: Record<string, unknown> = {};
    pairs.forEach((p) => {
      const key = normalizeExtraKey(p.key);
      if (!key) return;
      const value = String(p.value ?? '').trim();
      if (!value) return;
      out[key] = value;
    });
    return out;
  };

  const openEdit = (row: PotentialRow) => {
    if (!isMaster) {
       toast.error("Only Master users can edit.");
       return;
    }
    setEditing(row);
    setEditOverview(row.extras?.overview || '');
    const { overview, ...rest } = row.extras || {};
    setEditSowLink(getExtrasSowLink(rest));
    setEditExtraPairs(toExtraPairs(rest));
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!token || !editing) return;
    try {
      const nextExtras = {
        ...pairsToExtras(editExtraPairs),
        ...(editSowLink.trim() ? { 'SOW Link': editSowLink.trim() } : {}),
        overview: editOverview,
      };
      const data = await fetchJson<{ success: boolean; row: MarkRow }>(`${API_URL}/potential-opportunities/${editing.id}/extras`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ extras: nextExtras }),
      });
      toast.success('Saved.');
      setEditOpen(false);
      setEditing(null);
      setRows((prev) => prev.map((r) => (r.id === editing.id ? { ...r, extras: (data.row.extras || {}) as PotentialRow['extras'], updatedAt: data.row.updatedAt } : r)));
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleBulkRemove = async () => {
    if (!canWrite || !selectedIds.size) return;
    if (!confirm(`Remove ${selectedIds.size} items from potential list?`)) return;
    try {
      setLoading(true);
      for (const id of selectedIds) {
        const row = rows.find(r => r.id === id);
        if (row) {
          await fetchJson(`${API_URL}/potential-opportunities/mark`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ opportunityRefNo: row.opportunityRefNo, isPotential: false }),
          });
        }
      }
      toast.success(`Removed ${selectedIds.size} items.`);
      setRows(prev => prev.filter(r => !selectedIds.has(r.id)));
      setSelectedIds(new Set());
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setLoading(false);
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
      if (!canWrite) throw new Error('Permission denied.');
      const buffer = await file.arrayBuffer();
      const workbook = await loadWorkbookFromArrayBuffer(buffer);
      const worksheet = getFirstWorksheet(workbook);
      if (!worksheet) throw new Error('No worksheet.');
      const matrix = worksheetToMatrix(worksheet, { maxRows: MAX_UPLOAD_ROWS });
      const header = matrix[0].map(h => String(h || '').trim().toLowerCase());
      const refIdx = header.findIndex(h => ['opportunity ref no', 'ref no'].includes(h));
      if (refIdx < 0) throw new Error('Missing ref column.');

      const payload = matrix.slice(1).map(r => {
        const ref = String(r[refIdx] || '').trim();
        if (!ref) return null;
        const extras: Record<string, unknown> = {};
        header.forEach((h, i) => { if (i !== refIdx && h) extras[matrix[0][i]] = r[i] || ''; });
        return { opportunityRefNo: ref, extras };
      }).filter(Boolean);

      await fetchJson(`${API_URL}/potential-opportunities/import`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: payload }),
      });
      toast.success('Imported.');
      await load('import_complete');
    } catch (error) { toast.error(error.message); }
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            Potential Opportunities
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage your shortlisted opportunities with ease. Select by vertical and edit high-level details.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => load('refresh')} loading={loading}>Refresh</Button>
          <input ref={fileInputRef} type="file" accept=".xlsx" className="hidden" onChange={e => { if (e.target.files?.[0]) handleExcelUpload(e.target.files[0]); }} />
          <Button variant="default" onClick={() => fileInputRef.current?.click()} disabled={!canWrite}>
            <FileUp className="mr-2 h-4 w-4" /> Import Excel
          </Button>
        </div>
      </div>

      {loading && (
        <div className="rounded-2xl border bg-card p-3">
          <Progress value={loadProgress} className="h-2" />
          <div className="mt-1 text-xs text-muted-foreground">Loading… {loadProgress}%</div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total', value: stats.total, color: 'primary' },
          { label: 'GTS', value: stats.gts, color: 'cyan' },
          { label: 'GDS', value: stats.gds, color: 'fuchsia' },
          { label: 'GES', value: stats.ges, color: 'emerald' },
        ].map(s => (
          <Card key={s.label} className={cn("rounded-2xl border-2 transition-all", selectedVertical === s.label.toUpperCase() ? "border-primary shadow-md" : "border-transparent")}>
             <CardContent className="p-4 flex flex-col items-center justify-center cursor-pointer" onClick={() => setSelectedVertical(s.label === 'Total' ? 'ALL' : s.label as Vertical)}>
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{s.label}</p>
                <p className="text-3xl font-black mt-1">{s.value}</p>
             </CardContent>
          </Card>
        ))}
      </div>

      <Tabs value={activeTab} onValueChange={v => setActiveTab(v as TabKey)}>
        <TabsList className="bg-muted/50 p-1 rounded-xl">
          <TabsTrigger value="cards" className="rounded-lg gap-2"><LayoutGrid className="h-4 w-4" /> Cards</TabsTrigger>
          <TabsTrigger value="grid" className="rounded-lg gap-2"><ListIcon className="h-4 w-4" /> Table</TabsTrigger>
          <TabsTrigger value="search" className="rounded-lg">Search</TabsTrigger>
          <TabsTrigger value="manual" className="rounded-lg">Manual</TabsTrigger>
        </TabsList>

        <TabsContent value="cards" className="mt-6">
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
             {filteredRows.map(r => (
               (() => {
                 const opp = r.opportunity || opportunitiesByRef.get(normalizeRef(r.opportunityRefNo)) || null;
                 const tenderTitle = (opp?.tenderName && String(opp.tenderName).trim())
                   ? String(opp.tenderName).trim()
                   : (getExtrasTenderName(r.extras) || '').trim() || `Tender ${r.opportunityRefNo}`;
                 const clientTitle = (opp?.clientName && String(opp.clientName).trim())
                   ? String(opp.clientName).trim()
                   : String((r.extras as Record<string, unknown>)?.Client || (r.extras as Record<string, unknown>)?.CLIENT || '').trim() || 'Private Client';
                 const vertical = String(opp?.groupClassification || r.opportunity?.groupClassification || 'Other');
                 const sowLink = getExtrasSowLink(r.extras);
                 const extraPairs = toExtraPairs(r.extras || {});
                 const topExtras = extraPairs.slice(0, 4);
                 const moreCount = Math.max(0, extraPairs.length - topExtras.length);
                 return (
               <Card
                 key={r.id}
                 className={cn(
                   "group relative rounded-3xl border-2 transition-all duration-300 hover:shadow-xl hover:-translate-y-1 overflow-hidden",
                   selectedIds.has(r.id) ? "border-primary bg-primary/5 shadow-inner" : "border-border/50 bg-card/50 backdrop-blur-sm"
                 )}
               >
                 <div className={cn(
                   "absolute inset-x-0 top-0 h-24 opacity-80",
                   vertical === 'GTS' ? "bg-gradient-to-br from-cyan-500/25 via-transparent to-transparent" :
                   vertical === 'GDS' ? "bg-gradient-to-br from-fuchsia-500/25 via-transparent to-transparent" :
                   vertical === 'GES' ? "bg-gradient-to-br from-emerald-500/25 via-transparent to-transparent" :
                   "bg-gradient-to-br from-slate-500/20 via-transparent to-transparent"
                 )} />
                 <div className="absolute top-4 right-4 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="icon" className="rounded-full bg-background/80" onClick={(e) => { e.stopPropagation(); toggleSelect(r.id); }}>
                       {selectedIds.has(r.id) ? <CheckCircle2 className="h-5 w-5 text-primary" /> : <div className="h-5 w-5 rounded-full border-2" />}
                    </Button>
                 </div>
                 <CardHeader className="pb-2">
                   <div className="flex justify-between items-start">
                     <Badge variant="outline" className="font-mono text-[10px]">{r.opportunityRefNo}</Badge>
                     <Badge className={cn(
                       "uppercase text-[10px] font-bold tracking-tighter",
                       vertical === 'GTS' ? "bg-cyan-500/10 text-cyan-600 border-cyan-200" :
                       vertical === 'GDS' ? "bg-fuchsia-500/10 text-fuchsia-600 border-fuchsia-200" :
                       vertical === 'GES' ? "bg-emerald-500/10 text-emerald-600 border-emerald-200" : "bg-slate-500/10 text-slate-600 border-slate-200"
                     )}>
                       {vertical || 'Other'}
                     </Badge>
                   </div>
                   <CardTitle className="text-lg font-bold leading-tight mt-2 line-clamp-2 min-h-[3rem]">
                     {tenderTitle}
                   </CardTitle>
                 </CardHeader>
                 <CardContent className="space-y-4">
                   <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">{clientTitle}</span>
                   </div>
                   <div className="p-3 rounded-2xl bg-muted/30 border border-border/50">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Overview</p>
                      <p className="text-xs line-clamp-3 text-foreground/80 italic">
                        {r.extras?.overview || "No overview provided for this opportunity yet."}
                      </p>
                   </div>
                   <div className="flex flex-wrap gap-2">
                     {sowLink && (
                       <div className="flex items-center gap-2">
                         <Badge variant="secondary" className="text-[10px] py-0.5 rounded-full gap-1">
                           <LinkIcon className="h-3 w-3" /> SOW
                         </Badge>
                         <Button
                           variant="ghost"
                           size="sm"
                           className="h-7 px-2 rounded-full"
                           onClick={(e) => {
                             e.stopPropagation();
                             setEditing(r);
                             setEditSowLink(sowLink);
                             setPreviewOpen(true);
                           }}
                         >
                           <Eye className="h-3.5 w-3.5 mr-1" /> Preview
                         </Button>
                         <Button
                           variant="ghost"
                           size="sm"
                           className="h-7 px-2 rounded-full"
                           onClick={(e) => {
                             e.stopPropagation();
                             if (looksLikeUrl(sowLink)) window.open(sowLink, '_blank', 'noopener,noreferrer');
                           }}
                         >
                           <ExternalLink className="h-3.5 w-3.5 mr-1" /> Open
                         </Button>
                       </div>
                     )}
                   </div>

                   {topExtras.length > 0 && (
                     <div className="grid grid-cols-2 gap-2">
                       {topExtras.map((p) => (
                         <div key={p.key} className="rounded-2xl border bg-background/40 p-2">
                           <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground line-clamp-1">{p.key}</div>
                           <div className="text-xs font-medium text-foreground/90 line-clamp-2">{p.value}</div>
                         </div>
                       ))}
                       {moreCount > 0 && (
                         <div className="rounded-2xl border border-dashed bg-background/20 p-2 flex items-center justify-center">
                           <span className="text-xs text-muted-foreground">+{moreCount} more</span>
                         </div>
                       )}
                     </div>
                   )}
                 </CardContent>
                 <CardFooter className="pt-2 border-t border-border/20 flex justify-between gap-2">
                   <div className="text-[10px] text-muted-foreground">
                      Updated {r.updatedAt ? new Date(r.updatedAt).toLocaleDateString() : '—'}
                   </div>
                   <div className="flex gap-1">
                     <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-full hover:bg-primary/10 hover:text-primary" disabled={!isMaster} onClick={() => openEdit(r)}>
                        <Edit2 className="h-4 w-4" />
                     </Button>
                     <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-full hover:bg-destructive/10 hover:text-destructive" disabled={!canWrite} onClick={async () => {
                        if (confirm("Remove?")) {
                          await markPotential(r.opportunityRefNo, false);
                          setRows(prev => prev.filter(x => x.id !== r.id));
                        }
                     }}>
                        <Trash2 className="h-4 w-4" />
                     </Button>
                   </div>
                 </CardFooter>
               </Card>
                 );
               })()
             ))}
           </div>
        </TabsContent>
      </Tabs>

      {selectedIds.size > 0 && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-4 duration-300">
           <div className="bg-foreground text-background px-6 py-4 rounded-full shadow-2xl flex items-center gap-6 backdrop-blur-xl bg-opacity-90">
              <div className="flex items-center gap-2">
                 <Badge variant="secondary" className="bg-background text-foreground rounded-full px-3">{selectedIds.size}</Badge>
                 <span className="text-sm font-bold">Items selected</span>
              </div>
              <div className="h-6 w-px bg-background/20" />
              <div className="flex gap-2">
                 <Button variant="ghost" size="sm" className="text-background hover:bg-white/10 rounded-full" onClick={() => setSelectedIds(new Set())}>
                    Clear
                 </Button>
                 <Button variant="destructive" size="sm" className="rounded-full px-6" onClick={handleBulkRemove}>
                    Remove Selected
                 </Button>
              </div>
              <Button variant="ghost" size="icon" className="text-background hover:bg-white/10 rounded-full h-8 w-8" onClick={() => setSelectedIds(new Set())}>
                 <X className="h-4 w-4" />
              </Button>
           </div>
        </div>
      )}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-2xl rounded-[2.5rem] border-0 shadow-2xl overflow-hidden">
          <DialogHeader className="bg-primary/5 p-8 -m-6 mb-4">
            <DialogTitle className="text-2xl font-black tracking-tight flex items-center gap-3">
              <Edit2 className="h-6 w-6 text-primary" />
              Edit Potential Detail
            </DialogTitle>
            <p className="text-muted-foreground font-mono text-xs mt-1">{editing?.opportunityRefNo}</p>
          </DialogHeader>
          <div className="space-y-6 px-2">
            <div className="space-y-2">
               <Label className="text-xs font-bold uppercase tracking-widest ml-1">Opportunity Overview</Label>
               <Textarea
                 className="min-h-[120px] rounded-2xl bg-muted/30 border-2 border-transparent focus-visible:border-primary transition-all p-4 resize-none"
                 placeholder="Provide a high-level overview or summary of this potential lead..."
                 value={editOverview}
                 onChange={e => setEditOverview(e.target.value)}
               />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-widest ml-1">SOW Link</Label>
              <div className="flex gap-2">
                <Input
                  className="rounded-2xl bg-muted/30 border-2 border-transparent focus-visible:border-primary transition-all"
                  placeholder="Paste a OneDrive/SharePoint PDF link…"
                  value={editSowLink}
                  onChange={(e) => setEditSowLink(e.target.value)}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-2xl"
                  onClick={() => setPreviewOpen(true)}
                  disabled={!looksLikeUrl(editSowLink)}
                >
                  <Eye className="h-4 w-4 mr-2" /> Preview
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Stored in extras as <span className="font-mono">SOW Link</span>.
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold uppercase tracking-widest ml-1">Extras</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  onClick={() => setEditExtraPairs((prev) => [...prev, { key: '', value: '' }])}
                >
                  <Plus className="h-4 w-4 mr-2" /> Add Field
                </Button>
              </div>
              <div className="space-y-2">
                {editExtraPairs.length === 0 ? (
                  <div className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
                    No extra fields yet. Add a field to store details like bid stage, notes, deadlines, etc.
                  </div>
                ) : (
                  editExtraPairs.map((pair, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-start">
                      <div className="col-span-5">
                        <Input
                          className="rounded-2xl bg-muted/30 border-2 border-transparent focus-visible:border-primary transition-all"
                          placeholder="Field name (e.g. Submission Date)"
                          value={pair.key}
                          onChange={(e) => {
                            const key = e.target.value;
                            setEditExtraPairs((prev) => prev.map((p, i) => (i === idx ? { ...p, key } : p)));
                          }}
                        />
                      </div>
                      <div className="col-span-6">
                        <Input
                          className="rounded-2xl bg-muted/30 border-2 border-transparent focus-visible:border-primary transition-all"
                          placeholder="Value"
                          value={pair.value}
                          onChange={(e) => {
                            const value = e.target.value;
                            setEditExtraPairs((prev) => prev.map((p, i) => (i === idx ? { ...p, value } : p)));
                          }}
                        />
                      </div>
                      <div className="col-span-1 flex justify-end">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="rounded-full hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => setEditExtraPairs((prev) => prev.filter((_, i) => i !== idx))}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
          <DialogFooter className="mt-8 gap-2">
            <Button variant="ghost" className="rounded-2xl px-6" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button className="rounded-2xl px-8 bg-primary hover:shadow-lg hover:shadow-primary/20 transition-all" onClick={saveEdit}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="sm:max-w-5xl h-[80vh] rounded-3xl overflow-hidden p-0">
          <DialogHeader className="p-6 pb-2">
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              SOW Preview
            </DialogTitle>
            <p className="text-xs text-muted-foreground font-mono break-all">{editSowLink || getExtrasSowLink(editing?.extras)}</p>
          </DialogHeader>
          <div className="px-6 pb-6 h-full">
            {looksLikeUrl(editSowLink || '') ? (
              <div className="h-full rounded-2xl border overflow-hidden bg-muted/20">
                <iframe
                  title="SOW Preview"
                  className="w-full h-full"
                  src={toSowPreviewUrl(editSowLink)}
                  sandbox="allow-scripts allow-same-origin allow-popups"
                />
              </div>
            ) : (
              <div className="h-full rounded-2xl border border-dashed flex items-center justify-center text-sm text-muted-foreground">
                Paste a valid URL to preview.
              </div>
            )}
          </div>
          <DialogFooter className="p-6 pt-0 gap-2">
            <Button
              variant="outline"
              className="rounded-2xl"
              onClick={() => {
                const link = editSowLink || '';
                if (looksLikeUrl(link)) window.open(link, '_blank', 'noopener,noreferrer');
              }}
              disabled={!looksLikeUrl(editSowLink || '')}
            >
              <ExternalLink className="h-4 w-4 mr-2" /> Open in new tab
            </Button>
            <Button className="rounded-2xl" onClick={() => setPreviewOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
