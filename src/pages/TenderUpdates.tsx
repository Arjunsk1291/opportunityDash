import { useEffect, useMemo, useState } from 'react';
import { Download, FileText, RefreshCw, ShieldAlert } from 'lucide-react';
import { AddUpdateForm } from '@/components/TenderUpdates/AddUpdateForm';
import { UpdateTimeline } from '@/components/TenderUpdates/UpdateTimeline';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/contexts/AuthContext';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useData } from '@/contexts/DataContext';
import type { Opportunity } from '@/data/opportunityData';
import {
  createProjectUpdate,
  getLastUpdate,
  getProjectUpdates,
  getTenderProjectUpdates,
  getUpdateCount,
  type ProjectUpdate,
  type ProjectUpdateType,
} from '@/lib/tenderUpdates';
import { toast } from 'sonner';

type TrackerTender = {
  id: string;
  refNo: string;
  tenderName: string;
  client: string;
  lead: string;
  value: number;
  avenirStatus: string;
  rfpReceivedDate: string | null;
  groupClassification: string;
  tenderType: string;
  tenderResult: string;
  tenderStatusRemark: string;
  remarksReason: string;
  year: number | null;
  rawOpportunity: Opportunity;
};

const STATUS_STYLES: Record<string, string> = {
  AWARDED: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  WORKING: 'bg-amber-100 text-amber-800 border-amber-200',
  ONGOING: 'bg-blue-100 text-blue-800 border-blue-200',
  SUBMITTED: 'bg-violet-100 text-violet-800 border-violet-200',
  'TO START': 'bg-cyan-100 text-cyan-800 border-cyan-200',
  LOST: 'bg-rose-100 text-rose-800 border-rose-200',
  REGRETTED: 'bg-slate-200 text-slate-800 border-slate-300',
  'HOLD/CLOSED': 'bg-zinc-200 text-zinc-800 border-zinc-300',
  'HOLD / CLOSED': 'bg-zinc-200 text-zinc-800 border-zinc-300',
};

const UPDATE_TYPE_LABELS: Record<ProjectUpdateType, string> = {
  vendor_contacted: 'Vendor Contacted',
  vendor_response: 'Vendor Response',
  vendor_finalized: 'Vendor Finalized',
  extension_requested: 'Extension Requested',
  due_date_changed: 'Due Date Changed',
  status_update: 'Status Update',
  general_note: 'General Note',
};

function mapOpportunityToTrackerTender(opportunity: Opportunity): TrackerTender {
  const rawYear = Number(opportunity.rawGraphData?.year || '');
  const year = Number.isFinite(rawYear) && rawYear > 0 ? rawYear : (opportunity.dateTenderReceived ? new Date(opportunity.dateTenderReceived).getFullYear() : null);
  return {
    id: opportunity.id,
    refNo: opportunity.opportunityRefNo || '',
    tenderName: opportunity.tenderName || '',
    client: opportunity.clientName || '',
    lead: opportunity.internalLead || '',
    value: Number(opportunity.opportunityValue || 0),
    avenirStatus: String(opportunity.avenirStatus || opportunity.canonicalStage || '').trim().toUpperCase(),
    rfpReceivedDate: opportunity.dateTenderReceived || null,
    groupClassification: opportunity.groupClassification || '',
    tenderType: opportunity.opportunityClassification || '',
    tenderResult: opportunity.tenderResult || '',
    tenderStatusRemark: opportunity.comments || '',
    remarksReason: opportunity.remarksReason || '',
    year,
    rawOpportunity: opportunity,
  };
}

function formatDate(value?: string | null) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString();
}

