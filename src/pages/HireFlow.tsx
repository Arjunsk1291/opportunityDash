import React, { useEffect, useMemo, useRef, useState } from 'react';
import { z } from 'zod';
import { useTrackedAction } from '@/hooks/useTrackedAction';
import { ActionProgressBar } from '@/components/ActionProgressBar';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import {
  BriefcaseBusiness,
  FileText,
  LayoutDashboard,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Upload,
} from 'lucide-react';

import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

const API_URL = import.meta.env.VITE_API_URL || '/api';

type CandidateStatus = 'new' | 'reviewing' | 'interview' | 'offer' | 'hired' | 'rejected';

type Office = { id: string; code: string; name: string; country: string; currency: string; active: boolean };
type Discipline = { id: string; name: string; description?: string; active: boolean };

type CandidateRow = {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  currentLocation: string;
  nationality?: string;
  disciplineId?: string | null;
  officeId?: string | null;
  locationPreference?: string;
  yearsExperience?: number | null;
  currentEmployer?: string;
  currentPosition?: string;
  expectedSalary?: number | null;
  currentSalary?: number | null;
  offeredSalary?: number | null;
  currency?: string;
  status: CandidateStatus;
  assignedTo?: string;
  createdBy?: string;
  notes?: string;
  extracted?: any;
  rawText?: string;
  createdAt?: string;
  updatedAt?: string;
};

type CvFile = {
  id: string;
  candidateId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt?: string;
};

const statusLabel: Record<CandidateStatus, string> = {
  new: 'New',
  reviewing: 'Reviewing',
  interview: 'Interview',
  offer: 'Offer',
  hired: 'Hired',
  rejected: 'Rejected',
};

const statusBadgeClass: Record<CandidateStatus, string> = {
  new: 'bg-info text-info-foreground border border-info/20',
  reviewing: 'bg-accent text-accent-foreground border border-accent/20',
  interview: 'bg-warning text-warning-foreground border border-warning/20',
  offer: 'bg-warning text-warning-foreground border border-warning/20',
  hired: 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/30',
  rejected: 'bg-red-500/20 text-red-200 border border-red-500/30',
};

const candidateEditSchema = z.object({
  fullName: z.string().trim().min(1, 'Name is required').max(120),
  email: z.string().trim().max(200).optional().default(''),
  phone: z.string().trim().max(80).optional().default(''),
  currentLocation: z.string().trim().max(120).optional().default(''),
  nationality: z.string().trim().max(120).optional().default(''),
  disciplineId: z.string().trim().optional().nullable(),
  officeId: z.string().trim().optional().nullable(),
  locationPreference: z.enum(['', 'UAE', 'India', 'Either']).optional().default(''),
  yearsExperience: z.coerce.number().min(0).max(80).optional().nullable(),
  currentEmployer: z.string().trim().max(200).optional().default(''),
  currentPosition: z.string().trim().max(200).optional().default(''),
  expectedSalary: z.coerce.number().min(0).optional().nullable(),
  currency: z.string().trim().max(8).optional().default(''),
  status: z.enum(['new', 'reviewing', 'interview', 'offer', 'hired', 'rejected']).default('new'),
  notes: z.string().trim().max(4000).optional().default(''),
});
type CandidateEditValues = z.infer<typeof candidateEditSchema>;

function formatIsoDate(value?: string | null) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toISOString().slice(0, 10);
}

