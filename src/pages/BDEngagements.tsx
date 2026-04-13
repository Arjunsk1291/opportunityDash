import { useEffect, useMemo, useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, Sankey } from 'recharts';
import { AlertTriangle, BarChart3, BriefcaseBusiness, Building2, CalendarDays, FileCheck2, Plus, Search, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import {
  BD_ENGAGEMENTS_SEED,
  BDEngagement,
  MEETING_TYPES,
  createBDEngagementId,
  loadBDEngagements,
  resetBDEngagements,
  saveBDEngagements,
} from '@/lib/bdEngagements';

type MeetingTypeOption = typeof MEETING_TYPES[number];

type FormState = {
  ref: string;
  date: string;
  clientName: string;
  meetingType: string;
  status: string;
  discussionPoints: string;
  reportSubmitted: boolean;
  leadGenerated: boolean;
  leadDescription: string;
  nextSteps: string;
  lastContact: string;
};

const DASHBOARD_COLORS = ['#2dd4bf', '#818cf8', '#f59e0b', '#34d399', '#fb7185', '#38bdf8'];

const emptyForm: FormState = {
  ref: '',
  date: '',
  clientName: '',
  meetingType: MEETING_TYPES[0],
  status: 'Open',
  discussionPoints: '',
  reportSubmitted: false,
  leadGenerated: false,
  leadDescription: '',
  nextSteps: '',
  lastContact: '',
};

const sortByDateDesc = (left: string, right: string) => right.localeCompare(left);

const formatMonthLabel = (value: string) => {
  const parsed = new Date(`${value}-01T00:00:00`);
  return parsed.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
};

const formatPrettyDate = (value: string) => {
  if (!value) return '—';
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
};

const buildFormFromRow = (row: BDEngagement): FormState => ({
  ref: row.ref,
  date: row.date,
  clientName: row.clientName,
  meetingType: row.meetingType,
  status: row.status || 'Open',
  discussionPoints: row.discussionPoints,
  reportSubmitted: row.reportSubmitted,
  leadGenerated: row.leadGenerated,
  leadDescription: row.leadDescription,
  nextSteps: row.nextSteps,
  lastContact: row.lastContact,
});

const buildRowFromForm = (form: FormState, current?: BDEngagement): BDEngagement => {
  const timestamp = new Date().toISOString();
  return {
    id: current?.id || createBDEngagementId(),
    ref: form.ref.trim(),
    date: form.date,
    clientName: form.clientName.trim(),
    meetingType: form.meetingType.trim(),
    status: form.status.trim() || 'Open',
    discussionPoints: form.discussionPoints.trim(),
    reportSubmitted: form.reportSubmitted,
    leadGenerated: form.leadGenerated,
    leadDescription: form.leadGenerated ? form.leadDescription.trim() : '',
    nextSteps: form.nextSteps.trim(),
    lastContact: form.lastContact,
    createdAt: current?.createdAt || timestamp,
    updatedAt: timestamp,
  };
};

const chartTooltipStyle = {
  backgroundColor: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '0.9rem',
  color: 'hsl(var(--foreground))',
};

const chartAxisStroke = 'hsl(var(--muted-foreground))';
const chartGridStroke = 'hsl(var(--border))';
const chartNodeFill = 'hsl(var(--muted))';
const chartNodeStroke = 'hsl(var(--border))';
const chartLinkFill = 'hsl(var(--primary))';
const BULK_ADD_ACCESS_KEY = 'bd_engagement_bulk_add_access';

const BDEngagements = () => {
  const { isAdmin, isMaster, user } = useAuth();
  const [rows, setRows] = useState<BDEngagement[]>([]);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [meetingTypeFilter, setMeetingTypeFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [leadFilter, setLeadFilter] = useState<'ALL' | 'YES' | 'NO'>('ALL');
  const [reportFilter, setReportFilter] = useState<'ALL' | 'YES' | 'NO'>('ALL');
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<'date' | 'client' | 'lastContact'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [clientSearch, setClientSearch] = useState('');
  const [clientSort, setClientSort] = useState<'engagements' | 'leads' | 'reports' | 'name' | 'lastContact'>('engagements');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [bulkAccessOpen, setBulkAccessOpen] = useState(false);
  const [bulkAccessInput, setBulkAccessInput] = useState('');
  const [bulkAccessEmails, setBulkAccessEmails] = useState<string[]>([]);
  const [bulkText, setBulkText] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<BDEngagement | null>(null);
  const [editingRow, setEditingRow] = useState<BDEngagement | null>(null);
  const [drilldown, setDrilldown] = useState<{ title: string; rows: BDEngagement[] } | null>(null);
  const [selectedEngagement, setSelectedEngagement] = useState<BDEngagement | null>(null);
  const [selectedClient, setSelectedClient] = useState<string>('');
  const [form, setForm] = useState<FormState>(emptyForm);
  const canBulkAdd = Boolean(isAdmin || isMaster || bulkAccessEmails.includes(String(user?.email || '').toLowerCase()));
  const canManageBulkAccess = Boolean(isAdmin || isMaster);

  const openDrilldown = (title: string, drilldownRows: BDEngagement[]) => {
    setDrilldown({ title, rows: drilldownRows });
  };

  const persistBulkAccess = (emails: string[]) => {
    setBulkAccessEmails(emails);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(BULK_ADD_ACCESS_KEY, JSON.stringify(emails));
    }
  };

  const parseBulkRows = (text: string): BDEngagement[] => {
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const timestamp = new Date().toISOString();
    return lines.map((line, index) => {
      const parts = line.split(',').map((part) => part.trim().replace(/^"(.*)"$/, '$1'));
      const [
        ref,
        date,
        clientName,
        meetingType,
        status,
        discussionPoints,
        reportSubmittedRaw,
        leadGeneratedRaw,
        leadDescription,
        nextSteps,
        lastContact,
      ] = parts;
      if (!ref || !date || !clientName || !meetingType) {
        throw new Error(`Line ${index + 1} missing required fields (ref, date, client, meetingType).`);
      }
      const reportSubmitted = ['yes', 'true', '1'].includes(String(reportSubmittedRaw || '').toLowerCase());
      const leadGenerated = ['yes', 'true', '1'].includes(String(leadGeneratedRaw || '').toLowerCase());
      return {
        id: createBDEngagementId(),
        ref: ref.trim(),
        date: date.trim(),
        clientName: clientName.trim(),
        meetingType: meetingType.trim(),
        status: (status || 'Open').trim() || 'Open',
        discussionPoints: (discussionPoints || '').trim(),
        reportSubmitted,
        leadGenerated,
        leadDescription: leadGenerated ? String(leadDescription || '').trim() : '',
        nextSteps: (nextSteps || '').trim(),
        lastContact: (lastContact || date || '').trim(),
        createdAt: timestamp,
        updatedAt: timestamp,
      };
    });
  };

  const handleBulkAdd = () => {
    try {
      const newRows = parseBulkRows(bulkText);
      setRows((current) => [...newRows, ...current]);
      setBulkText('');
      setBulkDialogOpen(false);
      toast.success(`Added ${newRows.length} engagement${newRows.length === 1 ? '' : 's'}.`);
    } catch (error) {
      console.error('Bulk add failed:', error);
      toast.error((error as Error).message || 'Bulk add failed.');
    }
  };

  useEffect(() => {
    const initialRows = loadBDEngagements();
    setRows(initialRows);
    setSelectedClient(initialRows[0]?.clientName || '');
    if (typeof window !== 'undefined') {
      const raw = window.localStorage.getItem(BULK_ADD_ACCESS_KEY);
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            setBulkAccessEmails(parsed.map((value) => String(value).trim().toLowerCase()).filter(Boolean));
          }
        } catch {
          // ignore invalid local data
        }
      }
    }
  }, []);

  useEffect(() => {
    if (!rows.length) return;
    saveBDEngagements(rows);
  }, [rows]);

  const uniqueClientNames = useMemo(
    () => Array.from(new Set(rows.map((row) => row.clientName).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [rows],
  );
  const statusOptions = useMemo(
    () => Array.from(new Set(rows.map((row) => row.status).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [rows],
  );

  const filteredRows = useMemo(() => {
    const searchTerm = search.trim().toLowerCase();
    const sorted = [...rows].filter((row) => {
      if (meetingTypeFilter !== 'ALL' && row.meetingType !== meetingTypeFilter) return false;
      if (statusFilter !== 'ALL' && row.status !== statusFilter) return false;
      if (leadFilter === 'YES' && !row.leadGenerated) return false;
      if (leadFilter === 'NO' && row.leadGenerated) return false;
      if (reportFilter === 'YES' && !row.reportSubmitted) return false;
      if (reportFilter === 'NO' && row.reportSubmitted) return false;
      if (!searchTerm) return true;

      return [
        row.ref,
        row.clientName,
        row.meetingType,
        row.status,
        row.discussionPoints,
        row.leadDescription,
        row.nextSteps,
      ].join(' ').toLowerCase().includes(searchTerm);
    });

    sorted.sort((left, right) => {
      const direction = sortOrder === 'asc' ? 1 : -1;
      if (sortField === 'client') return left.clientName.localeCompare(right.clientName) * direction;
      if (sortField === 'lastContact') return left.lastContact.localeCompare(right.lastContact) * direction;
      return left.date.localeCompare(right.date) * direction;
    });

    return sorted;
  }, [leadFilter, meetingTypeFilter, reportFilter, rows, search, sortField, sortOrder, statusFilter]);

  const stats = useMemo(() => {
    const totalEngagements = rows.length;
    const totalLeads = rows.filter((row) => row.leadGenerated).length;
    const reportsSubmitted = rows.filter((row) => row.reportSubmitted).length;
    const clientsContacted = new Set(rows.map((row) => row.clientName)).size;
    const leadConversionRate = totalEngagements ? (totalLeads / totalEngagements) * 100 : 0;
    return { totalEngagements, totalLeads, reportsSubmitted, clientsContacted, leadConversionRate };
  }, [rows]);

  const monthlyData = useMemo(() => {
    const grouped = rows.reduce<Record<string, number>>((acc, row) => {
      const key = row.date.slice(0, 7);
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(grouped)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, count]) => ({ month, label: formatMonthLabel(month), count }));
  }, [rows]);

  const meetingTypeBreakdown = useMemo(() => {
    const grouped = rows.reduce<Record<string, number>>((acc, row) => {
      acc[row.meetingType] = (acc[row.meetingType] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(grouped)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name, value }));
  }, [rows]);

  const pipelineData = useMemo(() => ({
    nodes: [
      { name: 'Engagements' },
      { name: 'Reports Submitted' },
      { name: 'No Report Yet' },
      { name: 'Leads Generated' },
      { name: 'Follow-Ups Planned' },
    ],
    links: [
      { source: 0, target: 1, value: rows.filter((row) => row.reportSubmitted).length },
      { source: 0, target: 2, value: rows.filter((row) => !row.reportSubmitted).length },
      { source: 1, target: 3, value: rows.filter((row) => row.reportSubmitted && row.leadGenerated).length },
      { source: 2, target: 3, value: rows.filter((row) => !row.reportSubmitted && row.leadGenerated).length },
      { source: 3, target: 4, value: rows.filter((row) => row.leadGenerated && row.nextSteps.trim()).length },
    ].filter((link) => link.value > 0),
  }), [rows]);

  const topClients = useMemo(() => {
    const grouped = rows.reduce<Record<string, number>>((acc, row) => {
      acc[row.clientName] = (acc[row.clientName] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(grouped)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 8)
      .map(([client, count]) => ({ client, count }));
  }, [rows]);

  const clientSummaries = useMemo(() => {
    const grouped = rows.reduce<Record<string, {
      clientName: string;
      engagements: number;
      leads: number;
      reports: number;
      lastContact: string;
      meetingTypeCounts: Record<string, number>;
      rows: BDEngagement[];
    }>>((acc, row) => {
      if (!acc[row.clientName]) {
        acc[row.clientName] = {
          clientName: row.clientName,
          engagements: 0,
          leads: 0,
          reports: 0,
          lastContact: row.lastContact,
          meetingTypeCounts: {},
          rows: [],
        };
      }
      const entry = acc[row.clientName];
      entry.engagements += 1;
      if (row.leadGenerated) entry.leads += 1;
      if (row.reportSubmitted) entry.reports += 1;
      if (row.lastContact > entry.lastContact) entry.lastContact = row.lastContact;
      entry.meetingTypeCounts[row.meetingType] = (entry.meetingTypeCounts[row.meetingType] || 0) + 1;
      entry.rows.push(row);
      return acc;
    }, {});

    return Object.values(grouped).map((entry) => {
      const primaryMeetingType = Object.entries(entry.meetingTypeCounts)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || '—';
      return {
        clientName: entry.clientName,
        engagements: entry.engagements,
        leads: entry.leads,
        reports: entry.reports,
        lastContact: entry.lastContact,
        primaryMeetingType,
        rows: entry.rows.sort((a, b) => sortByDateDesc(a.date, b.date)),
      };
    });
  }, [rows]);

  const visibleClients = useMemo(() => {
    const searchTerm = clientSearch.trim().toLowerCase();
    const next = clientSummaries.filter((client) => (
      !searchTerm
      || client.clientName.toLowerCase().includes(searchTerm)
      || client.primaryMeetingType.toLowerCase().includes(searchTerm)
    ));

    next.sort((left, right) => {
      if (clientSort === 'name') return left.clientName.localeCompare(right.clientName);
      if (clientSort === 'leads') return right.leads - left.leads || left.clientName.localeCompare(right.clientName);
      if (clientSort === 'reports') return right.reports - left.reports || left.clientName.localeCompare(right.clientName);
      if (clientSort === 'lastContact') return right.lastContact.localeCompare(left.lastContact);
      return right.engagements - left.engagements || left.clientName.localeCompare(right.clientName);
    });

    return next;
  }, [clientSearch, clientSort, clientSummaries]);

  const selectedClientSummary = useMemo(
    () => visibleClients.find((client) => client.clientName === selectedClient) || visibleClients[0] || null,
    [selectedClient, visibleClients],
  );

  useEffect(() => {
    if (!selectedClientSummary) {
      setSelectedClient('');
      return;
    }
    if (selectedClient !== selectedClientSummary.clientName) {
      setSelectedClient(selectedClientSummary.clientName);
    }
  }, [selectedClient, selectedClientSummary]);

  const openCreateDialog = () => {
    setEditingRow(null);
    setForm({
      ...emptyForm,
      date: new Date().toISOString().slice(0, 10),
      lastContact: new Date().toISOString().slice(0, 10),
      ref: `BD-${new Date().getFullYear()}-${String(rows.length + 1).padStart(3, '0')}`,
    });
    setDialogOpen(true);
  };

  const openEditDialog = (row: BDEngagement) => {
    setEditingRow(row);
    setForm(buildFormFromRow(row));
    setDialogOpen(true);
  };

  const saveRow = () => {
    if (!form.ref.trim() || !form.date || !form.clientName.trim() || !form.meetingType.trim()) return;
    const nextRow = buildRowFromForm(form, editingRow || undefined);
    setRows((current) => {
      const nextRows = editingRow
        ? current.map((row) => (row.id === editingRow.id ? nextRow : row))
        : [nextRow, ...current];
      return nextRows.sort((a, b) => sortByDateDesc(a.date, b.date));
    });
    setDialogOpen(false);
  };

  const resetSeedData = () => {
    const seed = resetBDEngagements();
    setRows(seed);
    setSelectedClient(seed[0]?.clientName || '');
  };

  const deleteRow = () => {
    if (!deleteTarget) return;
    setRows((current) => current.filter((row) => row.id !== deleteTarget.id));
    setDeleteTarget(null);
  };

  const statCards = [
    {
      label: 'Total Engagements',
      value: stats.totalEngagements,
      icon: BriefcaseBusiness,
      accent: 'from-teal-400/40 to-cyan-400/5',
      rows: rows,
    },
    {
      label: 'Total Leads',
      value: stats.totalLeads,
      icon: Users,
      accent: 'from-violet-400/40 to-indigo-400/5',
      rows: rows.filter((row) => row.leadGenerated),
    },
    {
      label: 'Lead Conversion Rate',
      value: `${stats.leadConversionRate.toFixed(1)}%`,
      icon: BarChart3,
      accent: 'from-emerald-400/40 to-teal-400/5',
      rows: rows.filter((row) => row.leadGenerated),
    },
    {
      label: 'Clients Contacted',
      value: stats.clientsContacted,
      icon: Building2,
      accent: 'from-amber-400/40 to-orange-400/5',
      rows: rows,
    },
    {
      label: 'Reports Submitted',
      value: stats.reportsSubmitted,
      icon: FileCheck2,
      accent: 'from-sky-400/40 to-blue-400/5',
      rows: rows.filter((row) => row.reportSubmitted),
    },
  ];

  return (
    <div className="space-y-6 pb-10">
      <section className="relative overflow-hidden rounded-[28px] border border-slate-800 bg-[radial-gradient(circle_at_top_left,_rgba(45,212,191,0.16),_transparent_32%),radial-gradient(circle_at_top_right,_rgba(129,140,248,0.12),_transparent_28%),linear-gradient(180deg,_#020617,_#0f172a)] p-6 text-slate-50 shadow-2xl shadow-slate-950/40">
        <div className="absolute inset-0 opacity-30" style={{ backgroundImage: 'linear-gradient(rgba(148,163,184,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.08) 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
        <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl space-y-3">
            <Badge className="border-teal-400/30 bg-teal-400/10 text-teal-200 hover:bg-teal-400/10">BD Engagement Management</Badge>
            <h1 className="text-3xl font-black tracking-tight sm:text-4xl">Client engagement intelligence in one place.</h1>
            <p className="max-w-2xl text-sm leading-7 text-slate-300 sm:text-base">
              A separate BD workspace with live dashboard analytics, engagement CRUD, and a client-centric relationship view. All records persist locally in your browser and stay fully isolated from opportunity dashboard data.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button type="button" className="bg-teal-400 text-slate-950 hover:bg-teal-300" onClick={openCreateDialog}>
              <Plus className="mr-2 h-4 w-4" />
              Add Engagement
            </Button>
            <Button type="button" variant="outline" className="border-slate-700 bg-slate-900/60 text-slate-100 hover:bg-slate-800" onClick={resetSeedData}>
              Reset Seed Data
            </Button>
          </div>
        </div>
      </section>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-muted text-muted-foreground">
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="engagements">Engagements</TabsTrigger>
          <TabsTrigger value="clients">Clients</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {statCards.map((card, index) => (
              <button
                key={card.label}
                type="button"
                onClick={() => openDrilldown(card.label, card.rows)}
                className="text-left"
              >
                <Card className="group relative overflow-hidden border-border bg-card text-card-foreground shadow-xl">
                  <div className={`absolute inset-0 bg-gradient-to-br ${card.accent} opacity-70 transition-opacity duration-300 group-hover:opacity-100`} />
                  <CardContent className="relative flex items-start justify-between p-5">
                    <div>
                      <div className="text-xs uppercase tracking-[0.22em] text-muted-foreground">{card.label}</div>
                      <div className="mt-3 text-3xl font-black tracking-tight">{card.value}</div>
                      <div className="mt-2 text-xs text-muted-foreground">Card {String(index + 1).padStart(2, '0')}</div>
                    </div>
                    <div className="rounded-2xl border border-border bg-background/70 p-3">
                      <card.icon className="h-5 w-5 text-primary" />
                    </div>
                  </CardContent>
                </Card>
              </button>
            ))}
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card className="border-border bg-card text-card-foreground">
              <CardHeader>
                <CardTitle>Engagements Over Time</CardTitle>
              </CardHeader>
              <CardContent className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} />
                    <XAxis dataKey="label" stroke={chartAxisStroke} tickLine={false} axisLine={false} />
                    <YAxis stroke={chartAxisStroke} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={chartTooltipStyle} />
                    <Bar
                      dataKey="count"
                      radius={[10, 10, 0, 0]}
                      fill="#2dd4bf"
                      onClick={(dataPoint) => {
                        const monthKey = (dataPoint?.payload as { month?: string })?.month;
                        if (!monthKey) return;
                        const monthRows = rows.filter((row) => row.date.startsWith(monthKey));
                        openDrilldown(`Engagements • ${formatMonthLabel(monthKey)}`, monthRows);
                      }}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="border-border bg-card text-card-foreground">
              <CardHeader>
                <CardTitle>Meeting Type Breakdown</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
                <div className="h-[320px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={meetingTypeBreakdown}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={68}
                        outerRadius={110}
                        paddingAngle={3}
                        onClick={(dataPoint) => {
                          const meetingType = (dataPoint?.payload as { name?: string })?.name;
                          if (!meetingType) return;
                          openDrilldown(`Meeting Type • ${meetingType}`, rows.filter((row) => row.meetingType === meetingType));
                        }}
                      >
                        {meetingTypeBreakdown.map((entry, index) => (
                          <Cell key={entry.name} fill={DASHBOARD_COLORS[index % DASHBOARD_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={chartTooltipStyle} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-3">
                  {meetingTypeBreakdown.map((entry, index) => (
                    <button
                      key={entry.name}
                      type="button"
                      onClick={() => openDrilldown(`Meeting Type • ${entry.name}`, rows.filter((row) => row.meetingType === entry.name))}
                      className="flex w-full items-center justify-between rounded-2xl border border-border bg-muted/40 px-3 py-2 text-left"
                    >
                      <div className="flex items-center gap-3">
                        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: DASHBOARD_COLORS[index % DASHBOARD_COLORS.length] }} />
                        <span className="text-sm text-foreground">{entry.name}</span>
                      </div>
                      <span className="text-sm font-semibold text-foreground">{entry.value}</span>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
            <Card className="border-border bg-card text-card-foreground">
              <CardHeader>
                <CardTitle>Lead Pipeline</CardTitle>
              </CardHeader>
              <CardContent className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <Sankey
                    data={pipelineData}
                    nodePadding={28}
                    nodeWidth={18}
                    iterations={32}
                    margin={{ top: 16, right: 120, bottom: 16, left: 16 }}
                    link={{ fill: chartLinkFill, fillOpacity: 0.22 }}
                    node={{ fill: chartNodeFill, stroke: chartNodeStroke, strokeWidth: 1.25 }}
                  >
                    <Tooltip contentStyle={chartTooltipStyle} />
                  </Sankey>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="border-border bg-card text-card-foreground">
              <CardHeader>
                <CardTitle>Top Clients by Engagement Count</CardTitle>
              </CardHeader>
              <CardContent className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart layout="vertical" data={topClients}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} />
                    <XAxis type="number" stroke={chartAxisStroke} tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="client" width={120} stroke={chartAxisStroke} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={chartTooltipStyle} />
                    <Bar
                      dataKey="count"
                      radius={[0, 10, 10, 0]}
                      fill="#818cf8"
                      onClick={(dataPoint) => {
                        const clientName = (dataPoint?.payload as { client?: string })?.client;
                        if (!clientName) return;
                        openDrilldown(`Client • ${clientName}`, rows.filter((row) => row.clientName === clientName));
                      }}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="engagements" className="space-y-6">
          <Card className="border-border bg-card text-card-foreground">
            <CardContent className="p-5">
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(0,0.7fr))]">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search ref, client, meeting, notes..." className="pl-9" />
                </div>
                <Select value={meetingTypeFilter} onValueChange={setMeetingTypeFilter}>
                  <SelectTrigger><SelectValue placeholder="Meeting Type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Meeting Types</SelectItem>
                    {MEETING_TYPES.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Status</SelectItem>
                    {statusOptions.map((status) => <SelectItem key={status} value={status}>{status}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={leadFilter} onValueChange={(value) => setLeadFilter(value as 'ALL' | 'YES' | 'NO')}>
                  <SelectTrigger><SelectValue placeholder="Lead Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Leads</SelectItem>
                    <SelectItem value="YES">Lead Yes</SelectItem>
                    <SelectItem value="NO">Lead No</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={reportFilter} onValueChange={(value) => setReportFilter(value as 'ALL' | 'YES' | 'NO')}>
                  <SelectTrigger><SelectValue placeholder="Report Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Reports</SelectItem>
                    <SelectItem value="YES">Report Yes</SelectItem>
                    <SelectItem value="NO">Report No</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={`${sortField}:${sortOrder}`} onValueChange={(value) => {
                  const [field, order] = value.split(':');
                  setSortField(field as 'date' | 'client' | 'lastContact');
                  setSortOrder(order as 'asc' | 'desc');
                }}>
                  <SelectTrigger><SelectValue placeholder="Sort" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="date:desc">Newest First</SelectItem>
                    <SelectItem value="date:asc">Oldest First</SelectItem>
                    <SelectItem value="client:asc">Client A-Z</SelectItem>
                    <SelectItem value="lastContact:desc">Latest Contact</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>Engagement Records</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">{filteredRows.length} visible of {rows.length} stored engagements</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {canManageBulkAccess && (
                  <Button type="button" variant="outline" onClick={() => {
                    setBulkAccessInput(bulkAccessEmails.join(', '));
                    setBulkAccessOpen(true);
                  }}>
                    Manage Bulk Access
                  </Button>
                )}
                {canBulkAdd && (
                  <Button type="button" variant="outline" onClick={() => setBulkDialogOpen(true)}>
                    Bulk Add
                  </Button>
                )}
                <Button type="button" onClick={openCreateDialog}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Engagement
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ref</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Client Name</TableHead>
                    <TableHead>Meeting Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Discussion Points</TableHead>
                    <TableHead>Report</TableHead>
                    <TableHead>Lead</TableHead>
                    <TableHead>Lead Description</TableHead>
                    <TableHead>Next Steps</TableHead>
                    <TableHead>Last Contact</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.map((row) => (
                    <TableRow key={row.id} className="cursor-pointer" onClick={() => setSelectedEngagement(row)}>
                      <TableCell className="font-medium">{row.ref}</TableCell>
                      <TableCell>{formatPrettyDate(row.date)}</TableCell>
                      <TableCell>{row.clientName}</TableCell>
                      <TableCell>{row.meetingType}</TableCell>
                      <TableCell>{row.status || '—'}</TableCell>
                      <TableCell className="max-w-[240px] truncate">{row.discussionPoints}</TableCell>
                      <TableCell>{row.reportSubmitted ? <Badge className="border border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">Yes</Badge> : <Badge variant="outline">No</Badge>}</TableCell>
                      <TableCell>{row.leadGenerated ? <Badge className="border border-violet-500/20 bg-violet-500/10 text-violet-700 dark:text-violet-300">Yes</Badge> : <Badge variant="outline">No</Badge>}</TableCell>
                      <TableCell className="max-w-[220px] truncate">{row.leadDescription || '—'}</TableCell>
                      <TableCell className="max-w-[220px] truncate">{row.nextSteps || '—'}</TableCell>
                      <TableCell>{formatPrettyDate(row.lastContact)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button type="button" size="sm" variant="outline" onClick={(event) => { event.stopPropagation(); openEditDialog(row); }}>Edit</Button>
                          <Button type="button" size="sm" variant="destructive" onClick={(event) => { event.stopPropagation(); setDeleteTarget(row); }}>Delete</Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredRows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={12} className="py-12 text-center text-sm text-muted-foreground">
                        No engagement records match the current filters.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="clients" className="space-y-6">
          <Card className="border-border bg-card text-card-foreground">
            <CardContent className="grid gap-3 p-5 lg:grid-cols-[minmax(0,1fr)_220px]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={clientSearch} onChange={(event) => setClientSearch(event.target.value)} placeholder="Search client or meeting type..." className="pl-9" />
              </div>
              <Select value={clientSort} onValueChange={(value) => setClientSort(value as 'engagements' | 'leads' | 'reports' | 'name' | 'lastContact')}>
                <SelectTrigger><SelectValue placeholder="Sort clients" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="engagements">Most Engagements</SelectItem>
                  <SelectItem value="leads">Most Leads</SelectItem>
                  <SelectItem value="reports">Most Reports</SelectItem>
                  <SelectItem value="lastContact">Latest Contact</SelectItem>
                  <SelectItem value="name">Client A-Z</SelectItem>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(360px,1.05fr)]">
            <div className="grid gap-4 sm:grid-cols-2">
              {visibleClients.map((client, index) => (
                <button
                  key={client.clientName}
                  type="button"
                  onClick={() => {
                    setSelectedClient(client.clientName);
                    openDrilldown(`Client • ${client.clientName}`, client.rows);
                  }}
                  className={`rounded-[24px] border p-5 text-left shadow-sm transition-all hover:-translate-y-1 ${selectedClientSummary?.clientName === client.clientName ? 'border-teal-400/50 bg-teal-500/10 shadow-teal-500/10' : 'border-border bg-card'}`}
                  style={{ animationDelay: `${index * 35}ms` }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-lg font-bold text-foreground">{client.clientName}</div>
                      <div className="mt-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">{client.primaryMeetingType}</div>
                    </div>
                    <CalendarDays className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-muted px-3 py-2 text-foreground">
                      <div className="text-xs text-muted-foreground">Engagements</div>
                      <div className="mt-1 text-2xl font-black">{client.engagements}</div>
                    </div>
                    <div className="rounded-2xl border border-violet-500/20 bg-violet-500/10 px-3 py-2 text-violet-700 dark:text-violet-300">
                      <div className="text-xs text-violet-600 dark:text-violet-300/80">Leads</div>
                      <div className="mt-1 text-2xl font-black">{client.leads}</div>
                    </div>
                    <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-emerald-700 dark:text-emerald-300">
                      <div className="text-xs text-emerald-600 dark:text-emerald-300/80">Reports</div>
                      <div className="mt-1 text-2xl font-black">{client.reports}</div>
                    </div>
                    <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-amber-700 dark:text-amber-300">
                      <div className="text-xs text-amber-600 dark:text-amber-300/80">Last Contact</div>
                      <div className="mt-1 text-sm font-bold">{formatPrettyDate(client.lastContact)}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            <Card className="border-border bg-card text-card-foreground">
              <CardHeader>
                <CardTitle>{selectedClientSummary?.clientName || 'Client Details'}</CardTitle>
                <p className="text-sm text-muted-foreground">Full engagement history in reverse chronological order.</p>
              </CardHeader>
              <CardContent className="space-y-4">
                {!selectedClientSummary && (
                  <div className="rounded-2xl border border-dashed border-border bg-muted/40 px-4 py-10 text-center text-sm text-muted-foreground">
                    No client selected.
                  </div>
                )}
                {selectedClientSummary?.rows.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => setSelectedEngagement(row)}
                    className="w-full rounded-2xl border border-border bg-background p-4 text-left"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="text-sm font-semibold text-foreground">{row.ref} · {row.meetingType}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{formatPrettyDate(row.date)} · Last contact {formatPrettyDate(row.lastContact)}</div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {row.reportSubmitted ? <Badge className="border border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">Report Submitted</Badge> : <Badge variant="outline">No Report</Badge>}
                        {row.leadGenerated ? <Badge className="border border-violet-500/20 bg-violet-500/10 text-violet-700 dark:text-violet-300">Lead Generated</Badge> : <Badge variant="outline">No Lead</Badge>}
                      </div>
                    </div>
                    <div className="mt-4 grid gap-3 text-sm text-muted-foreground">
                      <div><span className="font-semibold text-foreground">Discussion:</span> {row.discussionPoints}</div>
                      <div><span className="font-semibold text-foreground">Lead Description:</span> {row.leadDescription || '—'}</div>
                      <div><span className="font-semibold text-foreground">Next Steps:</span> {row.nextSteps || '—'}</div>
                    </div>
                  </button>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editingRow ? 'Edit Engagement' : 'Add Engagement'}</DialogTitle>
            <DialogDescription>Manage BD engagement records stored separately from the opportunity dashboard.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Ref</label>
              <Input value={form.ref} onChange={(event) => setForm((current) => ({ ...current, ref: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Date</label>
              <Input type="date" value={form.date} onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Client Name</label>
              <Input list="bd-client-list" value={form.clientName} onChange={(event) => setForm((current) => ({ ...current, clientName: event.target.value }))} />
              <datalist id="bd-client-list">
                {uniqueClientNames.map((name) => <option key={name} value={name} />)}
              </datalist>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Meeting Type</label>
              <Select value={form.meetingType} onValueChange={(value) => setForm((current) => ({ ...current, meetingType: value as MeetingTypeOption }))}>
                <SelectTrigger><SelectValue placeholder="Select meeting type" /></SelectTrigger>
                <SelectContent>
                  {MEETING_TYPES.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Status</label>
              <Input value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))} placeholder="Open / In Progress / Closed" />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium">Discussion Points</label>
              <Textarea value={form.discussionPoints} onChange={(event) => setForm((current) => ({ ...current, discussionPoints: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Report Submitted</label>
              <Select value={form.reportSubmitted ? 'YES' : 'NO'} onValueChange={(value) => setForm((current) => ({ ...current, reportSubmitted: value === 'YES' }))}>
                <SelectTrigger><SelectValue placeholder="Report submitted" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="YES">Yes</SelectItem>
                  <SelectItem value="NO">No</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Lead Generated</label>
              <Select value={form.leadGenerated ? 'YES' : 'NO'} onValueChange={(value) => setForm((current) => ({ ...current, leadGenerated: value === 'YES' }))}>
                <SelectTrigger><SelectValue placeholder="Lead generated" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="YES">Yes</SelectItem>
                  <SelectItem value="NO">No</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium">Lead Description</label>
              <Textarea value={form.leadDescription} onChange={(event) => setForm((current) => ({ ...current, leadDescription: event.target.value }))} disabled={!form.leadGenerated} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium">Next Steps</label>
              <Textarea value={form.nextSteps} onChange={(event) => setForm((current) => ({ ...current, nextSteps: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Last Contact</label>
              <Input type="date" value={form.lastContact} onChange={(event) => setForm((current) => ({ ...current, lastContact: event.target.value }))} />
            </div>
            {!form.clientName.trim() || !form.ref.trim() || !form.date ? (
              <div className="flex items-center gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300 md:col-span-2">
                <AlertTriangle className="h-4 w-4" />
                Ref, date, client, and meeting type are required to save.
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button type="button" onClick={saveRow}>Save Engagement</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkDialogOpen} onOpenChange={setBulkDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Bulk Add Engagements</DialogTitle>
            <DialogDescription>Paste comma-separated rows in the order shown below.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm text-muted-foreground">
            <div className="rounded-lg border bg-muted/40 px-3 py-2 text-xs">
              Format:
              {' '}
              <span className="font-semibold text-foreground">ref,date,clientName,meetingType,status,discussionPoints,reportSubmitted,leadGenerated,leadDescription,nextSteps,lastContact</span>
            </div>
            <Textarea
              value={bulkText}
              onChange={(event) => setBulkText(event.target.value)}
              rows={10}
              placeholder="BD-2026-001,2026-04-01,Client A,Capability Meeting,Open,Discussed scope,YES,NO,,Follow up,2026-04-03"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setBulkDialogOpen(false)}>Cancel</Button>
            <Button type="button" onClick={handleBulkAdd} disabled={!bulkText.trim()}>Add Rows</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkAccessOpen} onOpenChange={setBulkAccessOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Bulk Add Access</DialogTitle>
            <DialogDescription>Allow specific emails to use the bulk add tool.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-sm">Allowed Emails (comma-separated)</Label>
            <Input
              value={bulkAccessInput}
              onChange={(event) => setBulkAccessInput(event.target.value)}
              placeholder="user1@company.com, user2@company.com"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setBulkAccessOpen(false)}>Cancel</Button>
            <Button
              type="button"
              onClick={() => {
                const emails = bulkAccessInput
                  .split(',')
                  .map((value) => value.trim().toLowerCase())
                  .filter(Boolean);
                persistBulkAccess(emails);
                setBulkAccessOpen(false);
                toast.success('Bulk add access updated.');
              }}
            >
              Save Access
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(drilldown)} onOpenChange={(open) => { if (!open) setDrilldown(null); }}>
        <DialogContent className="max-w-[1200px]">
          <DialogHeader>
            <DialogTitle>{drilldown?.title || 'Drilldown'}</DialogTitle>
            <DialogDescription>Click any row to view the full engagement details.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[65vh] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ref</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Meeting</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Report</TableHead>
                  <TableHead>Lead</TableHead>
                  <TableHead>Last Contact</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(drilldown?.rows || []).map((row) => (
                  <TableRow key={row.id} className="cursor-pointer" onClick={() => setSelectedEngagement(row)}>
                    <TableCell className="font-medium">{row.ref}</TableCell>
                    <TableCell>{formatPrettyDate(row.date)}</TableCell>
                    <TableCell>{row.clientName}</TableCell>
                    <TableCell>{row.meetingType}</TableCell>
                    <TableCell>{row.status || '—'}</TableCell>
                    <TableCell>{row.reportSubmitted ? 'Yes' : 'No'}</TableCell>
                    <TableCell>{row.leadGenerated ? 'Yes' : 'No'}</TableCell>
                    <TableCell>{formatPrettyDate(row.lastContact)}</TableCell>
                  </TableRow>
                ))}
                {(drilldown?.rows || []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                      No engagement rows available.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(selectedEngagement)} onOpenChange={(open) => { if (!open) setSelectedEngagement(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Engagement Detail</DialogTitle>
            <DialogDescription>Full record details for the selected engagement.</DialogDescription>
          </DialogHeader>
          {selectedEngagement && (
            <div className="grid gap-4 text-sm">
              <div className="grid gap-2 sm:grid-cols-2">
                <div><span className="font-semibold">Ref:</span> {selectedEngagement.ref}</div>
                <div><span className="font-semibold">Status:</span> {selectedEngagement.status || '—'}</div>
                <div><span className="font-semibold">Client:</span> {selectedEngagement.clientName}</div>
                <div><span className="font-semibold">Meeting Type:</span> {selectedEngagement.meetingType}</div>
                <div><span className="font-semibold">Date:</span> {formatPrettyDate(selectedEngagement.date)}</div>
                <div><span className="font-semibold">Last Contact:</span> {formatPrettyDate(selectedEngagement.lastContact)}</div>
                <div><span className="font-semibold">Report Submitted:</span> {selectedEngagement.reportSubmitted ? 'Yes' : 'No'}</div>
                <div><span className="font-semibold">Lead Generated:</span> {selectedEngagement.leadGenerated ? 'Yes' : 'No'}</div>
              </div>
              <div><span className="font-semibold">Discussion Points:</span> {selectedEngagement.discussionPoints || '—'}</div>
              <div><span className="font-semibold">Lead Description:</span> {selectedEngagement.leadDescription || '—'}</div>
              <div><span className="font-semibold">Next Steps:</span> {selectedEngagement.nextSteps || '—'}</div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete engagement?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove {deleteTarget?.ref || 'this record'} from the BD engagement workspace.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={deleteRow}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default BDEngagements;
