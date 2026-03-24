import { useEffect, useMemo, useState } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { UpdateTimeline } from '@/components/TenderUpdates/UpdateTimeline';
import { InteractiveGraph } from '@/components/TenderUpdates/InteractiveGraph';
import {
  addTenderUpdate,
  deleteTenderUpdate,
  getNextDueDate,
  getTenderUpdates,
  seedTenderUpdates,
  type TenderUpdate,
  type TenderUpdateSubType,
  type TenderUpdateType,
} from '@/lib/tenderUpdates';
import tenderUpdatesSeed from '@/data/tenderUpdatesSeed.json';
import { cn } from '@/lib/utils';
import {
  CalendarClock,
  ChevronDown,
  FileDown,
  FileSpreadsheet,
  Filter,
  Maximize2,
  RefreshCw,
  Search,
  Sparkles,
  Wand2,
} from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const SUBTYPE_OPTIONS: Record<TenderUpdateType, { value: TenderUpdateSubType; label: string }[]> = {
  subcontractor: [
    { value: 'contacted', label: 'Contacted' },
    { value: 'response', label: 'Response' },
    { value: 'note', label: 'Note' },
    { value: 'submission', label: 'Submission' },
  ],
  client: [
    { value: 'contacted', label: 'Contacted' },
    { value: 'response', label: 'Response' },
    { value: 'clarification', label: 'Clarification' },
    { value: 'extension', label: 'Extension' },
    { value: 'note', label: 'Note' },
  ],
};

const DUE_RANGE_OPTIONS = [30, 60, 90];

