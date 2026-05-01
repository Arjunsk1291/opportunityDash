import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { OpportunitiesTable } from '@/components/Dashboard/OpportunitiesTable';
import { AdvancedFilters, FilterState, defaultFilters, applyFilters } from '@/components/Dashboard/AdvancedFilters';
import { ExportButton } from '@/components/Dashboard/ExportButton';
import { OpportunityDetailDialog } from '@/components/Dashboard/OpportunityDetailDialog';
import { SpreadsheetOpportunitiesTable } from '@/components/Opportunities/SpreadsheetOpportunitiesTable';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Opportunity } from '@/data/opportunityData';
import { useData } from '@/contexts/DataContext';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Check, ChevronDown, Calendar as CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface OpportunitiesProps {
  statusFilter?: string;
}

type EditMode = 'new' | 'update';
type FormState = {
  opportunityRefNo: string;
  tenderName: string;
  opportunityClassification: string;
  clientName: string;
  groupClassification: string;
  dateTenderReceived: string;
  tenderPlannedSubmissionDate: string;
  internalLead: string;
  opportunityValue: string;
  avenirStatus: string;
  adnocRftNo: string;
};

type PreviewDiff = {
  fieldKey: string;
  fieldLabel: string;
  previousValue: unknown;
  nextValue: unknown;
  hasExistingValue: boolean;
};

type ConflictGroup = {
  refKey: string;
  opportunityRefNo: string;
  tenderName: string;
  fields: Array<{ id: string; fieldKey: string; fieldLabel: string; sheetValue: unknown; existingValue: unknown }>;
};

const API_URL = import.meta.env.VITE_API_URL || '/api';
const REQUIRED_KEYS: Array<keyof FormState> = [
  'opportunityRefNo',
  'tenderName',
  'opportunityClassification',
  'clientName',
  'groupClassification',
  'dateTenderReceived',
  'tenderPlannedSubmissionDate',
  'internalLead',
  'opportunityValue',
  'avenirStatus',
];

const EMPTY_FORM: FormState = {
  opportunityRefNo: '',
  tenderName: '',
  opportunityClassification: '',
  clientName: '',
  groupClassification: '',
  dateTenderReceived: '',
  tenderPlannedSubmissionDate: '',
  internalLead: '',
  opportunityValue: '',
  avenirStatus: '',
  adnocRftNo: '',
};

const LABELS: Record<keyof FormState, string> = {
  opportunityRefNo: 'Avenir Ref',
  tenderName: 'Tender Name',
  opportunityClassification: 'Tender Type',
  clientName: 'Client',
  groupClassification: 'Group',
  dateTenderReceived: 'RFP Received',
  tenderPlannedSubmissionDate: 'Submission',
  internalLead: 'Lead',
  opportunityValue: 'Value',
  avenirStatus: 'Status',
  adnocRftNo: 'CLIENT Ref',
};

const toDisplay = (value: unknown) => {
  if (value === null || value === undefined) return '—';
  const text = String(value).trim();
  return text || '—';
};

const STATUS_OPTIONS = ['WORKING', 'SUBMITTED', 'AWARDED', 'LOST', 'REGRETTED', 'TO START', 'ONGOING', 'HOLD / CLOSED'];

