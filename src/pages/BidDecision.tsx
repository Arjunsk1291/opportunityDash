import { useEffect, useMemo, useState } from 'react';
import { Download, Plus, RefreshCcw, Save, Search, Trash2, FileText, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useData } from '@/contexts/DataContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  BID_DECISION_EXPORT_TEMPLATE_URL,
  BID_DECISION_OPTIONS,
  BID_DECISION_SOURCE_MODES,
  type BidDecisionCriterion,
  type BidDecisionOpportunity,
  type BidDecisionRecord,
  type BidDecisionSourceMode,
  calculateDecisionScore,
  fetchBidDecisionRecords,
  formatDecisionScore,
  getOpportunityBidDecision,
  normalizeBidDecisionCriterion,
  normalizeBidDecisionRecord,
  normalizeBidDecisionState,
  normalizeBidDecisionSourceMode,
  saveBidDecision,
} from '@/lib/bidDecision';
import { toast } from 'sonner';

type BidDecisionFormState = {
  opportunityRefNo: string;
  bidDecision: 'BID' | 'NO BID' | 'BLANK';
  sourceMode: BidDecisionSourceMode;
  criteriaValues: BidDecisionCriterion[];
};

const normalizeRef = (value: unknown) => String(value ?? '').trim().toUpperCase();

const createCriteriaRow = (index: number): BidDecisionCriterion => ({
  key: `criterion-${index + 1}`,
  label: '',
  rating: null,
  weight: null,
  notes: '',
  included: true,
});

const buildFormState = (
  refNo: string,
  record?: BidDecisionRecord | null,
  sourceMode: BidDecisionSourceMode = 'dashboard',
): BidDecisionFormState => {
  const normalizedRecord = record ? normalizeBidDecisionRecord(record) : null;
  return {
    opportunityRefNo: refNo,
    bidDecision: normalizedRecord?.bidDecision || 'BLANK',
    sourceMode: normalizedRecord?.sourceMode || sourceMode,
    criteriaValues: normalizedRecord?.criteriaValues?.length
      ? normalizedRecord.criteriaValues.map((criterion, index) => ({
          ...normalizeBidDecisionCriterion(criterion),
          key: criterion.key || `criterion-${index + 1}`,
        }))
      : [createCriteriaRow(0)],
  };
};

function getOpportunityDecisionLabel(opportunity: BidDecisionOpportunity, record?: BidDecisionRecord | null) {
  if (record?.bidDecision) return record.bidDecision;
  return getOpportunityBidDecision(opportunity);
}

function getOpportunitySourceLabel(record?: BidDecisionRecord | null) {
  return normalizeBidDecisionSourceMode(record?.sourceMode || 'dashboard');
}

function getBadgeVariant(decision: string) {
  if (decision === 'BID') return 'default' as const;
  if (decision === 'NO BID') return 'destructive' as const;
  return 'secondary' as const;
}

function CriterionRow({
  criterion,
  index,
  onChange,
  onRemove,
}: {
  criterion: BidDecisionCriterion;
  index: number;
  onChange: (next: BidDecisionCriterion) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-xl border bg-card p-3 sm:p-4 space-y-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <Badge variant="outline">Criterion {index + 1}</Badge>
            <Badge variant={criterion.included ? 'default' : 'secondary'}>{criterion.included ? 'Included' : 'Excluded'}</Badge>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label className="text-xs">Label</Label>
              <Input
                value={criterion.label}
                onChange={(event) => onChange({ ...criterion, label: event.target.value })}
                placeholder="e.g. Client fit"
              />
            </div>
            <div>
              <Label className="text-xs">Key</Label>
              <Input
                value={criterion.key}
                onChange={(event) => onChange({ ...criterion, key: event.target.value })}
                placeholder="e.g. client_fit"
              />
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <Label className="text-xs">Rating</Label>
              <Input
                type="number"
                inputMode="decimal"
                value={criterion.rating ?? ''}
                onChange={(event) => onChange({ ...criterion, rating: event.target.value === '' ? null : Number(event.target.value) })}
                placeholder="0"
              />
            </div>
            <div>
              <Label className="text-xs">Weight</Label>
              <Input
                type="number"
                inputMode="decimal"
                value={criterion.weight ?? ''}
                onChange={(event) => onChange({ ...criterion, weight: event.target.value === '' ? null : Number(event.target.value) })}
                placeholder="1"
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border px-3 py-2">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Included in score</p>
                <p className="text-sm">{criterion.included ? 'Yes' : 'No'}</p>
              </div>
              <Switch
                checked={criterion.included}
                onCheckedChange={(checked) => onChange({ ...criterion, included: checked })}
              />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="icon" onClick={onRemove} aria-label={`Remove criterion ${index + 1}`}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div>
        <Label className="text-xs">Notes</Label>
        <Input
          value={criterion.notes}
          onChange={(event) => onChange({ ...criterion, notes: event.target.value })}
          placeholder="Optional notes or rationale"
        />
      </div>
    </div>
  );
}

