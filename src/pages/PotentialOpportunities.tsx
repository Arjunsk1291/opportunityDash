import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FileDown, FileUp, Plus, Search, Sparkles, Wand2, Edit2, Trash2, CheckCircle2, LayoutGrid, List as ListIcon, X, ExternalLink, Eye, Link as LinkIcon, AlertCircle } from 'lucide-react';
import { useTrackedAction } from '@/hooks/useTrackedAction';
import { ActionProgressBar } from '@/components/ActionProgressBar';
import { motion, AnimatePresence } from 'framer-motion';
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
import { useAsyncAction } from '@/hooks/useAsyncAction';
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
    // If it's already an embed link, don't double-wrap
    if (raw.includes('embed.aspx')) return raw;
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
  const { status: trackedStatus } = useTrackedAction();
  const { opportunities, refreshData } = useData();
  const canWrite = Boolean(canPerformAction?.('opportunities_write'));

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [rows, setRows] = useState<PotentialRow[]>([]);
  const [loading, setLoading] = useState(false);
  const loadProgress = useProgressLoader(loading, { capAt: 92 });

  const { execute: executeImport, isLoading: importing, progress: importProgress } = useAsyncAction({
    action: async (file: File) => {
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

      return fetchJson(`${API_URL}/potential-opportunities/import`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: payload }),
      });
    },
    successMessage: 'Opportunities imported successfully.',
    onSuccess: () => load('import_complete')
  });

  const { execute: executeSave, isLoading: saving, progress: saveProgress } = useAsyncAction({
    action: async () => {
      if (!editing) return;
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
      setRows((prev) => prev.map((r) => (r.id === editing.id ? { ...r, extras: (data.row.extras || {}) as PotentialRow['extras'], updatedAt: data.row.updatedAt } : r)));
      setEditOpen(false);
      setEditing(null);
    },
    successMessage: 'Details updated.'
  });

  const { execute: executeBulkRemove, isLoading: removing, progress: removeProgress } = useAsyncAction({
    action: async () => {
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
      setRows(prev => prev.filter(r => !selectedIds.has(r.id)));
      setSelectedIds(new Set());
    },
    successMessage: (res) => `Successfully removed ${selectedIds.size} items.`
  });
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
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsRow, setDetailsRow] = useState<PotentialRow | null>(null);

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

  const openDetails = (row: PotentialRow) => {
    setDetailsRow(row);
    setDetailsOpen(true);
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
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

  return (
    <>
    <ActionProgressBar status={trackedStatus} />
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
          <input ref={fileInputRef} type="file" accept=".xlsx" className="hidden" onChange={e => { if (e.target.files?.[0]) executeImport(e.target.files[0]); }} />
          <Button variant="default" onClick={() => fileInputRef.current?.click()} disabled={!canWrite} loading={importing}>
            <FileUp className="mr-2 h-4 w-4" /> Import Excel
          </Button>
        </div>
      </div>

      {(loading || importing) && (
        <div className="rounded-2xl border bg-card p-3 shadow-sm animate-in fade-in slide-in-from-top-2">
          <Progress value={importing ? importProgress : loadProgress} className="h-2" />
          <div className="mt-2 flex justify-between items-center px-1">
             <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                {importing ? 'Processing Data Pipeline' : 'Fetching Opportunities'}
             </div>
             <div className="text-[10px] font-black text-primary">
                {importing ? importProgress : loadProgress}%
             </div>
          </div>
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
                 onClick={() => openDetails(r)}
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
                     {isMaster && (
                       <Button
                         variant="ghost"
                         size="sm"
                         className="h-8 w-8 p-0 rounded-full hover:bg-primary/10 hover:text-primary"
                         onClick={(e) => {
                           e.stopPropagation();
                           openEdit(r);
                         }}
                       >
                         <Edit2 className="h-4 w-4" />
                       </Button>
                     )}
                     <Button
                       variant="ghost"
                       size="sm"
                       className="h-8 w-8 p-0 rounded-full hover:bg-destructive/10 hover:text-destructive"
                       disabled={!canWrite}
                       onClick={async (e) => {
                         e.stopPropagation();
                         if (confirm("Remove?")) {
                           await markPotential(r.opportunityRefNo, false);
                           setRows(prev => prev.filter(x => x.id !== r.id));
                         }
                       }}
                     >
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
                 <Button variant="ghost" size="sm" className="text-background hover:bg-white/10 rounded-full" onClick={() => setSelectedIds(new Set())} disabled={removing}>
                    Clear
                 </Button>
                 <Button variant="destructive" size="sm" className="rounded-full px-6" onClick={() => { if(confirm(`Remove ${selectedIds.size} items?`)) executeBulkRemove(); }} loading={removing}>
                    {removing ? `Removing (${removeProgress}%)` : 'Remove Selected'}
                 </Button>
              </div>
              <Button variant="ghost" size="icon" className="text-background hover:bg-white/10 rounded-full h-8 w-8" onClick={() => setSelectedIds(new Set())}>
                 <X className="h-4 w-4" />
              </Button>
           </div>
        </div>
      )}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[90vh] rounded-[2rem] sm:rounded-[2.5rem] border-0 shadow-2xl overflow-hidden p-0 flex flex-col">
          <DialogHeader className="bg-primary/5 p-6 sm:p-8 shrink-0">
            <DialogTitle className="text-xl sm:text-2xl font-black tracking-tight flex items-center gap-3 text-foreground">
              <Edit2 className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
              Edit Potential Detail
            </DialogTitle>
            <p className="text-muted-foreground font-mono text-[10px] sm:text-xs mt-1">{editing?.opportunityRefNo}</p>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto p-6 sm:p-8 pt-4 sm:pt-6 space-y-6">
            <div className="space-y-2">
               <Label className="text-[10px] sm:text-xs font-bold uppercase tracking-widest ml-1 text-muted-foreground">Opportunity Overview</Label>
               <Textarea
                 className="min-h-[120px] rounded-2xl bg-muted/30 border-2 border-transparent focus-visible:border-primary transition-all p-4 resize-none text-sm"
                 placeholder="Provide a high-level overview or summary of this potential lead..."
                 value={editOverview}
                 onChange={e => setEditOverview(e.target.value)}
               />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] sm:text-xs font-bold uppercase tracking-widest ml-1 text-muted-foreground">SOW Link</Label>
              <div className="flex gap-2">
                <Input
                  className="rounded-2xl bg-muted/30 border-2 border-transparent focus-visible:border-primary transition-all text-sm"
                  placeholder="Paste a OneDrive/SharePoint PDF link…"
                  value={editSowLink}
                  onChange={(e) => setEditSowLink(e.target.value)}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-2xl hidden sm:flex"
                  onClick={() => setPreviewOpen(true)}
                  disabled={!looksLikeUrl(editSowLink)}
                >
                  <Eye className="h-4 w-4 mr-2" /> Preview
                </Button>
              </div>
              <p className="text-[10px] sm:text-xs text-muted-foreground">
                Stored in extras as <span className="font-mono">SOW Link</span>.
              </p>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-[10px] sm:text-xs font-bold uppercase tracking-widest ml-1 text-muted-foreground">Extras</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-full h-8 text-xs"
                  onClick={() => setEditExtraPairs((prev) => [...prev, { key: '', value: '' }])}
                >
                  <Plus className="h-3 w-3 mr-2 text-primary" /> Add Field
                </Button>
              </div>
              <div className="space-y-3">
                {editExtraPairs.length === 0 ? (
                  <div className="rounded-2xl border border-dashed p-4 text-center text-sm text-muted-foreground">
                    No extra fields yet. Add a field to store details like bid stage, notes, deadlines, etc.
                  </div>
                ) : (
                  editExtraPairs.map((pair, idx) => (
                    <div key={idx} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-start">
                      <div className="sm:col-span-5">
                        <Input
                          className="rounded-xl bg-muted/30 border-2 border-transparent focus-visible:border-primary transition-all text-sm"
                          placeholder="Field name (e.g. Stage)"
                          value={pair.key}
                          onChange={(e) => {
                            const key = e.target.value;
                            setEditExtraPairs((prev) => prev.map((p, i) => (i === idx ? { ...p, key } : p)));
                          }}
                        />
                      </div>
                      <div className="sm:col-span-6">
                        <Input
                          className="rounded-xl bg-muted/30 border-2 border-transparent focus-visible:border-primary transition-all text-sm"
                          placeholder="Value"
                          value={pair.value}
                          onChange={(e) => {
                            const value = e.target.value;
                            setEditExtraPairs((prev) => prev.map((p, i) => (i === idx ? { ...p, value } : p)));
                          }}
                        />
                      </div>
                      <div className="sm:col-span-1 flex justify-end">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="rounded-full hover:bg-destructive/10 hover:text-destructive h-9 w-9"
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
          <DialogFooter className="p-6 sm:p-8 pt-4 sm:pt-4 border-t shrink-0 flex flex-row justify-end gap-3">
            <Button variant="ghost" className="rounded-xl px-6" onClick={() => setEditOpen(false)} disabled={saving}>Cancel</Button>
            <Button className="rounded-xl px-8 bg-primary hover:shadow-lg hover:shadow-primary/20 transition-all" onClick={() => executeSave()} loading={saving}>
               {saving ? `Saving (${saveProgress}%)` : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-5xl h-[85vh] sm:h-[80vh] rounded-3xl overflow-hidden p-0 flex flex-col">
          <DialogHeader className="p-6 pb-3 border-b shrink-0">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <DialogTitle className="flex items-center gap-2 text-lg">
                  <Eye className="h-5 w-5 text-primary" />
                  SOW Preview
                </DialogTitle>
                <p className="text-[10px] sm:text-xs text-muted-foreground font-mono truncate mt-1">{editSowLink || getExtrasSowLink(editing?.extras)}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="hidden sm:flex rounded-full"
                onClick={() => {
                  const link = editSowLink || '';
                  if (looksLikeUrl(link)) window.open(link, '_blank', 'noopener,noreferrer');
                }}
              >
                <ExternalLink className="h-3.5 w-3.5 mr-2" /> Open External
              </Button>
            </div>
          </DialogHeader>
          <div className="flex-1 min-h-0 relative bg-muted/5">
            {looksLikeUrl(editSowLink || '') ? (
              <div className="absolute inset-0 flex flex-col">
                <div className="flex-1">
                  <iframe
                    title="SOW Preview"
                    className="w-full h-full border-0"
                    src={toSowPreviewUrl(editSowLink)}
                    sandbox="allow-scripts allow-same-origin allow-popups"
                  />
                </div>
                <div className="bg-background/80 backdrop-blur-sm border-t p-3 flex items-center justify-center gap-3">
                  <AlertCircle className="h-4 w-4 text-muted-foreground" />
                  <p className="text-[10px] sm:text-xs text-muted-foreground">
                    Iframe preview restricted by some providers. If blank, use the external link.
                  </p>
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-[10px] sm:text-xs"
                    onClick={() => {
                      const link = editSowLink || '';
                      if (looksLikeUrl(link)) window.open(link, '_blank', 'noopener,noreferrer');
                    }}
                  >
                    Open in new tab
                  </Button>
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center p-8 text-center text-sm text-muted-foreground">
                No valid URL provided for preview.
              </div>
            )}
          </div>
          <DialogFooter className="p-4 sm:p-6 pt-2 sm:pt-2 border-t shrink-0 flex items-center justify-between sm:justify-end gap-2">
            <Button variant="ghost" className="sm:hidden" onClick={() => setPreviewOpen(false)}>Close</Button>
            <div className="flex gap-2">
               <Button
                variant="outline"
                className="rounded-xl flex sm:hidden"
                onClick={() => {
                  const link = editSowLink || '';
                  if (looksLikeUrl(link)) window.open(link, '_blank', 'noopener,noreferrer');
                }}
              >
                <ExternalLink className="h-4 w-4" />
              </Button>
              <Button className="rounded-xl px-8" onClick={() => setPreviewOpen(false)}>Done</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AnimatePresence>
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-5xl h-[85vh] rounded-[2rem] sm:rounded-[2.75rem] border-0 shadow-2xl overflow-hidden p-0 flex flex-col">
          {(() => {
            const row = detailsRow;
            if (!row) return null;
            const opp = row.opportunity || opportunitiesByRef.get(normalizeRef(row.opportunityRefNo)) || null;
            const tenderTitle = (opp?.tenderName && String(opp.tenderName).trim())
              ? String(opp.tenderName).trim()
              : (getExtrasTenderName(row.extras) || '').trim() || `Tender ${row.opportunityRefNo}`;
            const clientTitle = (opp?.clientName && String(opp.clientName).trim())
              ? String(opp.clientName).trim()
              : String((row.extras as Record<string, unknown>)?.Client || (row.extras as Record<string, unknown>)?.CLIENT || '').trim() || 'Private Client';
            const vertical = String(opp?.groupClassification || row.opportunity?.groupClassification || 'Other');
            const sowLink = getExtrasSowLink(row.extras);
            const extraPairs = toExtraPairs(row.extras || {});
            return (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="relative flex-1 flex flex-col min-h-0"
              >
                <div className={cn(
                  "absolute inset-x-0 top-0 h-48 opacity-90",
                  vertical === 'GTS' ? "bg-gradient-to-br from-cyan-500/35 via-transparent to-transparent" :
                  vertical === 'GDS' ? "bg-gradient-to-br from-fuchsia-500/35 via-transparent to-transparent" :
                  vertical === 'GES' ? "bg-gradient-to-br from-emerald-500/35 via-transparent to-transparent" :
                  "bg-gradient-to-br from-slate-500/25 via-transparent to-transparent"
                )} />
                <div className="relative p-6 sm:p-8 pb-4 shrink-0">
                  <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
                    <div className="space-y-2 min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="font-mono text-[10px]">{row.opportunityRefNo}</Badge>
                        <Badge className={cn(
                          "uppercase text-[10px] font-bold tracking-tighter",
                          vertical === 'GTS' ? "bg-cyan-500/10 text-cyan-700 border-cyan-200" :
                          vertical === 'GDS' ? "bg-fuchsia-500/10 text-fuchsia-700 border-fuchsia-200" :
                          vertical === 'GES' ? "bg-emerald-500/10 text-emerald-700 border-emerald-200" : "bg-slate-500/10 text-slate-700 border-slate-200"
                        )}>
                          {vertical || 'Other'}
                        </Badge>
                      </div>
                      <h2 className="text-xl sm:text-2xl md:text-3xl font-black tracking-tight leading-tight truncate sm:whitespace-normal sm:line-clamp-2">
                        {tenderTitle}
                      </h2>
                      <div className="text-sm text-muted-foreground flex items-center gap-2 overflow-hidden">
                        <span className="font-semibold text-foreground truncate">{clientTitle}</span>
                        {opp?.internalLead ? <span className="shrink-0 text-xs">• Lead: {String(opp.internalLead)}</span> : null}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 self-end sm:self-start">
                      {sowLink && (
                        <div className="hidden sm:flex gap-2">
                          <Button
                            variant="outline"
                            className="rounded-full"
                            onClick={() => {
                              setEditing(row);
                              setEditSowLink(sowLink);
                              setPreviewOpen(true);
                            }}
                          >
                            <Eye className="h-4 w-4 mr-2" /> Preview
                          </Button>
                          <Button
                            variant="outline"
                            className="rounded-full"
                            onClick={() => {
                              if (looksLikeUrl(sowLink)) window.open(sowLink, '_blank', 'noopener,noreferrer');
                            }}
                          >
                            <ExternalLink className="h-4 w-4 mr-2" /> Open
                          </Button>
                        </div>
                      )}
                      {isMaster && (
                        <Button className="rounded-full px-6" onClick={() => openEdit(row)}>
                          <Edit2 className="h-4 w-4 mr-2" /> Edit
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto px-6 sm:px-8 pb-20 sm:pb-8">
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-2">
                    <div className="lg:col-span-2 space-y-4">
                      <div className="rounded-3xl border bg-background/60 backdrop-blur p-5 sm:p-6 shadow-sm">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                           <LayoutGrid className="h-3 w-3" /> Overview
                        </div>
                        <div className="mt-3 text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">
                          {row.extras?.overview ? String(row.extras.overview) : 'No overview provided yet.'}
                        </div>
                      </div>

                      <div className="rounded-3xl border bg-background/60 backdrop-blur p-5 sm:p-6 shadow-sm">
                        <div className="flex items-center justify-between mb-4">
                          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                             <Plus className="h-3 w-3" /> Extras
                          </div>
                          {extraPairs.length > 0 ? (
                            <Badge variant="secondary" className="rounded-full text-[10px] px-2">{extraPairs.length} fields</Badge>
                          ) : null}
                        </div>
                        {extraPairs.length === 0 ? (
                          <div className="text-sm text-muted-foreground italic">No extra fields yet.</div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {extraPairs.map((p) => (
                              <div key={p.key} className="rounded-2xl border bg-background/40 p-3 flex flex-col gap-1">
                                <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground line-clamp-1 opacity-70">{p.key}</div>
                                <div className="text-sm font-semibold text-foreground/90 break-words">{p.value}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="rounded-3xl border bg-background/60 backdrop-blur p-6 shadow-sm">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-4">Quick Actions</div>
                        <div className="grid grid-cols-1 gap-2">
                          <Button
                            variant="outline"
                            className="justify-start rounded-2xl h-11"
                            onClick={() => {
                              navigator.clipboard?.writeText(row.opportunityRefNo).catch(() => {});
                              toast.success('Ref copied.');
                            }}
                          >
                            <Wand2 className="h-4 w-4 mr-2 text-primary" /> Copy Ref
                          </Button>
                          {sowLink && looksLikeUrl(sowLink) && (
                            <>
                            <Button
                              variant="outline"
                              className="justify-start rounded-2xl h-11"
                              onClick={() => {
                                navigator.clipboard?.writeText(sowLink).catch(() => {});
                                toast.success('SOW link copied.');
                              }}
                            >
                              <LinkIcon className="h-4 w-4 mr-2 text-primary" /> Copy Link
                            </Button>
                            <Button
                              variant="outline"
                              className="sm:hidden justify-start rounded-2xl h-11"
                              onClick={() => {
                                setEditing(row);
                                setEditSowLink(sowLink);
                                setPreviewOpen(true);
                              }}
                            >
                              <Eye className="h-4 w-4 mr-2 text-primary" /> Preview SOW
                            </Button>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="rounded-3xl border bg-background/60 backdrop-blur p-6 shadow-sm">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Activity Log</div>
                        <div className="space-y-1">
                          <div className="text-xs text-muted-foreground flex justify-between">
                            <span>Updated</span>
                            <span className="font-medium text-foreground">{row.updatedAt ? new Date(row.updatedAt).toLocaleDateString() : '—'}</span>
                          </div>
                          {row.updatedBy && (
                            <div className="text-xs text-muted-foreground flex justify-between">
                              <span>By</span>
                              <span className="font-medium text-foreground truncate ml-4">{row.updatedBy}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="absolute bottom-0 inset-x-0 p-4 sm:p-6 bg-background/80 backdrop-blur-md border-t flex justify-between items-center sm:hidden">
                   <Button variant="ghost" className="rounded-xl" onClick={() => setDetailsOpen(false)}>Close</Button>
                   <div className="flex gap-2">
                     {sowLink && (
                       <Button variant="outline" size="icon" className="rounded-xl h-10 w-10" onClick={() => { if (looksLikeUrl(sowLink)) window.open(sowLink, '_blank'); }}>
                         <ExternalLink className="h-4 w-4" />
                       </Button>
                     )}
                     <Button className="rounded-xl px-6" onClick={() => setDetailsOpen(false)}>Done</Button>
                   </div>
                </div>
              </motion.div>
            );
          })()}
        </DialogContent>
      </Dialog>
      </AnimatePresence>
    </div>
    </>
  );
}