const parseDateValue = (value: string) => {
  const text = String(value || '').trim();
  if (!text) return undefined;
  const parsed = new Date(`${text}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

const getDateButtonLabel = (value: string, fieldLabel: string) => {
  const parsed = parseDateValue(value);
  if (parsed) return format(parsed, 'PPP');
  const text = String(value || '').trim();
  return text || `Pick ${fieldLabel}`;
};

type SearchableSelectFieldProps = {
  label: string;
  placeholder: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
};

function SearchableSelectField({ label, placeholder, value, options, onChange }: SearchableSelectFieldProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const trimmedQuery = query.trim();
  const queryLower = trimmedQuery.toLowerCase();
  const filteredOptions = options.filter((option) => option.toLowerCase().includes(queryLower));
  const exactMatchExists = options.some((option) => option.toLowerCase() === queryLower);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className="w-full justify-between font-normal">
          <span className="truncate text-left">{value || placeholder}</span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[360px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={`Search ${label}...`}
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>No matches found.</CommandEmpty>
            {trimmedQuery && !exactMatchExists ? (
              <CommandItem
                value={`__custom__${trimmedQuery}`}
                onSelect={() => {
                  onChange(trimmedQuery);
                  setOpen(false);
                  setQuery('');
                }}
              >
                Use "{trimmedQuery}"
              </CommandItem>
            ) : null}
            {filteredOptions.map((option) => (
              <CommandItem
                key={option}
                value={option}
                onSelect={() => {
                  onChange(option);
                  setOpen(false);
                  setQuery('');
                }}
              >
                <Check className={cn('mr-2 h-4 w-4', value === option ? 'opacity-100' : 'opacity-0')} />
                {option}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

const Opportunities = ({ statusFilter }: OpportunitiesProps) => {
  const { opportunities, refreshData } = useData();
  const { formatCurrency } = useCurrency();
  const { token, canPerformAction } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [selectedOpp, setSelectedOpp] = useState<Opportunity | null>(null);
  const [filters, setFilters] = useState<FilterState>(() => ({
    ...defaultFilters,
    statuses: statusFilter ? [statusFilter] : [],
  }));
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<EditMode>('update');
  const [search, setSearch] = useState('');
  const [selectedRow, setSelectedRow] = useState<Opportunity | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [previewDiffs, setPreviewDiffs] = useState<PreviewDiff[]>([]);
  const [conflictsOpen, setConflictsOpen] = useState(false);
  const [conflicts, setConflicts] = useState<ConflictGroup[]>([]);
  const [conflictsLoading, setConflictsLoading] = useState(false);
  const [resolvingConflictId, setResolvingConflictId] = useState<string | null>(null);
  const [spreadsheetCrashed, setSpreadsheetCrashed] = useState(false);

  const logManualFlow = (flowId: string, stage: string, details: Record<string, unknown> = {}) => {
    console.log('[opportunities.manual-flow]', {
      flowId,
      stage,
      timestamp: new Date().toISOString(),
      ...details,
    });
  };

  const filteredData = useMemo(() => applyFilters(opportunities, filters), [opportunities, filters]);
  const canEdit = canPerformAction('manual_opportunity_updates_write');
  const formOptions = useMemo(() => {
    const dedupeSorted = (values: Array<string | null | undefined>) => (
      Array.from(
        new Set(
          values
            .map((value) => String(value || '').trim())
            .filter(Boolean),
        ),
      ).sort((a, b) => a.localeCompare(b))
    );

    return {
      opportunityClassification: dedupeSorted(opportunities.map((row) => row.opportunityClassification)),
      clientName: dedupeSorted(opportunities.map((row) => row.clientName)),
      groupClassification: dedupeSorted(opportunities.map((row) => row.groupClassification)),
      internalLead: dedupeSorted(opportunities.map((row) => row.internalLead)),
      avenirStatus: STATUS_OPTIONS,
    };
  }, [opportunities]);

  const searchableRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return opportunities.slice(0, 60);
    return opportunities.filter((o) => {
      const raw = o.rawGraphData?.rowSnapshot && typeof o.rawGraphData.rowSnapshot === 'object'
        ? Object.values(o.rawGraphData.rowSnapshot).map((v) => String(v ?? '')).join(' ').toLowerCase()
        : '';
      const blob = [
        o.opportunityRefNo, o.tenderName, o.clientName, o.groupClassification,
        o.opportunityClassification, o.internalLead, o.avenirStatus, raw,
      ].map((v) => String(v ?? '').toLowerCase()).join(' ');
      return blob.includes(q);
    }).slice(0, 60);
  }, [opportunities, search]);

  const setFormFromOpportunity = (opp: Opportunity | null) => {
    if (!opp) {
      setForm(EMPTY_FORM);
      return;
    }
    setForm({
      opportunityRefNo: String(opp.opportunityRefNo || ''),
      tenderName: String(opp.tenderName || ''),
      opportunityClassification: String(opp.opportunityClassification || ''),
      clientName: String(opp.clientName || ''),
      groupClassification: String(opp.groupClassification || ''),
      dateTenderReceived: String(opp.dateTenderReceived || ''),
      tenderPlannedSubmissionDate: String(opp.tenderPlannedSubmissionDate || ''),
      internalLead: String(opp.internalLead || ''),
      opportunityValue: opp.opportunityValue !== null && opp.opportunityValue !== undefined ? String(opp.opportunityValue) : '',
      avenirStatus: String(opp.avenirStatus || ''),
      adnocRftNo: String(opp.adnocRftNo || ''),
    });
  };

  const openEditor = (mode: EditMode) => {
    const flowId = `manual-${mode}-${Date.now()}`;
    logManualFlow(flowId, 'editor-opened', { mode });
    setEditorMode(mode);
    setEditorOpen(true);
    setSearch('');
    setSelectedRow(null);
    setPreviewDiffs([]);
    setConfirmOpen(false);
    setForm(EMPTY_FORM);
  };

  const loadConflicts = async () => {
    if (!token || !canEdit) return;
    setConflictsLoading(true);
    try {
      const response = await fetch(`${API_URL}/opportunities/value-conflicts`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Failed to load conflicts');
      const rows = Array.isArray(data?.conflicts) ? data.conflicts : [];
      setConflicts(rows);
      setConflictsOpen(rows.length > 0);
    } catch (error) {
      toast.error((error as Error).message || 'Failed to load conflicts');
    } finally {
      setConflictsLoading(false);
    }
  };

  useEffect(() => {
    loadConflicts();
  }, [token, canEdit]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const ref = params.get('editOpportunityValueRef') || '';
    if (!ref || !opportunities.length) return;
    const match = opportunities.find((row) => String(row.opportunityRefNo || '').trim() === ref.trim()) || null;
    if (!match) return;
    setEditorMode('update');
    setEditorOpen(true);
    setSelectedRow(match);
    setFormFromOpportunity(match);
    setSearch(ref);
    params.delete('editOpportunityValueRef');
    navigate({ pathname: location.pathname, search: params.toString() ? `?${params.toString()}` : '' }, { replace: true });
  }, [location.pathname, location.search, navigate, opportunities]);

  const saveEntry = async (confirmed: boolean, flowIdOverride?: string) => {
    if (!token || !canEdit) {
      toast.error('You do not have permission to save manual entries.');
      return;
    }
    const flowId = flowIdOverride || `manual-save-${Date.now()}`;
    setSaving(true);
    const saveStartedAt = performance.now();
    logManualFlow(flowId, 'save-start', {
      mode: editorMode,
      confirmed,
      ref: form.opportunityRefNo,
    });
    try {
      const requestStartedAt = performance.now();
      const response = await fetch(`${API_URL}/opportunities/manual-entry/save`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, mode: editorMode, confirmed }),
      });
      const requestMs = Math.round(performance.now() - requestStartedAt);
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Failed to save');
      logManualFlow(flowId, 'save-success', {
        requestMs,
        changedFields: Number(data?.changedFields || 0),
        overwriteCount: Number(data?.overwriteCount || 0),
        backendTiming: data?.timing || null,
      });
      toast.success(editorMode === 'new' ? 'New row added.' : 'Row updated.');
      setConfirmOpen(false);
      setEditorOpen(false);
      setPreviewDiffs([]);
      // Do not block the user on expensive re-fetches. Kick these off in background.
      void (async () => {
        const refreshStartedAt = performance.now();
        await refreshData({ background: true, force: true });
        const refreshMs = Math.round(performance.now() - refreshStartedAt);
        const conflictsStartedAt = performance.now();
        await loadConflicts();
        const conflictsMs = Math.round(performance.now() - conflictsStartedAt);
        logManualFlow(flowId, 'post-save-refresh-complete', { refreshMs, conflictsMs });
      })().catch((error) => {
        console.error('[opportunities.post-save.refresh.error]', error);
        logManualFlow(flowId, 'post-save-refresh-failed', { message: (error as Error)?.message || 'unknown_error' });
      });
    } catch (error) {
      console.error('[opportunities.manual-entry.save.error]', error);
      logManualFlow(flowId, 'save-failed', { message: (error as Error)?.message || 'unknown_error' });
      toast.error((error as Error).message || 'Failed to save');
    } finally {
      logManualFlow(flowId, 'save-finished', { totalMs: Math.round(performance.now() - saveStartedAt) });
      setSaving(false);
    }
  };

  const handlePreviewAndSave = async () => {
    if (!token || !canEdit) {
      toast.error('You do not have permission to preview or save manual entries.');
      return;
    }
    const missing = REQUIRED_KEYS.filter((key) => !String(form[key] ?? '').trim());
    if (missing.length) {
      toast.error(`Fill required fields: ${missing.map((key) => LABELS[key]).join(', ')}`);
      return;
    }

    const flowId = `manual-preview-${Date.now()}`;
    setPreviewing(true);
    const previewStartedAt = performance.now();
    logManualFlow(flowId, 'preview-start', {
      mode: editorMode,
      ref: form.opportunityRefNo,
      requiredMissingCount: 0,
    });
    try {
      const requestStartedAt = performance.now();
      const response = await fetch(`${API_URL}/opportunities/manual-entry/preview`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, mode: editorMode }),
      });
      const requestMs = Math.round(performance.now() - requestStartedAt);
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Failed to preview changes');
      const overwrites = Array.isArray(data?.overwrites) ? data.overwrites : [];
      logManualFlow(flowId, 'preview-success', {
        requestMs,
        requiresConfirmation: overwrites.length > 0,
        overwriteCount: overwrites.length,
        allChanges: Array.isArray(data?.allChanges) ? data.allChanges.length : 0,
        backendTiming: data?.timing || null,
      });
      if (overwrites.length > 0) {
        setPreviewDiffs(overwrites);
        setEditorOpen(false);
        setConfirmOpen(true);
        logManualFlow(flowId, 'confirmation-opened', { overwriteCount: overwrites.length });
        return;
      }
      await saveEntry(true, flowId);
    } catch (error) {
      console.error('[opportunities.manual-entry.preview.error]', error);
      logManualFlow(flowId, 'preview-failed', { message: (error as Error)?.message || 'unknown_error' });
      toast.error((error as Error).message || 'Failed to preview changes');
    } finally {
      logManualFlow(flowId, 'preview-finished', { totalMs: Math.round(performance.now() - previewStartedAt) });
      setPreviewing(false);
    }
  };

  const resolveFieldConflict = async (conflictId: string, action: 'use_sheet' | 'keep_existing') => {
    if (!token || !canEdit) {
      toast.error('You do not have permission to resolve conflicts.');
      return;
    }
    setResolvingConflictId(conflictId);
    try {
      const response = await fetch(`${API_URL}/opportunities/value-conflicts/resolve`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ decisions: [{ conflictId, action }] }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Failed to resolve conflict');
      toast.success(action === 'use_sheet' ? 'Sheet value applied.' : 'Existing value kept.');
      await refreshData({ background: true, force: true });
      await loadConflicts();
    } catch (error) {
      console.error('[opportunities.conflict.resolve.error]', error);
      toast.error((error as Error).message || 'Failed to resolve conflict');
    } finally {
      setResolvingConflictId(null);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-5.5rem)] gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{statusFilter ? `${statusFilter} Tenders` : 'All Tenders'}</h1>
          <p className="text-muted-foreground">{filteredData.length} tenders found</p>
        </div>
        <div className="flex items-center gap-2">
          {canEdit ? (
            <>
              <Button type="button" variant="outline" onClick={() => openEditor('new')}>New</Button>
              <Button type="button" onClick={() => openEditor('update')}>Update</Button>
              {conflicts.length > 0 ? (
                <Button type="button" variant="destructive" onClick={() => setConflictsOpen(true)} disabled={conflictsLoading}>
                  Resolve Sync Conflicts ({conflicts.length})
                </Button>
              ) : null}
            </>
          ) : null}
          <ExportButton data={filteredData} filename={statusFilter ? `${statusFilter.toLowerCase().replace(/\//g, '-')}-tenders` : 'all-tenders'} />
        </div>
      </div>

      <AdvancedFilters
        data={opportunities}
        filters={filters}
        onFiltersChange={setFilters}
        onClearFilters={() => setFilters({ ...defaultFilters, statuses: statusFilter ? [statusFilter] : [] })}
      />

      <div className="flex-1 min-h-0">
        {spreadsheetCrashed ? (
          <OpportunitiesTable data={filteredData} onSelectOpportunity={setSelectedOpp} />
        ) : (
          <ErrorBoundary
            onError={(error) => {
              console.error('[opportunities.spreadsheet.crash]', error);
              setSpreadsheetCrashed(true);
              toast.error('Spreadsheet view crashed. Falling back to standard table.');
            }}
            fallback={<OpportunitiesTable data={filteredData} onSelectOpportunity={setSelectedOpp} />}
          >
            <SpreadsheetOpportunitiesTable
              data={filteredData}
              onSelectOpportunity={setSelectedOpp}
            />
          </ErrorBoundary>
        )}
      </div>

      <OpportunityDetailDialog
        open={!!selectedOpp}
        opportunity={selectedOpp}
        onOpenChange={(open) => { if (!open) setSelectedOpp(null); }}
        formatCurrency={formatCurrency}
      />

      <Dialog
        open={editorOpen}
        onOpenChange={(open) => {
          if (!saving && !previewing) setEditorOpen(open);
        }}
      >
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>{editorMode === 'new' ? 'New Opportunity Row' : 'Update Opportunity Row'}</DialogTitle>
            <DialogDescription>
              {editorMode === 'new'
                ? 'Create a new opportunity row and save it to MongoDB with immediate dashboard refresh.'
                : 'Preview field-level changes before updating the existing opportunity row.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-[1fr_1.2fr]">
            <div className="space-y-3">
              {editorMode === 'update' ? (
                <>
                  <Input
                    placeholder="Universal search… (ref, tender, client, any raw sheet text)"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  <div className="max-h-[55vh] overflow-y-auto rounded-md border">
                    {searchableRows.map((row) => (
                      <button
                        key={row.id}
                        type="button"
                        className={`w-full px-3 py-2 text-left text-sm hover:bg-muted ${selectedRow?.id === row.id ? 'bg-muted' : ''}`}
                        onClick={() => {
                          setSelectedRow(row);
                          setFormFromOpportunity(row);
                        }}
                        disabled={saving || previewing}
                      >
                        <div className="font-semibold">{row.opportunityRefNo} — {row.tenderName || 'Untitled'}</div>
                        <div className="text-xs text-muted-foreground">{row.clientName || '—'} • {row.groupClassification || '—'}</div>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <div className="rounded-md border p-3 text-sm text-muted-foreground">
                  Fill all mandatory fields marked with <span className="font-semibold">*</span> to create a new row.
                </div>
              )}
            </div>
            <div className="space-y-3 rounded-md border p-3">
              <div className="grid gap-2 md:grid-cols-2">
                {(Object.keys(form) as Array<keyof FormState>).map((key) => {
                  const label = LABELS[key];
                  const value = form[key];
                  const isRequired = REQUIRED_KEYS.includes(key);
                  const isSearchableSelect = ['opportunityClassification', 'clientName', 'groupClassification', 'internalLead', 'avenirStatus'].includes(key);
                  const isCalendarDate = key === 'dateTenderReceived' || key === 'tenderPlannedSubmissionDate';

                  return (
                    <div key={key} className="space-y-1">
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {label} {isRequired ? <span className="text-destructive">*</span> : null}
                      </div>

                      {isSearchableSelect ? (
                        <SearchableSelectField
                          label={label}
                          placeholder={label}
                          value={value}
                          options={formOptions[key as 'opportunityClassification' | 'clientName' | 'groupClassification' | 'internalLead' | 'avenirStatus']}
                          onChange={(next) => setForm((prev) => ({ ...prev, [key]: next }))}
                        />
                      ) : null}

                      {isCalendarDate ? (
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button type="button" variant="outline" className="w-full justify-between font-normal">
                              <span className="truncate text-left">
                                {getDateButtonLabel(value, label)}
                              </span>
                              <CalendarIcon className="ml-2 h-4 w-4 shrink-0 opacity-60" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <CalendarComponent
                              mode="single"
                              selected={parseDateValue(value)}
                              onSelect={(selected) => {
                                setForm((prev) => ({
                                  ...prev,
                                  [key]: selected ? format(selected, 'yyyy-MM-dd') : '',
                                }));
                              }}
                              initialFocus
                            />
                            <div className="border-t p-2">
                              <Button
                                type="button"
                                variant="ghost"
                                className="w-full justify-center text-xs"
                                onClick={() => setForm((prev) => ({ ...prev, [key]: '' }))}
                              >
                                Clear date
                              </Button>
                            </div>
                          </PopoverContent>
                        </Popover>
                      ) : null}

                      {!isSearchableSelect && !isCalendarDate ? (
                        <Input
                          value={value}
                          onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
                          placeholder={label}
                          disabled={saving || previewing}
                        />
                      ) : null}
                    </div>
                  );
                })}
              </div>
              <Separator />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setEditorOpen(false)} disabled={saving || previewing}>Cancel</Button>
                <Button type="button" onClick={handlePreviewAndSave} disabled={saving || previewing}>
                  {previewing ? 'Previewing...' : saving ? 'Saving...' : (editorMode === 'new' ? 'Create Row' : 'Preview Update')}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Confirm Overwrite (Old vs New)</DialogTitle>
            <DialogDescription>
              Review changed fields before final save. Confirming will persist values and refresh dashboard data.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[55vh] overflow-y-auto rounded-md border">
            {previewDiffs.map((row) => (
              <div key={row.fieldKey} className="grid grid-cols-[170px_1fr_1fr] gap-2 border-b px-3 py-2 text-sm last:border-b-0">
                <div className="font-semibold">{row.fieldLabel}</div>
                <div className="rounded border px-2 py-1 text-muted-foreground">{toDisplay(row.previousValue)}</div>
                <div className="rounded border border-primary/40 bg-primary/5 px-2 py-1">{toDisplay(row.nextValue)}</div>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setConfirmOpen(false);
                setEditorOpen(true);
              }}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="button" onClick={() => saveEntry(true)} disabled={saving}>{saving ? 'Saving...' : 'Confirm Save'}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={conflictsOpen} onOpenChange={setConflictsOpen}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Sheet Sync Conflicts</DialogTitle>
            <DialogDescription>
              Resolve pending sync conflicts by choosing whether to keep current value or apply sheet value.
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">For each changed non-empty sheet field, choose to keep existing or use sheet.</p>
          <div className="max-h-[60vh] overflow-y-auto rounded-md border">
            {conflicts.map((group) => (
              <div key={group.refKey} className="border-b px-3 py-2 last:border-b-0">
                <div className="mb-2 flex items-center gap-2">
                  <div className="font-semibold">{group.opportunityRefNo} — {group.tenderName || 'Untitled'}</div>
                  <Badge variant="destructive">{group.fields.length} conflict{group.fields.length > 1 ? 's' : ''}</Badge>
                </div>
                <div className="space-y-2">
                  {group.fields.map((field) => (
                    <div key={field.id} className="grid grid-cols-[180px_1fr_1fr_auto] gap-2 text-sm">
                      <div className="font-medium">{field.fieldLabel}</div>
                      <div className="rounded border px-2 py-1 text-muted-foreground">Existing: {toDisplay(field.existingValue)}</div>
                      <div className="rounded border px-2 py-1">Sheet: {toDisplay(field.sheetValue)}</div>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => resolveFieldConflict(field.id, 'keep_existing')}
                          disabled={Boolean(resolvingConflictId)}
                        >
                          {resolvingConflictId === field.id ? 'Applying...' : 'Keep Existing'}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          onClick={() => resolveFieldConflict(field.id, 'use_sheet')}
                          disabled={Boolean(resolvingConflictId)}
                        >
                          Use Sheet
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {conflicts.length === 0 ? <div className="px-3 py-4 text-sm text-muted-foreground">No pending conflicts.</div> : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Opportunities;