export default function TenderUpdates() {
  const { opportunities } = useData();
  const { isMaster, isAdmin, isProposalHead, user, token } = useAuth();
  const canEdit = isMaster || isAdmin || isProposalHead;

  const [updates, setUpdates] = useState<TenderUpdate[]>(() => getTenderUpdates());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [urgentOnly, setUrgentOnly] = useState(false);
  const [groupFilter, setGroupFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [leadFilter, setLeadFilter] = useState('ALL');
  const [dueOpen, setDueOpen] = useState(true);
  const [dueRange, setDueRange] = useState(30);
  const [addOpen, setAddOpen] = useState(false);
  const [graphOpen, setGraphOpen] = useState(false);
  const [mermaidOpen, setMermaidOpen] = useState(false);
  const [addType, setAddType] = useState<TenderUpdateType>('subcontractor');
  const [addSubType, setAddSubType] = useState<TenderUpdateSubType>('contacted');
  const [addActor, setAddActor] = useState('');
  const [addDate, setAddDate] = useState('');
  const [addDueDate, setAddDueDate] = useState('');
  const [addDetails, setAddDetails] = useState('');

  useEffect(() => {
    setUpdates(getTenderUpdates());
  }, [opportunities]);

  useEffect(() => {
    if (!opportunities.length) return;
    const result = seedTenderUpdates(opportunities, tenderUpdatesSeed);
    if (result.seeded) setUpdates(getTenderUpdates());
  }, [opportunities]);

  const refreshUpdates = () => setUpdates(getTenderUpdates());

  const groups = useMemo(() => {
    const set = new Set<string>();
    opportunities.forEach((opp) => opp.groupClassification && set.add(opp.groupClassification));
    return Array.from(set).sort();
  }, [opportunities]);

  const statuses = useMemo(() => {
    const set = new Set<string>();
    opportunities.forEach((opp) => {
      if (opp.tenderResult) set.add(opp.tenderResult);
      else if (opp.avenirStatus) set.add(opp.avenirStatus);
      else if (opp.canonicalStage) set.add(opp.canonicalStage);
    });
    return Array.from(set).sort();
  }, [opportunities]);

  const leads = useMemo(() => {
    const set = new Set<string>();
    opportunities.forEach((opp) => opp.internalLead && set.add(opp.internalLead));
    return Array.from(set).sort();
  }, [opportunities]);

  const updatesByOpportunity = useMemo(() => {
    const map = new Map<string, TenderUpdate[]>();
    updates.forEach((update) => {
      const list = map.get(update.opportunityId) || [];
      list.push(update);
      map.set(update.opportunityId, list);
    });
    return map;
  }, [updates]);

  const activeFilters = [
    search.trim() ? 'search' : null,
    groupFilter !== 'ALL' ? 'group' : null,
    statusFilter !== 'ALL' ? 'status' : null,
    leadFilter !== 'ALL' ? 'lead' : null,
    urgentOnly ? 'urgent' : null,
  ].filter(Boolean);

  const filteredTenders = opportunities.filter((opp) => {
    const mergedStatus = opp.tenderResult || opp.avenirStatus || opp.canonicalStage || '';
    const nextDue = getNextDueDate(opp.id, updates);
    const matchesUrgent = urgentOnly ? nextDue && ['overdue', 'urgent'].includes(nextDue.status) : true;
    const matchesSearch = !search.trim() || [
      opp.tenderName,
      opp.opportunityRefNo,
      opp.clientName,
      opp.groupClassification,
      opp.internalLead,
    ].join(' ').toLowerCase().includes(search.toLowerCase());
    const matchesGroup = groupFilter === 'ALL' || opp.groupClassification === groupFilter;
    const matchesStatus = statusFilter === 'ALL' || mergedStatus === statusFilter;
    const matchesLead = leadFilter === 'ALL' || opp.internalLead === leadFilter;
    return matchesSearch && matchesGroup && matchesStatus && matchesLead && matchesUrgent;
  });

  useEffect(() => {
    if (filteredTenders.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !filteredTenders.some((opp) => opp.id === selectedId)) {
      setSelectedId(filteredTenders[0].id);
    }
  }, [filteredTenders, selectedId]);

  const selectedTender = filteredTenders.find((opp) => opp.id === selectedId) || null;
  const selectedUpdates = selectedTender ? (updatesByOpportunity.get(selectedTender.id) || []) : [];

  const dueCards = filteredTenders
    .map((opp) => {
      const next = getNextDueDate(opp.id, updates);
      if (!next) return null;
      return {
        id: opp.id,
        refNo: opp.opportunityRefNo,
        name: opp.tenderName,
        dueDate: next.date,
        status: next.status,
      };
    })
    .filter(Boolean)
    .filter((card) => {
      if (!card) return false;
      const diffDays = Math.ceil((new Date(card.dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      return diffDays <= dueRange;
    }) as Array<{ id: string; refNo: string; name: string; dueDate: string; status: string }>;

  const mermaidText = useMemo(() => {
    if (!selectedTender) return '';
    const lines = [
      'flowchart TD',
      `  T["${selectedTender.opportunityRefNo} • ${selectedTender.tenderName}"]`,
      '  T --> S[Subcontractor]',
      '  T --> C[Client]',
    ];
    selectedUpdates.filter((u) => u.type === 'subcontractor').forEach((u, idx) => {
      lines.push(`  S --> S${idx}["${u.subType} • ${u.date}"]`);
    });
    selectedUpdates.filter((u) => u.type === 'client').forEach((u, idx) => {
      lines.push(`  C --> C${idx}["${u.subType} • ${u.date}"]`);
    });
    return lines.join('\n');
  }, [selectedTender, selectedUpdates]);

  const exportExcel = () => {
    const workbook = XLSX.utils.book_new();
    const overview = filteredTenders.map((opp) => {
      const mergedStatus = opp.tenderResult || opp.avenirStatus || opp.canonicalStage || '';
      const next = getNextDueDate(opp.id, updates);
      return {
        RefNo: opp.opportunityRefNo,
        Tender: opp.tenderName,
        Client: opp.clientName,
        Status: mergedStatus,
        Group: opp.groupClassification,
        Lead: opp.internalLead,
        Value: opp.opportunityValue,
        NextDueDate: next?.date || '',
        NextDueStatus: next?.status || '',
        Updates: (updatesByOpportunity.get(opp.id) || []).length,
      };
    });
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(overview), 'Opportunities');

    filteredTenders.forEach((opp) => {
      const updatesForTender = updatesByOpportunity.get(opp.id) || [];
      if (updatesForTender.length === 0) return;
      const rows = updatesForTender.map((u) => ({
        Type: u.type,
        SubType: u.subType,
        Actor: u.actor,
        Date: u.date,
        DueDate: u.dueDate || '',
        Details: u.details,
        CreatedBy: u.createdBy,
        CreatedAt: u.createdAt,
      }));
      const sheetName = `${opp.opportunityRefNo || 'Tender'}`.slice(0, 28);
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), sheetName);
    });

    const stamp = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(workbook, `tender-updates-${stamp}.xlsx`);
  };

  const exportWord = async () => {
    if (!token) {
      toast.error('Please sign in to export.');
      return;
    }
    try {
      const response = await fetch(`${API_URL}/tender-updates-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          tenders: filteredTenders,
          updates,
        }),
      });
      if (!response.ok) throw new Error('Failed to generate Word document');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const stamp = new Date().toISOString().slice(0, 10);
      link.href = url;
      link.download = `tender-updates-${stamp}.docx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error((error as Error).message || 'Failed to export Word document');
    }
  };

  const handleAddUpdate = () => {
    if (!selectedTender) return;
    if (!addActor.trim() || !addDate || !addDetails.trim()) {
      toast.error('Actor, date, and details are required.');
      return;
    }
    addTenderUpdate({
      opportunityId: selectedTender.id,
      type: addType,
      subType: addSubType,
      actor: addActor.trim(),
      date: addDate,
      dueDate: addDueDate ? addDueDate : null,
      details: addDetails.trim(),
      attachments: [],
      createdBy: user?.displayName || user?.email || 'Unknown',
    });
    refreshUpdates();
    setAddOpen(false);
    setAddActor('');
    setAddDate('');
    setAddDueDate('');
    setAddDetails('');
  };

  const dueStatusStyles: Record<string, string> = {
    overdue: 'bg-destructive/15 text-destructive',
    urgent: 'bg-warning/15 text-warning',
    upcoming: 'bg-info/15 text-info',
    safe: 'bg-muted text-muted-foreground',
  };

  const dueCardStyles: Record<string, string> = {
    overdue: 'border-destructive/30 bg-destructive/5',
    urgent: 'border-warning/30 bg-warning/5',
    upcoming: 'border-info/30 bg-info/5',
    safe: 'border-border bg-card/30',
  };

  const renderTenderList = () => (
    <Card className="flex h-full min-h-[18rem] min-w-0 flex-col overflow-x-hidden bg-card/80 p-4 backdrop-blur-sm">
      <div className="mb-3 text-xs uppercase tracking-wider text-muted-foreground">Tender List</div>
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        {filteredTenders.map((opp) => {
          const mergedStatus = opp.tenderResult || opp.avenirStatus || opp.canonicalStage || '';
          const next = getNextDueDate(opp.id, updates);
          const dueBadge = next ? dueStatusStyles[next.status] : 'bg-muted text-muted-foreground';
          return (
            <button
              key={opp.id}
              type="button"
              onClick={() => setSelectedId(opp.id)}
              className={cn(
                "w-full min-w-0 border-b border-border px-3 py-3 text-left transition-colors hover:bg-muted/40",
                selectedId === opp.id && 'border-l-4 border-primary bg-primary/5',
              )}
            >
              <div className="flex min-w-0 items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 break-words font-semibold">{opp.tenderName}</p>
                  <p className="font-mono text-xs text-muted-foreground">{opp.opportunityRefNo}</p>
                </div>
                <Badge className="max-w-[5.5rem] shrink-0 truncate bg-info/10 text-info">{opp.groupClassification || '—'}</Badge>
              </div>
              <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="min-w-0 flex-1 truncate">{opp.internalLead || 'Unassigned'}</span>
                <Badge variant="secondary" className="max-w-[9rem] truncate">{mergedStatus}</Badge>
                <Badge className={cn("max-w-[9rem] truncate", dueBadge)}>{next ? `Due ${next.date}` : 'No due date'}</Badge>
                <Badge variant="outline" className="max-w-[8rem] truncate">{(updatesByOpportunity.get(opp.id) || []).length} updates</Badge>
              </div>
            </button>
          );
        })}
      </div>
    </Card>
  );

  const renderTenderDetail = () => (
    <Card className="flex h-full min-h-[22rem] min-w-0 flex-col overflow-x-hidden bg-card/80 p-4 backdrop-blur-sm">
      {selectedTender ? (
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="truncate text-lg font-semibold">{selectedTender.tenderName}</p>
              <p className="truncate text-xs text-muted-foreground">{selectedTender.opportunityRefNo} • {selectedTender.clientName}</p>
            </div>
            <Button
              className="w-full gap-2 bg-gradient-to-r from-primary to-primary/80 text-primary-foreground shadow-lg hover:from-primary/90 hover:to-primary sm:w-auto"
              onClick={() => setAddOpen(true)}
              disabled={!canEdit}
            >
              <Sparkles className="h-4 w-4" />
              Add Update
            </Button>
          </div>
          <Separator className="my-4" />
          <div className="min-h-0 flex-1 overflow-y-auto pr-1 scrollbar-thin sm:pr-2">
            <UpdateTimeline
              updates={selectedUpdates}
              canEdit={canEdit}
              onDelete={(id) => {
                if (!canEdit) return;
                deleteTenderUpdate(id);
                refreshUpdates();
              }}
            />
          </div>
        </div>
      ) : (
        <div className="flex h-full items-center justify-center text-muted-foreground">
          Select a tender to view updates.
        </div>
      )}
    </Card>
  );

  return (
    <div className="w-full overflow-x-hidden space-y-4 sm:space-y-6">
      <Card className="p-4 sm:p-6 bg-card/80 backdrop-blur-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
              <Sparkles className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-semibold">Tender Updates Tracker</h1>
              <p className="text-sm text-muted-foreground">
                {filteredTenders.length} tenders • {updates.length} updates
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
            <Button variant="outline" className="w-full gap-2 sm:w-auto" size="sm" disabled={!selectedTender} onClick={() => setGraphOpen(true)}>
              <Maximize2 className="h-4 w-4" />
              <span className="hidden sm:inline">Fullscreen Tree</span>
            </Button>
            <Button variant="outline" className="w-full gap-2 sm:w-auto" size="sm" disabled={!selectedTender} onClick={() => setMermaidOpen(true)}>
              <Wand2 className="h-4 w-4" />
              <span className="hidden sm:inline">Mermaid Preview</span>
            </Button>
            <Button variant="outline" className="w-full gap-2 sm:w-auto" size="sm" onClick={exportExcel}>
              <FileSpreadsheet className="h-4 w-4" />
              <span className="hidden sm:inline">Excel</span>
            </Button>
            <Button variant="outline" className="w-full gap-2 sm:w-auto" size="sm" onClick={exportWord}>
              <FileDown className="h-4 w-4" />
              <span className="hidden sm:inline">Word export</span>
            </Button>
          </div>
        </div>
      </Card>

      <div className="sticky top-14 z-40 -mx-3 border-b bg-background/95 px-3 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/60 sm:-mx-4 sm:px-4 sm:py-4 lg:-mx-6 lg:px-6">
        <Card className="p-4 sm:p-5 bg-card/80 backdrop-blur-sm">
          <div className="flex flex-col gap-3 sm:gap-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="relative min-w-0 flex-1">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search tenders, clients, ref numbers..."
                  className="pl-9"
                />
                {search && (
                  <button
                    type="button"
                    className="absolute right-3 top-2.5 text-xs text-muted-foreground"
                    onClick={() => setSearch('')}
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center lg:shrink-0">
                <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen} className="w-full">
                  <CollapsibleTrigger asChild>
                    <Button variant="outline" className="w-full justify-between gap-2 sm:w-auto">
                      <Filter className="h-4 w-4" />
                      <span className="flex items-center gap-2">
                        Filters
                        {activeFilters.length > 0 && <Badge variant="secondary">{activeFilters.length}</Badge>}
                      </span>
                      <ChevronDown className={cn("h-4 w-4 transition-transform", filtersOpen && 'rotate-180')} />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <Select value={groupFilter} onValueChange={setGroupFilter}>
                        <SelectTrigger>
                          <SelectValue placeholder="Group" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ALL">All Groups</SelectItem>
                          {groups.map((group) => (
                            <SelectItem key={group} value={group}>{group}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger>
                          <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ALL">All Statuses</SelectItem>
                          {statuses.map((status) => (
                            <SelectItem key={status} value={status}>{status}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={leadFilter} onValueChange={setLeadFilter}>
                        <SelectTrigger>
                          <SelectValue placeholder="Lead" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ALL">All Leads</SelectItem>
                          {leads.map((lead) => (
                            <SelectItem key={lead} value={lead}>{lead}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="flex items-center gap-2 rounded-md border border-border px-3 py-2">
                        <Switch checked={urgentOnly} onCheckedChange={setUrgentOnly} />
                        <span className="text-xs text-muted-foreground">Urgent only</span>
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
                <Button variant="ghost" size="icon" className="self-end sm:self-auto" onClick={() => refreshUpdates()}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <Card className="p-4 bg-card/80 backdrop-blur-sm">
        <Collapsible open={dueOpen} onOpenChange={setDueOpen}>
          <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 text-left">
            <div className="flex min-w-0 items-center gap-2 text-sm font-semibold uppercase tracking-wider">
              <CalendarClock className="h-4 w-4 shrink-0 text-warning" />
              <span className="truncate">Due Dates Tracker</span>
              {dueCards.some((c) => c.status === 'overdue' || c.status === 'urgent') && (
                <span className="h-2 w-2 shrink-0 rounded-full bg-destructive" />
              )}
            </div>
            <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", dueOpen && 'rotate-180')} />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                {DUE_RANGE_OPTIONS.map((range) => (
                  <Button
                    key={range}
                    size="sm"
                    variant={dueRange === range ? 'default' : 'outline'}
                    onClick={() => setDueRange(range)}
                  >
                    {range} days
                  </Button>
                ))}
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {dueCards.length === 0 && (
                  <p className="text-sm text-muted-foreground">No upcoming due dates in the selected window.</p>
                )}
                {dueCards.map((card) => (
                  <div
                    key={card.id}
                    className={cn(
                      "rounded-lg border backdrop-blur-sm p-3 transition-colors",
                      dueCardStyles[card.status],
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs text-muted-foreground">{card.refNo}</span>
                      <Badge className={dueStatusStyles[card.status]}>{card.status}</Badge>
                    </div>
                    <p className="mt-2 text-sm font-semibold">{card.name}</p>
                    <p className="text-xs text-muted-foreground">Due {card.dueDate}</p>
                  </div>
                ))}
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      <div className="hidden xl:block">
        <PanelGroup direction="horizontal" className="min-h-[clamp(46rem,74vh,60rem)]">
          <Panel defaultSize={40} minSize={28} className="min-h-0">
            {renderTenderList()}
          </Panel>
          <PanelResizeHandle className="flex w-2 items-center justify-center">
            <div className="h-12 w-1 rounded-full bg-border" />
          </PanelResizeHandle>
          <Panel defaultSize={60} minSize={34} className="min-h-0">
            {renderTenderDetail()}
          </Panel>
        </PanelGroup>
      </div>
      <div className="grid grid-cols-1 gap-4 xl:hidden">
        <div className="min-h-0">{renderTenderList()}</div>
        <div className="min-h-0">{renderTenderDetail()}</div>
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Tender Update</DialogTitle>
            <DialogDescription>Capture a new subcontractor or client update.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={addType} onValueChange={(value) => {
                  setAddType(value as TenderUpdateType);
                  setAddSubType(SUBTYPE_OPTIONS[value as TenderUpdateType][0].value);
                }}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="subcontractor">Subcontractor</SelectItem>
                    <SelectItem value="client">Client</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Sub Type</Label>
                <Select value={addSubType} onValueChange={(value) => setAddSubType(value as TenderUpdateSubType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SUBTYPE_OPTIONS[addType].map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Actor</Label>
              <Input value={addActor} onChange={(e) => setAddActor(e.target.value)} placeholder="Who handled this update?" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Date</Label>
                <Input type="date" value={addDate} onChange={(e) => setAddDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Due date (optional)</Label>
                <Input type="date" value={addDueDate} onChange={(e) => setAddDueDate(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Details</Label>
              <Textarea rows={4} value={addDetails} onChange={(e) => setAddDetails(e.target.value)} placeholder="Describe the update." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAddUpdate} disabled={!canEdit}>Save Update</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={graphOpen} onOpenChange={setGraphOpen}>
        <DialogContent className="grid h-[100dvh] w-[100vw] max-w-none translate-x-[-50%] translate-y-[-50%] grid-rows-[auto_1fr] gap-0 rounded-none border-0 p-0 sm:h-[97vh] sm:w-[99vw] sm:rounded-lg sm:border">
          <DialogHeader>
            <div className="px-6 pt-6">
              <DialogTitle>Interactive Tender Tree</DialogTitle>
              <DialogDescription>Selected tender updates in a focused tree view.</DialogDescription>
            </div>
          </DialogHeader>
          <div className="min-h-0 px-3 pb-3 sm:px-6 sm:pb-6">
            {selectedTender ? (
              <InteractiveGraph
                tenderName={selectedTender.tenderName}
                tenderRef={selectedTender.opportunityRefNo}
                updates={selectedUpdates}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground">Select a tender first.</div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={mermaidOpen} onOpenChange={setMermaidOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Mermaid Preview</DialogTitle>
            <DialogDescription>Copy the flowchart syntax below.</DialogDescription>
          </DialogHeader>
          <Textarea rows={10} value={mermaidText} readOnly className="font-mono text-xs" />
          <DialogFooter>
            <Button variant="secondary" onClick={() => setMermaidOpen(false)}>Close</Button>
            <Button
              onClick={() => {
                navigator.clipboard.writeText(mermaidText);
                toast.success('Mermaid copied to clipboard.');
              }}
              disabled={!mermaidText}
            >
              Copy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