export default function HireFlow() {
  const { token, user } = useAuth();
  const { status: trackedStatus } = useTrackedAction();
  const role = user?.role || '';
  const canWrite = role === 'Master' || role === 'Admin';

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [tab, setTab] = useState<'dashboard' | 'candidates' | 'upload' | 'config'>('dashboard');
  const [loading, setLoading] = useState(false);
  const [metaLoading, setMetaLoading] = useState(false);
  const [offices, setOffices] = useState<Office[]>([]);
  const [disciplines, setDisciplines] = useState<Discipline[]>([]);

  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState<CandidateStatus | 'all'>('all');
  const [rows, setRows] = useState<CandidateRow[]>([]);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<{ candidate: CandidateRow; files: CvFile[] } | null>(null);
  const [cvPreviewUrl, setCvPreviewUrl] = useState<string>('');

  const editForm = useForm<CandidateEditValues>({
    resolver: zodResolver(candidateEditSchema),
    defaultValues: {
      fullName: '',
      email: '',
      phone: '',
      currentLocation: '',
      nationality: '',
      disciplineId: null,
      officeId: null,
      locationPreference: '',
      yearsExperience: null,
      currentEmployer: '',
      currentPosition: '',
      expectedSalary: null,
      currency: '',
      status: 'new',
      notes: '',
    },
  });

  useEffect(() => {
    return () => {
      if (cvPreviewUrl) URL.revokeObjectURL(cvPreviewUrl);
    };
  }, [cvPreviewUrl]);

  const disciplineById = useMemo(() => new Map(disciplines.map((d) => [d.id, d])), [disciplines]);
  const officeById = useMemo(() => new Map(offices.map((o) => [o.id, o])), [offices]);

  const loadMeta = async () => {
    if (!token) return;
    setMetaLoading(true);
    try {
      const res = await fetch(`${API_URL}/hireflow/meta`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to load meta');
      setOffices(Array.isArray(data.offices) ? data.offices : []);
      setDisciplines(Array.isArray(data.disciplines) ? data.disciplines : []);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setMetaLoading(false);
    }
  };

  const loadCandidates = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (q.trim()) qs.set('q', q.trim());
      if (statusFilter !== 'all') qs.set('status', statusFilter);
      const res = await fetch(`${API_URL}/hireflow/candidates?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to load candidates');
      setRows(Array.isArray(data.rows) ? data.rows : []);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const openCandidate = async (id: string) => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/hireflow/candidates/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to load candidate');
      const candidate = data.candidate as CandidateRow;
      const files = Array.isArray(data.files) ? (data.files as CvFile[]) : [];
      setDetail({ candidate, files });

      editForm.reset({
        fullName: candidate.fullName || '',
        email: candidate.email || '',
        phone: candidate.phone || '',
        currentLocation: candidate.currentLocation || '',
        nationality: candidate.nationality || '',
        disciplineId: candidate.disciplineId || null,
        officeId: candidate.officeId || null,
        locationPreference: (candidate.locationPreference as any) || '',
        yearsExperience: candidate.yearsExperience ?? null,
        currentEmployer: candidate.currentEmployer || '',
        currentPosition: candidate.currentPosition || '',
        expectedSalary: candidate.expectedSalary ?? null,
        currency: candidate.currency || '',
        status: candidate.status || 'new',
        notes: candidate.notes || '',
      });

      setDetailOpen(true);
      setCvPreviewUrl('');
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const previewCv = async (file: CvFile) => {
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/hireflow/cv-files/${file.id}/content`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Preview failed');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setCvPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const saveCandidate = async (values: CandidateEditValues) => {
    if (!token || !detail) return;
    if (!canWrite) {
      toast.error('Write access requires Master/Admin.');
      return;
    }
    try {
      const res = await fetch(`${API_URL}/hireflow/candidates/${detail.candidate.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Save failed');
      toast.success('Candidate updated');
      setDetail((cur) => (cur ? { ...cur, candidate: data.candidate } : cur));
      await loadCandidates();
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const onPickFile = () => fileInputRef.current?.click();

  const uploadFile = async (file: File) => {
    if (!token) return;
    if (!canWrite) {
      toast.error('Upload requires Master/Admin.');
      return;
    }
    setLoading(true);
    try {
      const body = new FormData();
      body.set('file', file);
      const res = await fetch(`${API_URL}/hireflow/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      toast.success('CV uploaded and extracted');
      setTab('candidates');
      await loadCandidates();
      if (data?.candidate?.id) openCandidate(data.candidate.id);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMeta();
    loadCandidates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const stats = useMemo(() => {
    const total = rows.length;
    const byStatus = rows.reduce<Record<string, number>>((acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    }, {});
    return { total, byStatus };
  }, [rows]);

  return (
    <>
    <ActionProgressBar status={trackedStatus} />
    <div className="min-h-[calc(100vh-64px)] bg-background text-foreground">
      <div className="mx-auto max-w-7xl px-3 sm:px-6 py-6 sm:py-10 space-y-6">
        <header className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="font-display text-2xl sm:text-3xl md:text-4xl tracking-tight">HireFlow</h1>
              <p className="text-sm sm:text-base text-muted-foreground max-w-2xl">
                End-to-end interview and hiring management (MongoDB). Access limited to Master/Admin/SVP.
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" className="gap-2" onClick={() => { loadMeta(); loadCandidates(); }} disabled={loading || metaLoading}>
                {(loading || metaLoading) ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Refresh
              </Button>
            </div>
          </div>
        </header>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList className="grid grid-cols-2 sm:grid-cols-4 w-full sm:w-auto">
            <TabsTrigger value="dashboard" className="gap-2"><LayoutDashboard className="h-4 w-4" />Dashboard</TabsTrigger>
            <TabsTrigger value="candidates" className="gap-2"><BriefcaseBusiness className="h-4 w-4" />Candidates</TabsTrigger>
            <TabsTrigger value="upload" className="gap-2"><Upload className="h-4 w-4" />Upload CV</TabsTrigger>
            <TabsTrigger value="config" className="gap-2"><FileText className="h-4 w-4" />Config</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
              <Card className="rounded-2xl">
                <CardHeader className="pb-2"><CardTitle className="text-xs tracking-[0.24em] uppercase text-muted-foreground">Total</CardTitle></CardHeader>
                <CardContent className="text-2xl font-semibold">{stats.total}</CardContent>
              </Card>
              {(['new', 'reviewing', 'interview', 'offer'] as CandidateStatus[]).map((s) => (
                <Card key={s} className="rounded-2xl">
                  <CardHeader className="pb-2"><CardTitle className="text-xs tracking-[0.24em] uppercase text-muted-foreground">{statusLabel[s]}</CardTitle></CardHeader>
                  <CardContent className="text-2xl font-semibold">{stats.byStatus[s] || 0}</CardContent>
                </Card>
              ))}
            </div>

            <Card className="rounded-2xl">
              <CardHeader className="pb-3"><CardTitle>Quick actions</CardTitle></CardHeader>
              <CardContent className="flex flex-col sm:flex-row gap-2">
                <Button className="gap-2" onClick={() => setTab('upload')} disabled={!canWrite}>
                  <Plus className="h-4 w-4" /> Upload a CV
                </Button>
                <Button variant="secondary" className="gap-2" onClick={() => setTab('candidates')}>
                  <Search className="h-4 w-4" /> Browse candidates
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="candidates" className="space-y-4">
            <div className="rounded-2xl border bg-card p-3 sm:p-4">
              <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
                <div className="flex-1 flex items-center gap-2">
                  <div className="relative w-full">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input className="pl-9" placeholder="Search name, email, employer…" value={q} onChange={(e) => setQ(e.target.value)} />
                  </div>
                  <Button variant="secondary" onClick={loadCandidates} disabled={loading}>Search</Button>
                </div>
                <div className="flex gap-2">
                  <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
                    <SelectTrigger className="w-[180px]"><SelectValue placeholder="Status" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      {(Object.keys(statusLabel) as CandidateStatus[]).map((s) => (
                        <SelectItem key={s} value={s}>{statusLabel[s]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border bg-card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr className="text-left">
                    <th className="px-4 py-3 font-semibold">Candidate</th>
                    <th className="px-4 py-3 font-semibold hidden md:table-cell">Discipline</th>
                    <th className="px-4 py-3 font-semibold hidden md:table-cell">Office</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold hidden lg:table-cell">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t hover:bg-muted/20 cursor-pointer" onClick={() => openCandidate(r.id)}>
                      <td className="px-4 py-3">
                        <div className="font-medium">{r.fullName}</div>
                        <div className="text-xs text-muted-foreground">{r.email || '—'}</div>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">
                        {r.disciplineId ? (disciplineById.get(r.disciplineId)?.name || '—') : '—'}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">
                        {r.officeId ? (officeById.get(r.officeId)?.code || '—') : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={statusBadgeClass[r.status]}>{statusLabel[r.status]}</Badge>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground">{formatIsoDate(r.updatedAt)}</td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr><td className="px-4 py-8 text-center text-muted-foreground" colSpan={5}>No candidates found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </TabsContent>

          <TabsContent value="upload" className="space-y-4">
            <Card className="rounded-2xl">
              <CardHeader className="pb-3">
                <CardTitle>Upload CV</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-sm text-muted-foreground">
                  Upload PDF/DOCX/TXT. Extraction runs server-side and creates a candidate record automatically.
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) uploadFile(file);
                    e.currentTarget.value = '';
                  }}
                />
                <div className="flex flex-col sm:flex-row gap-2">
                  <Button className="gap-2" onClick={onPickFile} disabled={loading || !canWrite}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    Choose file
                  </Button>
                  {!canWrite && <span className="text-xs text-muted-foreground self-center">Upload requires Master/Admin.</span>}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="config" className="space-y-4">
            <Card className="rounded-2xl">
              <CardHeader className="pb-3">
                <CardTitle>Reference data</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-2">
                <div>Seeded: offices and disciplines are auto-created when HireFlow is first accessed.</div>
                <div>Next: salary bands + offer templates UI (can add when you confirm fields/UX).</div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent side="right" className="w-full sm:max-w-4xl overflow-auto pointer-events-auto">
          <SheetHeader>
            <SheetTitle className="font-display">{detail?.candidate.fullName || 'Candidate'}</SheetTitle>
          </SheetHeader>

          {detail ? (
            <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card className="rounded-2xl">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center justify-between gap-3">
                    <span>CV Preview</span>
                    <div className="flex gap-2">
                      {detail.files.map((f) => (
                        <Button key={f.id} size="sm" variant="secondary" onClick={() => previewCv(f)} className="max-w-[220px] truncate">
                          {f.fileName}
                        </Button>
                      ))}
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {cvPreviewUrl ? (
                    <iframe title="CV preview" src={cvPreviewUrl} className="w-full h-[70vh] rounded-lg border" />
                  ) : (
                    <div className="text-sm text-muted-foreground">Select a file to preview.</div>
                  )}
                </CardContent>
              </Card>

              <div className="space-y-4">
                <Card className="rounded-2xl">
                  <CardHeader className="pb-3">
                    <CardTitle>Candidate</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Form {...editForm}>
                      <form onSubmit={editForm.handleSubmit(saveCandidate)} className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <FormField
                            control={editForm.control}
                            name="fullName"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Full name</FormLabel>
                                <FormControl><Input {...field} disabled={!canWrite} /></FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={editForm.control}
                            name="status"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Status</FormLabel>
                                <Select value={field.value} onValueChange={field.onChange} disabled={!canWrite}>
                                  <FormControl>
                                    <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {(Object.keys(statusLabel) as CandidateStatus[]).map((s) => (
                                      <SelectItem key={s} value={s}>{statusLabel[s]}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <FormField
                            control={editForm.control}
                            name="email"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Email</FormLabel>
                                <FormControl><Input {...field} disabled={!canWrite} /></FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={editForm.control}
                            name="phone"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Phone</FormLabel>
                                <FormControl><Input {...field} disabled={!canWrite} /></FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <FormField
                            control={editForm.control}
                            name="disciplineId"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Discipline</FormLabel>
                                <Select
                                  value={field.value || ''}
                                  onValueChange={(v) => field.onChange(v || null)}
                                  disabled={!canWrite}
                                >
                                  <FormControl>
                                    <SelectTrigger><SelectValue placeholder="Select discipline" /></SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="">—</SelectItem>
                                    {disciplines.map((d) => (
                                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={editForm.control}
                            name="officeId"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Office</FormLabel>
                                <Select
                                  value={field.value || ''}
                                  onValueChange={(v) => field.onChange(v || null)}
                                  disabled={!canWrite}
                                >
                                  <FormControl>
                                    <SelectTrigger><SelectValue placeholder="Select office" /></SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="">—</SelectItem>
                                    {offices.map((o) => (
                                      <SelectItem key={o.id} value={o.id}>{o.code} · {o.name}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        <FormField
                          control={editForm.control}
                          name="notes"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Internal notes</FormLabel>
                              <FormControl><Textarea {...field} rows={4} disabled={!canWrite} /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <div className="flex justify-end gap-2">
                          <Button type="submit" disabled={!canWrite}>Save</Button>
                        </div>
                      </form>
                    </Form>
                  </CardContent>
                </Card>

                <Card className="rounded-2xl">
                  <CardHeader className="pb-3"><CardTitle>Extraction</CardTitle></CardHeader>
                  <CardContent className="text-sm text-muted-foreground space-y-2">
                    <div>Created: {formatIsoDate(detail.candidate.createdAt)} · Updated: {formatIsoDate(detail.candidate.updatedAt)}</div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <div className="text-xs uppercase tracking-[0.18em] opacity-70">Skills</div>
                        <div className="mt-1">
                          {Array.isArray(detail.candidate.extracted?.skills) ? detail.candidate.extracted.skills.slice(0, 18).map((s: string) => (
                            <Badge key={s} variant="secondary" className="mr-1 mb-1">{s}</Badge>
                          )) : '—'}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs uppercase tracking-[0.18em] opacity-70">Certifications</div>
                        <div className="mt-1">
                          {Array.isArray(detail.candidate.extracted?.certifications) ? detail.candidate.extracted.certifications.slice(0, 18).map((s: string) => (
                            <Badge key={s} variant="secondary" className="mr-1 mb-1">{s}</Badge>
                          )) : '—'}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          ) : (
            <div className="mt-6 text-sm text-muted-foreground">Loading…</div>
          )}
        </SheetContent>
      </Sheet>
    </div>
    </>
  );
}