export default function BidDecision() {
  const { opportunities, refreshData } = useData();
  const { token } = useAuth();
  const { formatCurrency } = useCurrency();

  const [records, setRecords] = useState<BidDecisionRecord[]>([]);
  const [selectedRef, setSelectedRef] = useState('');
  const [manualRefInput, setManualRefInput] = useState('');
  const [search, setSearch] = useState('');
  const [decisionFilter, setDecisionFilter] = useState<'ALL' | 'BID' | 'NO BID' | 'BLANK'>('ALL');
  const [sourceFilter, setSourceFilter] = useState<'ALL' | BidDecisionSourceMode>('ALL');
  const [selectionSourceMode, setSelectionSourceMode] = useState<BidDecisionSourceMode>('dashboard');
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [templateReachable, setTemplateReachable] = useState(false);
  const [form, setForm] = useState<BidDecisionFormState>({
    opportunityRefNo: '',
    bidDecision: 'BLANK',
    sourceMode: 'dashboard',
    criteriaValues: [createCriteriaRow(0)],
  });
  const [exportBlockedReason] = useState('The actual Bid Decision workbook template is not available in this workspace.');

  useEffect(() => {
    let cancelled = false;
    const checkTemplate = async () => {
      try {
        const response = await fetch(BID_DECISION_EXPORT_TEMPLATE_URL, { method: 'HEAD' });
        if (!cancelled) setTemplateReachable(response.ok);
      } catch {
        if (!cancelled) setTemplateReachable(false);
      }
    };
    void checkTemplate();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const load = async () => {
      try {
        const next = await fetchBidDecisionRecords(token);
        if (cancelled) return;
        setRecords(next);
      } catch (error) {
        if (!cancelled) {
          toast.error((error as Error).message || 'Failed to load bid decisions');
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const opportunityMap = useMemo(() => {
    const map = new Map<string, BidDecisionOpportunity>();
    opportunities.forEach((opportunity) => {
      map.set(normalizeRef(opportunity.opportunityRefNo), opportunity);
    });
    return map;
  }, [opportunities]);

  const recordMap = useMemo(() => {
    const map = new Map<string, BidDecisionRecord>();
    records.forEach((record) => {
      map.set(normalizeRef(record.opportunityRefNo), record);
    });
    return map;
  }, [records]);

  const selectedOpportunity = selectedRef ? opportunityMap.get(normalizeRef(selectedRef)) || null : null;
  const selectedRecord = selectedRef ? recordMap.get(normalizeRef(selectedRef)) || null : null;
  const selectedSnapshotDecision = selectedOpportunity ? getOpportunityBidDecision(selectedOpportunity) : 'BLANK';
  const selectedSourceMode = selectedRecord?.sourceMode || selectionSourceMode;

  useEffect(() => {
    if (!selectedRef) return;
    setForm(buildFormState(selectedRef, selectedRecord || undefined, selectedSourceMode));
  }, [selectedRecord, selectedRef, selectedSourceMode]);

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return [...opportunities]
      .filter((opportunity) => {
        const ref = normalizeRef(opportunity.opportunityRefNo);
        const record = recordMap.get(ref);
        const decision = getOpportunityDecisionLabel(opportunity, record);
        const sourceMode = getOpportunitySourceLabel(record);
        if (decisionFilter !== 'ALL' && decision !== decisionFilter) return false;
        if (sourceFilter !== 'ALL' && sourceMode !== sourceFilter) return false;
        if (!query) return true;
        return [
          opportunity.opportunityRefNo,
          opportunity.tenderName,
          opportunity.clientName,
          opportunity.internalLead,
          opportunity.opportunityClassification,
          opportunity.avenirStatus,
          opportunity.tenderResult,
          opportunity.tenderStatusRemark,
          decision,
          sourceMode,
        ].join(' ').toLowerCase().includes(query);
      })
      .sort((left, right) => {
        const leftSaved = recordMap.has(normalizeRef(left.opportunityRefNo)) ? 0 : 1;
        const rightSaved = recordMap.has(normalizeRef(right.opportunityRefNo)) ? 0 : 1;
        if (leftSaved !== rightSaved) return leftSaved - rightSaved;
        return normalizeRef(left.opportunityRefNo).localeCompare(normalizeRef(right.opportunityRefNo));
      });
  }, [decisionFilter, opportunities, recordMap, search, sourceFilter]);

  const stats = useMemo(() => {
    const saved = records.length;
    const bid = records.filter((record) => record.bidDecision === 'BID').length;
    const noBid = records.filter((record) => record.bidDecision === 'NO BID').length;
    const blank = records.filter((record) => record.bidDecision === 'BLANK').length;
    const averageScore = saved
      ? records.reduce((sum, record) => sum + Number(record.decisionScore || 0), 0) / saved
      : 0;
    return {
      total: opportunities.length,
      saved,
      bid,
      noBid,
      blank,
      averageScore,
    };
  }, [opportunities.length, records]);

  const editableCriteria = form.criteriaValues;
  const decisionScore = useMemo(() => calculateDecisionScore(editableCriteria), [editableCriteria]);
  const saveEligible = Boolean(selectedOpportunity && normalizeRef(form.opportunityRefNo));
  const exportReady = templateReachable;

  const loadOpportunity = (refNo: string, sourceMode: BidDecisionSourceMode) => {
    const nextRef = normalizeRef(refNo);
    if (!nextRef) {
      toast.error('Enter an opportunityRefNo first.');
      return;
    }

    const opportunity = opportunityMap.get(nextRef);
    if (!opportunity) {
      toast.error('Opportunity not found in dashboard data.');
      return;
    }

    setSelectedRef(opportunity.opportunityRefNo);
    setManualRefInput(opportunity.opportunityRefNo);
    setSelectionSourceMode(sourceMode);
    setForm(buildFormState(opportunity.opportunityRefNo, recordMap.get(nextRef) || undefined, sourceMode));
  };

  const handleRefresh = async () => {
    if (!token) return;
    setRefreshing(true);
    try {
      await refreshData({ force: true });
      const next = await fetchBidDecisionRecords(token);
      setRecords(next);
      toast.success('Bid Decision data refreshed.');
    } catch (error) {
      toast.error((error as Error).message || 'Failed to refresh Bid Decision data');
    } finally {
      setRefreshing(false);
    }
  };

  const handleAddCriterion = () => {
    setForm((current) => ({
      ...current,
      criteriaValues: [...current.criteriaValues, createCriteriaRow(current.criteriaValues.length)],
    }));
  };

  const handleSave = async () => {
    if (!token) {
      toast.error('Missing auth token.');
      return;
    }
    if (!selectedOpportunity) {
      toast.error('Select a valid opportunity before saving.');
      return;
    }

    const opportunityRefNo = selectedOpportunity.opportunityRefNo;
    const normalizedCriteria = editableCriteria.map((criterion, index) => ({
      ...normalizeBidDecisionCriterion(criterion),
      key: criterion.key || `criterion-${index + 1}`,
    }));
    const payload = {
      opportunityRefNo,
      bidDecision: normalizeBidDecisionState(form.bidDecision),
      decisionScore,
      criteriaValues: normalizedCriteria,
      sourceMode: form.sourceMode,
    };

    setSaving(true);
    try {
      const saved = await saveBidDecision(token, payload);
      setRecords((current) => {
        const next = current.filter((record) => normalizeRef(record.opportunityRefNo) !== normalizeRef(saved.opportunityRefNo));
        return [saved, ...next];
      });
      setSelectedRef(saved.opportunityRefNo);
      setForm(buildFormState(saved.opportunityRefNo, saved, saved.sourceMode));
      toast.success('Bid Decision saved.');
    } catch (error) {
      toast.error((error as Error).message || 'Failed to save Bid Decision');
    } finally {
      setSaving(false);
    }
  };

  const handleExport = async () => {
    toast.error(exportBlockedReason);
  };

  const selectedOpportunityValue = selectedOpportunity?.opportunityValue ?? null;
  const selectedDecisionRecord = selectedRef ? recordMap.get(normalizeRef(selectedRef)) || null : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="gap-1">
              <ShieldCheck className="h-3.5 w-3.5" />
              Bid Decision
            </Badge>
            <Badge variant={saveEligible ? 'default' : 'secondary'}>{saveEligible ? 'Save eligible' : 'Select opportunity'}</Badge>
            <Badge variant={exportReady ? 'default' : 'secondary'}>{exportReady ? 'Template reachable' : 'Template blocked'}</Badge>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Bid Decision</h1>
          <p className="text-sm text-muted-foreground">
            Search an opportunity, load its saved Bid Decision, and update the record without touching the core opportunity sync flow.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" onClick={handleRefresh} disabled={refreshing || !token}>
            <RefreshCcw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button type="button" variant="outline" onClick={handleExport} disabled={!selectedOpportunity}>
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving || !selectedOpportunity || !selectedRef}>
            <Save className="mr-2 h-4 w-4" />
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total opportunities</CardDescription>
            <CardTitle className="text-2xl">{stats.total}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Saved decisions</CardDescription>
            <CardTitle className="text-2xl">{stats.saved}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Decision split</CardDescription>
            <CardTitle className="text-2xl">{stats.bid} BID / {stats.noBid} NO BID</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Average score</CardDescription>
            <CardTitle className="text-2xl">{formatDecisionScore(stats.averageScore)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="text-lg">Opportunity Finder</CardTitle>
            <CardDescription>Search and select the source opportunity from dashboard data.</CardDescription>
            <div className="grid gap-3 pt-2 md:grid-cols-3">
              <div className="relative md:col-span-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search ref, tender, client..."
                  className="pl-9"
                />
              </div>
              <Select value={decisionFilter} onValueChange={(value) => setDecisionFilter(value as typeof decisionFilter)}>
                <SelectTrigger>
                  <SelectValue placeholder="Decision filter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All decisions</SelectItem>
                  {BID_DECISION_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>{option}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={sourceFilter} onValueChange={(value) => setSourceFilter(value as typeof sourceFilter)}>
                <SelectTrigger>
                  <SelectValue placeholder="Source filter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All source modes</SelectItem>
                  {BID_DECISION_SOURCE_MODES.map((option) => (
                    <SelectItem key={option} value={option}>{option}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ref</TableHead>
                    <TableHead>Tender</TableHead>
                    <TableHead>Decision</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Source</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length ? rows.map((opportunity) => {
                    const ref = normalizeRef(opportunity.opportunityRefNo);
                    const record = recordMap.get(ref) || null;
                    const decision = getOpportunityDecisionLabel(opportunity, record);
                    const sourceMode = getOpportunitySourceLabel(record);
                    const saved = Boolean(record);
                    return (
                      <TableRow
                        key={opportunity.opportunityRefNo}
                        className="cursor-pointer"
                        onClick={() => loadOpportunity(opportunity.opportunityRefNo, sourceMode)}
                      >
                        <TableCell className="font-mono text-xs">{opportunity.opportunityRefNo}</TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="font-medium">{opportunity.tenderName || '—'}</div>
                            <div className="text-xs text-muted-foreground">{opportunity.clientName || '—'}</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={getBadgeVariant(decision)}>{decision}</Badge>
                        </TableCell>
                        <TableCell>{saved ? formatDecisionScore(record?.decisionScore || 0) : '—'}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline">{sourceMode}</Badge>
                            {saved ? <Badge variant="secondary">Saved</Badge> : <Badge variant="secondary">Draft</Badge>}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  }) : (
                    <TableRow>
                      <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                        No opportunities match the current filters.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle className="text-lg">Source Lookup</CardTitle>
              <CardDescription>Manual entry mode still requires a valid opportunityRefNo from SyncedOpportunity.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <div>
                  <Label htmlFor="manual-ref">opportunityRefNo</Label>
                  <Input
                    id="manual-ref"
                    value={manualRefInput}
                    onChange={(event) => setManualRefInput(event.target.value)}
                    placeholder="Enter Avenir ref"
                  />
                </div>
                <div className="flex items-end">
                  <Button type="button" variant="outline" onClick={() => loadOpportunity(manualRefInput, 'manual')}>
                    <FileText className="mr-2 h-4 w-4" />
                    Load
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">Source mode: {form.sourceMode}</Badge>
                <Badge variant={selectedRecord ? 'default' : 'secondary'}>{selectedRecord ? 'Saved record loaded' : 'No saved record'}</Badge>
                <Badge variant={selectedSnapshotDecision === 'BLANK' ? 'secondary' : 'outline'}>Dashboard snapshot: {selectedSnapshotDecision}</Badge>
              </div>
            </CardContent>
          </Card>

          <Card className="min-w-0">
            <CardHeader>
              <CardTitle className="text-lg">Decision Editor</CardTitle>
              <CardDescription>
                {selectedOpportunity ? 'Update the decision and supporting criteria.' : 'Select a row or load a reference to begin.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {selectedOpportunity ? (
                <>
                  <div className="grid gap-3 rounded-xl border bg-muted/20 p-4 sm:grid-cols-2">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Tender</p>
                      <p className="font-medium">{selectedOpportunity.tenderName || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Ref</p>
                      <p className="font-mono text-sm">{selectedOpportunity.opportunityRefNo}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Client</p>
                      <p>{selectedOpportunity.clientName || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Internal lead</p>
                      <p>{selectedOpportunity.internalLead || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Tender value</p>
                      <p>{selectedOpportunityValue !== null && selectedOpportunityValue !== undefined ? formatCurrency(selectedOpportunityValue) : '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Saved updated</p>
                      <p>{selectedDecisionRecord?.updatedAt ? new Date(selectedDecisionRecord.updatedAt).toLocaleString() : '—'}</p>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-3">
                    <div>
                      <Label>Bid decision</Label>
                      <Select
                        value={form.bidDecision}
                        onValueChange={(value) => setForm((current) => ({ ...current, bidDecision: normalizeBidDecisionState(value) }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select decision" />
                        </SelectTrigger>
                        <SelectContent>
                          {BID_DECISION_OPTIONS.map((option) => (
                            <SelectItem key={option} value={option}>{option}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Decision score</Label>
                      <Input value={formatDecisionScore(decisionScore)} readOnly />
                    </div>
                    <div className="flex items-center justify-between rounded-lg border px-3 py-2">
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">Source mode</p>
                        <p className="text-sm capitalize">{form.sourceMode}</p>
                      </div>
                      <Badge variant={form.sourceMode === 'dashboard' ? 'default' : 'secondary'}>
                        {form.sourceMode}
                      </Badge>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">Criteria values</p>
                      <p className="text-xs text-muted-foreground">Store the criteria as part of the saved decision record.</p>
                    </div>
                    <Button type="button" variant="outline" onClick={handleAddCriterion}>
                      <Plus className="mr-2 h-4 w-4" />
                      Add criterion
                    </Button>
                  </div>

                  <div className="space-y-3">
                    {form.criteriaValues.map((criterion, index) => (
                      <CriterionRow
                        key={`${criterion.key || 'criterion'}-${index}`}
                        criterion={criterion}
                        index={index}
                        onChange={(next) => {
                          setForm((current) => ({
                            ...current,
                            criteriaValues: current.criteriaValues.map((item, itemIndex) => (itemIndex === index ? next : item)),
                          }));
                        }}
                        onRemove={() => {
                          setForm((current) => {
                            const next = current.criteriaValues.filter((_, itemIndex) => itemIndex !== index);
                            return {
                              ...current,
                              criteriaValues: next.length ? next : [createCriteriaRow(0)],
                            };
                          });
                        }}
                      />
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/20 p-4">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Save eligibility</p>
                      <p className="text-xs text-muted-foreground">
                        {selectedOpportunity ? 'This record maps to an existing opportunityRefNo in SyncedOpportunity.' : 'Select a valid opportunity first.'}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={saveEligible ? 'default' : 'secondary'}>{saveEligible ? 'Eligible' : 'Not eligible'}</Badge>
                      <Badge variant={exportReady ? 'default' : 'secondary'}>{exportReady ? 'Template reachable' : 'Export blocked'}</Badge>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" variant="outline" onClick={() => setForm(buildFormState(selectedOpportunity.opportunityRefNo, selectedRecord || undefined, form.sourceMode))}>
                      Reset
                    </Button>
                    <Button type="button" onClick={handleSave} disabled={saving || !selectedOpportunity}>
                      <Save className="mr-2 h-4 w-4" />
                      {saving ? 'Saving...' : 'Save decision'}
                    </Button>
                    <Button type="button" variant="outline" onClick={handleExport} disabled={!selectedOpportunity}>
                      <Download className="mr-2 h-4 w-4" />
                      Export workbook
                    </Button>
                  </div>

                  <div className="rounded-xl border p-4">
                    <div className="flex items-center gap-2">
                      <Badge variant={getBadgeVariant(form.bidDecision)}>{form.bidDecision}</Badge>
                      <Badge variant="outline">Score: {formatDecisionScore(decisionScore)}</Badge>
                    </div>
                    <p className="mt-3 text-sm text-muted-foreground">
                      {form.sourceMode === 'dashboard'
                        ? 'This decision was opened from dashboard data.'
                        : 'This decision was opened from a manual reference lookup.'}
                    </p>
                  </div>
                </>
              ) : (
                <div className="flex min-h-[260px] items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
                  Select an opportunity from the table or load a valid Avenir reference to begin.
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="min-w-0">
            <CardHeader>
              <CardTitle className="text-lg">Template Fidelity</CardTitle>
              <CardDescription>Excel export is guarded until the actual source template workbook is available in the workspace.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>{exportBlockedReason}</p>
              <p>
                The page already reuses the opportunity data flow and stores Bid Decision records separately, but the template workbook asset is still required before we can preserve merged cells, formulas, and print settings.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