function csvEscape(value: unknown) {
  const stringValue = String(value ?? '');
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

export default function TenderUpdates() {
  const { opportunities, refreshData } = useData();
  const { isMaster, token } = useAuth();
  const { formatCurrency } = useCurrency();

  const [selectedGroup, setSelectedGroup] = useState('ALL');
  const [search, setSearch] = useState('');
  const [projectUpdates, setProjectUpdates] = useState<ProjectUpdate[]>([]);
  const [selectedTenderId, setSelectedTenderId] = useState<string | null>(null);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [addUpdateOpen, setAddUpdateOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadModuleData = async () => {
    if (!token) return;
    setIsRefreshing(true);
    try {
      await refreshData();
      const updates = await getProjectUpdates(token);
      setProjectUpdates(updates);
    } catch (error) {
      toast.error((error as Error).message || 'Failed to refresh project tracker');
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (!token) return;
    getProjectUpdates(token)
      .then(setProjectUpdates)
      .catch((error) => toast.error((error as Error).message || 'Failed to load project updates'));
  }, [selectedGroup, token]);

  const trackerTenders = useMemo(
    () => opportunities.map(mapOpportunityToTrackerTender),
    [opportunities]
  );

  const filteredByGroup = useMemo(
    () => trackerTenders.filter((tender) => selectedGroup === 'ALL' || tender.groupClassification === selectedGroup),
    [selectedGroup, trackerTenders]
  );

  const filteredTenders = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    if (!normalizedSearch) return filteredByGroup;
    return filteredByGroup.filter((tender) => (
      [tender.client, tender.refNo, tender.tenderName, tender.lead].join(' ').toLowerCase().includes(normalizedSearch)
    ));
  }, [filteredByGroup, search]);

  const groupedOptions = useMemo(
    () => Array.from(new Set(trackerTenders.map((tender) => tender.groupClassification).filter(Boolean))).sort(),
    [trackerTenders]
  );

  const stats = useMemo(() => {
    const activeStatuses = new Set(['WORKING', 'ONGOING', 'SUBMITTED']);
    return {
      totalProjects: filteredTenders.length,
      activeProjects: filteredTenders.filter((tender) => activeStatuses.has(tender.avenirStatus)).length,
      awardedProjects: filteredTenders.filter((tender) => tender.avenirStatus === 'AWARDED').length,
      totalValue: filteredTenders.reduce((sum, tender) => sum + Number(tender.value || 0), 0),
    };
  }, [filteredTenders]);

  const selectedTender = filteredTenders.find((tender) => tender.id === selectedTenderId)
    || trackerTenders.find((tender) => tender.id === selectedTenderId)
    || null;
  const selectedTenderUpdates = selectedTender ? getTenderProjectUpdates(selectedTender.id, selectedTender.refNo, projectUpdates) : [];

  const handleCreateUpdate = async (payload: Omit<ProjectUpdate, 'id' | 'createdAt' | 'updatedBy'>) => {
    if (!selectedTender || !token) return;
    try {
      await createProjectUpdate(token, {
        ...payload,
        tenderId: selectedTender.id,
        tenderRefNo: selectedTender.refNo,
      });
      const updates = await getProjectUpdates(token);
      setProjectUpdates(updates);
      setAddUpdateOpen(false);
      toast.success('Project update logged.');
    } catch (error) {
      toast.error((error as Error).message || 'Failed to log update');
    }
  };

  const handleExportCsv = () => {
    const header = [
      'Ref No',
      'Received Date',
      'Tender Name',
      'Client',
      'Lead',
      'Value',
      'Status',
      'Group',
      'Updates Count',
      'Last Update',
      'Last Update Type',
    ];

    const lines = filteredTenders.map((tender) => {
      const lastUpdate = getLastUpdate(tender.id, tender.refNo, projectUpdates);
      return [
        tender.refNo,
        tender.rfpReceivedDate || '',
        tender.tenderName,
        tender.client,
        tender.lead,
        tender.value,
        tender.avenirStatus,
        tender.groupClassification,
        getUpdateCount(tender.id, tender.refNo, projectUpdates),
        lastUpdate?.createdAt || '',
        lastUpdate ? UPDATE_TYPE_LABELS[lastUpdate.updateType] : '',
      ].map(csvEscape).join(',');
    });

    const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `project-tracker-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  if (!isMaster) {
    return (
      <Card className="mx-auto mt-8 max-w-2xl border-amber-300/60 bg-amber-50/80">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-amber-900">
            <ShieldAlert className="h-5 w-5" />
            Access Denied
          </CardTitle>
          <CardDescription className="text-amber-800">
            Only Master users can access the Project Tracker module.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Project Tracker</h1>
          <p className="text-sm text-muted-foreground">
            Track project-side tender activity, vendor progress, and follow-up history without changing the core tender schema.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleExportCsv}>
            <Download className="mr-2 h-4 w-4" />
            Export Excel
          </Button>
          <Button variant="outline" onClick={loadModuleData} disabled={isRefreshing}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Projects</CardDescription>
            <CardTitle>{stats.totalProjects}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Active</CardDescription>
            <CardTitle>{stats.activeProjects}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Awarded</CardDescription>
            <CardTitle>{stats.awardedProjects}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Value</CardDescription>
            <CardTitle>{formatCurrency(stats.totalValue)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
            <div className="space-y-2">
              <Label htmlFor="project-tracker-search">Search</Label>
              <Input
                id="project-tracker-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by client, ref no, tender name, or lead"
              />
            </div>
            <div className="space-y-2">
              <Label>Group</Label>
              <Select value={selectedGroup} onValueChange={setSelectedGroup}>
                <SelectTrigger>
                  <SelectValue placeholder="Select group" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Groups</SelectItem>
                  {groupedOptions.map((group) => (
                    <SelectItem key={group} value={group}>{group}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="h-[500px] overflow-auto rounded-md border">
            <Table>
              <TableHeader className="sticky top-0 bg-background">
                <TableRow>
                  <TableHead>Ref No</TableHead>
                  <TableHead>Received Date</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Lead</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Updates Count</TableHead>
                  <TableHead>Last Update Date</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTenders.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="h-24 text-center text-muted-foreground">
                      No tenders matched the current filters.
                    </TableCell>
                  </TableRow>
                )}
                {filteredTenders.map((tender) => {
                  const lastUpdate = getLastUpdate(tender.id, tender.refNo, projectUpdates);
                  const updatesCount = getUpdateCount(tender.id, tender.refNo, projectUpdates);
                  const badgeClass = STATUS_STYLES[tender.avenirStatus] || 'bg-slate-100 text-slate-800 border-slate-200';

                  return (
                    <TableRow
                      key={tender.id}
                      className="cursor-pointer"
                      onClick={() => {
                        setSelectedTenderId(tender.id);
                        setTimelineOpen(true);
                      }}
                    >
                      <TableCell className="font-mono text-xs">{tender.refNo || '—'}</TableCell>
                      <TableCell>{formatDate(tender.rfpReceivedDate)}</TableCell>
                      <TableCell className="max-w-[280px] truncate font-medium">{tender.tenderName || '—'}</TableCell>
                      <TableCell>{tender.client || '—'}</TableCell>
                      <TableCell>{tender.lead || '—'}</TableCell>
                      <TableCell>{formatCurrency(tender.value)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={badgeClass}>{tender.avenirStatus || '—'}</Badge>
                      </TableCell>
                      <TableCell>{updatesCount}</TableCell>
                      <TableCell>{lastUpdate ? formatDate(lastUpdate.createdAt) : '—'}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedTenderId(tender.id);
                            setAddUpdateOpen(true);
                          }}
                        >
                          Update
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

      <Dialog open={timelineOpen} onOpenChange={setTimelineOpen}>
        <DialogContent className="max-w-6xl">
          <DialogHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <DialogTitle>Timeline</DialogTitle>
                <DialogDescription>
                  Review update history and branching vendor activity for the selected tender.
                </DialogDescription>
              </div>
              {selectedTender && (
                <Button
                  onClick={() => {
                    setAddUpdateOpen(true);
                  }}
                >
                  Add Update
                </Button>
              )}
            </div>
          </DialogHeader>

          {selectedTender ? (
            <div className="space-y-4">
              <div className="rounded-xl border bg-slate-50 p-4">
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <span className="font-mono">{selectedTender.refNo}</span>
                  <span>•</span>
                  <span>{selectedTender.tenderName}</span>
                  <span>•</span>
                  <span>{selectedTender.client}</span>
                  <span>•</span>
                  <span>{selectedTender.lead || 'No lead'}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge variant="outline" className={STATUS_STYLES[selectedTender.avenirStatus] || ''}>{selectedTender.avenirStatus || '—'}</Badge>
                  <Badge variant="outline">{selectedTender.groupClassification || 'No Group'}</Badge>
                  <Badge variant="outline">{selectedTender.tenderType || 'No Type'}</Badge>
                </div>
              </div>
              <UpdateTimeline updates={selectedTenderUpdates} />
            </div>
          ) : (
            <div className="flex min-h-[260px] items-center justify-center text-muted-foreground">
              Select a tender to view its timeline.
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={addUpdateOpen} onOpenChange={setAddUpdateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Update</DialogTitle>
            <DialogDescription>
              Log a project-side update against the selected tender.
            </DialogDescription>
          </DialogHeader>

          {selectedTender ? (
            <AddUpdateForm
              existingUpdates={getTenderProjectUpdates(selectedTender.id, selectedTender.refNo, projectUpdates)}
              onSubmit={handleCreateUpdate}
              onCancel={() => setAddUpdateOpen(false)}
            />
          ) : (
            <div className="flex min-h-[180px] items-center justify-center text-muted-foreground">
              <div className="text-center">
                <FileText className="mx-auto mb-3 h-6 w-6" />
                Select a tender before adding an update.
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
