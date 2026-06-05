import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { OpportunitiesTable } from '@/components/Dashboard/OpportunitiesTable';
import { AdvancedFilters, FilterState, defaultFilters, applyFilters } from '@/components/Dashboard/AdvancedFilters';
import { SpreadsheetOpportunitiesTable } from '@/components/Opportunities/SpreadsheetOpportunitiesTable';
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
import { getFirstWorksheet, loadWorkbookFromArrayBuffer } from '@/lib/excelWorkbook';
import { useAsyncAction } from '@/hooks/useAsyncAction';

interface OpportunitiesProps {
  statusFilter?: string;
}

type EditMode = 'new' | 'update';
type OpportunityViewMode = 'dashboard_table' | 'spreadsheet';
type FormState = {
  opportunityRefNo: string;
  tenderName: string;
  opportunityClassification: string;
  clientName: string;
  groupClassification: string;
  dateTenderReceived: string;
  tenderPlannedSubmissionDate: string;
  tenderSubmittedDate: string;
  tenderResult: string;
  tenderStatusRemark: string;
  internalLead: string;
  opportunityValue: string;
  avenirStatus: string;
  adnocRftNo: string;
  remarksReason: string;
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
];

// Full tender workbook headers (used for snapshot inputs). Keep literal labels to preserve workbook conventions.
const SHEET_HEADERS: string[] = [
  'Sr.no',
  'Year',
  'Tender no',
  'Tender name',
  'Client',
  'END USER',
  'ADNOC RFT NO',
  'Tender Location (Execution)',
  'GDS/GES',
  'Assigned Person',
  'Stage of project, Concept, FEED, DE',
  'Tender Type',
  'date tender recd',
  'Tender Due  date',
  'Tender  Submitted  date',
  'AVENIR STATUS',
  'REMARKS/REASON',
  'TENDER RESULT',
  'TENDER STATUS -',
  'Currency, USD/AED',
  'GM%',
  'Tender value',
  'Sub-contract value',
  'GM Value',
  'Go%',
  'Get %',
  'GO/Get %',
  'go/get value',
  'USD to AED',
  'who was awarded the project',
  'final awarded price',
];

const EMPTY_FORM: FormState = {
  opportunityRefNo: '',
  tenderName: '',
  opportunityClassification: '',
  clientName: '',
  groupClassification: '',
  dateTenderReceived: '',
  tenderPlannedSubmissionDate: '',
  tenderSubmittedDate: '',
  tenderResult: '',
  tenderStatusRemark: '',
  internalLead: '',
  opportunityValue: '',
  avenirStatus: '',
  adnocRftNo: '',
  remarksReason: '',
};

const LABELS: Record<keyof FormState, string> = {
  opportunityRefNo: 'Avenir Ref',
  tenderName: 'Tender Name',
  opportunityClassification: 'Tender Type',
  clientName: 'Client',
  groupClassification: 'Group',
  dateTenderReceived: 'RFP Received',
  tenderPlannedSubmissionDate: 'Submission',
  tenderSubmittedDate: 'Tender Submitted',
  tenderResult: 'Tender Result',
  tenderStatusRemark: 'Tender Status',
  internalLead: 'Lead',
  opportunityValue: 'Value',
  avenirStatus: 'Status',
  adnocRftNo: 'CLIENT Ref',
  remarksReason: 'Remarks / Reason',
};

const NORMALIZE_HEADER = (value: string) => String(value || '').trim().toUpperCase().replace(/\s+/g, ' ');
const FORM_BACKED_HEADERS = new Set([
  'TENDER NO', // opportunityRefNo
  'REF NO',
  'TENDER NAME',
  'CLIENT',
  'GDS/GES',
  'ASSIGNED PERSON',
  'TENDER TYPE',
  'DATE TENDER RECD',
  'TENDER DUE  DATE',
  'TENDER DUE DATE',
  'TENDER VALUE',
  'AVENIR STATUS',
  'TENDER RESULT',
  'TENDER STATUS -',
  'TENDER STATUS',
  'ADNOC RFT NO',
].map(NORMALIZE_HEADER));

const SNAPSHOT_HEADERS = SHEET_HEADERS.filter((h) => !FORM_BACKED_HEADERS.has(NORMALIZE_HEADER(h)));

const toDisplay = (value: unknown) => {
  if (value === null || value === undefined) return '—';
  const text = String(value).trim();
  return text || '—';
};

const STATUS_OPTIONS = ['WORKING', 'SUBMITTED', 'AWARDED', 'LOST', 'REGRETTED', 'TO START', 'ONGOING', 'HOLD / CLOSED'];

const MAX_OPPORTUNITY_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_OPPORTUNITY_UPLOAD_ROWS = 5000;

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
  const { opportunities, refreshData, upsertOpportunities } = useData();
  const { formatCurrency } = useCurrency();
  const { token, canPerformAction } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [filters, setFilters] = useState<FilterState>(() => ({
    ...defaultFilters,
    statuses: statusFilter ? [statusFilter] : [],
  }));
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<EditMode>('update');
  const [search, setSearch] = useState('');
  const [selectedRow, setSelectedRow] = useState<Opportunity | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [snapshotEdits, setSnapshotEdits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [previewDiffs, setPreviewDiffs] = useState<PreviewDiff[]>([]);
  const [conflictsOpen, setConflictsOpen] = useState(false);
  const [conflicts, setConflicts] = useState<ConflictGroup[]>([]);
  const [conflictsLoading, setConflictsLoading] = useState(false);
  const [resolvingConflictId, setResolvingConflictId] = useState<string | null>(null);
  const [spreadsheetCrashed, setSpreadsheetCrashed] = useState(false);
  const [viewMode, setViewMode] = useState<OpportunityViewMode>('dashboard_table');
  const [sheetUploadOpen, setSheetUploadOpen] = useState(false);
  const [sheetUploadLoading, setSheetUploadLoading] = useState(false);
  const [sheetUploadSaving, setSheetUploadSaving] = useState(false);
  const [sheetUploadRows, setSheetUploadRows] = useState<FormState[]>([]);
  const [sheetUploadMeta, setSheetUploadMeta] = useState<{ created: number; updated: number } | null>(null);
  const [sheetUploadProgressLabel, setSheetUploadProgressLabel] = useState<string | null>(null);
  const SHEET_UPLOAD_COMMIT_BATCH_SIZE = 100;

  const { execute: executeCommit, isLoading: isCommitting, progress: commitProgress } = useAsyncAction({
    action: async () => {
      if (!sheetUploadRows.length) throw new Error('No parsed rows to save.');
      const batches: FormState[][] = [];
      for (let index = 0; index < sheetUploadRows.length; index += SHEET_UPLOAD_COMMIT_BATCH_SIZE) {
        batches.push(sheetUploadRows.slice(index, index + SHEET_UPLOAD_COMMIT_BATCH_SIZE));
      }

      const touchedByRef = new Map<string, Opportunity>();

      for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
        const batch = batches[batchIndex];
        setSheetUploadProgressLabel(`Writing batch ${batchIndex + 1} of ${batches.length}…`);
        const response = await fetch(`${API_URL}/opportunities/sheet-upload/commit`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ rows: batch }),
        });

        const rawText = await response.text();
        const data = rawText ? (() => {
          try {
            return JSON.parse(rawText);
          } catch {
            return { error: rawText };
          }
        })() : {};

        if (!response.ok) {
          const statusText = response.statusText ? ` ${response.statusText}` : '';
          throw new Error(data?.error || `Failed to save rows.${statusText} (HTTP ${response.status})`);
        }

        const touched = Array.isArray(data?.rows) ? data.rows : [];
        touched.forEach((row: Opportunity) => {
          const ref = String(row.opportunityRefNo || row.tenderNo || '').trim().toLowerCase();
          if (ref) touchedByRef.set(ref, row);
        });
      }

      const touched = Array.from(touchedByRef.values());
      if (touched.length) upsertOpportunities(touched);
      setSheetUploadRows([]);
      setSheetUploadOpen(false);
      setSheetUploadMeta(null);
      void refreshData({ background: true }).catch(() => {});
      return { success: true, rows: touched };
    },
    successMessage: (data) => `Saved. Created ${data?.created ?? 0}, updated ${data?.updated ?? 0}.`,
  });

  const { execute: executeUpload, isLoading: isUploading, progress: uploadProgress } = useAsyncAction({
    action: async (file: File) => {
      setSheetUploadProgressLabel('Reading workbook…');
      const buffer = await file.arrayBuffer();
      const workbook = await loadWorkbookFromArrayBuffer(buffer);
      const worksheet = getFirstWorksheet(workbook);
      if (!worksheet) throw new Error('No worksheet found in uploaded file.');

      const maxColumns = 50;
      const maxScanRows = Math.min(15, worksheet.rowCount);
      const maxRows = Math.min(worksheet.rowCount, MAX_OPPORTUNITY_UPLOAD_ROWS);

      setSheetUploadProgressLabel('Detecting headers…');
      const normalizeHeader = (value: unknown) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
      const headerCandidates: Record<keyof FormState, string[]> = {
        opportunityRefNo: ['tender no', 'ref no', 'ref no.', 'opportunity ref', 'avenir ref', 'avenir ref no'],
        tenderName: ['tender name', 'tender'],
        opportunityClassification: ['tender type', 'type'],
        clientName: ['client', 'client name'],
        groupClassification: ['gds/ges', 'group', 'vertical', 'group classification'],
        dateTenderReceived: ['date tender recd', 'date tender received', 'rfp received', 'date received'],
        tenderPlannedSubmissionDate: ['tender due date', 'tender due  date', 'submission', 'planned submission', 'submission date'],
        tenderSubmittedDate: ['tender submitted', 'tender submitted date', 'submitted date'],
        tenderResult: ['tender result', 'result', 'outcome', 'final result', 'tender outcome'],
        tenderStatusRemark: ['tender status -', 'tender status-', 'tender status'],
        internalLead: ['assigned person', 'lead', 'internal lead'],
        opportunityValue: ['tender value', 'value', 'opportunity value'],
        avenirStatus: ['avenir status', 'status'],
        adnocRftNo: ['adnoc rft no', 'client ref', 'client ref.', 'adnoc rft'],
        remarksReason: ['remarks/reason', 'remarks / reason', 'remarks and reason', 'reason'],
      };

      const scoreHeaderRow = (rowIndex: number) => {
        const row = worksheet.getRow(rowIndex);
        const normalized: string[] = [];
        for (let col = 1; col <= maxColumns; col += 1) {
          normalized.push(normalizeHeader(row.getCell(col).value));
        }
        let score = 0;
        (Object.keys(headerCandidates) as Array<keyof FormState>).forEach((key) => {
          if (normalized.some((cell) => headerCandidates[key].includes(cell))) score += 1;
        });
        return score;
      };

      let headerRowIndex = 1;
      let bestScore = -1;
      for (let rowIndex = 1; rowIndex <= maxScanRows; rowIndex += 1) {
        const score = scoreHeaderRow(rowIndex);
        if (score > bestScore) {
          bestScore = score;
          headerRowIndex = rowIndex;
        }
      }

      const headerRow = worksheet.getRow(headerRowIndex);
      const normalizedHeader: string[] = [];
      for (let col = 1; col <= maxColumns; col += 1) {
        normalizedHeader.push(normalizeHeader(headerRow.getCell(col).value));
      }
      const columnIndex: Partial<Record<keyof FormState, number>> = {};
      (Object.keys(headerCandidates) as Array<keyof FormState>).forEach((key) => {
        const idx = normalizedHeader.findIndex((cell) => headerCandidates[key].includes(cell));
        if (idx >= 0) columnIndex[key] = idx + 1;
      });

      if (columnIndex.opportunityRefNo === undefined) throw new Error('Could not find a "Tender no / Ref no" column.');

      const getCellText = (excelRow: { getCell: (idx: number) => { value: unknown } }, key: keyof FormState) => {
        const idx = columnIndex[key];
        if (idx === undefined) return '';
        const raw = excelRow.getCell(idx).value ?? '';
        if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw.toISOString().slice(0, 10);
        return String(raw ?? '').trim();
      };

      setSheetUploadProgressLabel('Mapping rows…');
      const parsed: FormState[] = [];
      for (let rowIndex = headerRowIndex + 1; rowIndex <= maxRows; rowIndex += 1) {
        const excelRow = worksheet.getRow(rowIndex);
        const opportunityRefNo = getCellText(excelRow, 'opportunityRefNo');
        const tenderName = getCellText(excelRow, 'tenderName');
        const clientName = getCellText(excelRow, 'clientName');
        if (!opportunityRefNo && !tenderName && !clientName) continue;

        parsed.push({
          opportunityRefNo,
          tenderName,
          opportunityClassification: getCellText(excelRow, 'opportunityClassification'),
          clientName,
          groupClassification: getCellText(excelRow, 'groupClassification'),
          dateTenderReceived: getCellText(excelRow, 'dateTenderReceived'),
          tenderPlannedSubmissionDate: getCellText(excelRow, 'tenderPlannedSubmissionDate'),
          tenderSubmittedDate: getCellText(excelRow, 'tenderSubmittedDate'),
          tenderResult: getCellText(excelRow, 'tenderResult'),
          tenderStatusRemark: getCellText(excelRow, 'tenderStatusRemark'),
          internalLead: getCellText(excelRow, 'internalLead'),
          opportunityValue: getCellText(excelRow, 'opportunityValue'),
          avenirStatus: getCellText(excelRow, 'avenirStatus'),
          adnocRftNo: getCellText(excelRow, 'adnocRftNo'),
          remarksReason: getCellText(excelRow, 'remarksReason'),
        });
      }

      setSheetUploadProgressLabel('Diffing with database…');
      const normalizeRef = (value: string) => String(value || '').trim().toLowerCase();
      const existingByRef = new Map(opportunities.map((opp) => [normalizeRef(String(opp.opportunityRefNo || opp.tenderNo || '')), opp]));
      const normalizeValue = (value: unknown) => String(value ?? '').trim();
      const isSame = (a: unknown, b: unknown) => normalizeValue(a) === normalizeValue(b);
      const isUpdated = (row: FormState, existing: Opportunity) => {
        if (!existing) return false;
        return !(
          isSame(existing.opportunityRefNo, row.opportunityRefNo) &&
          isSame(existing.tenderName, row.tenderName) &&
          isSame(existing.clientName, row.clientName) &&
          isSame(existing.groupClassification, row.groupClassification) &&
          isSame(existing.internalLead, row.internalLead) &&
          isSame(existing.opportunityClassification, row.opportunityClassification) &&
          isSame(existing.dateTenderReceived, row.dateTenderReceived) &&
          isSame(existing.tenderPlannedSubmissionDate, row.tenderPlannedSubmissionDate) &&
          isSame(existing.tenderSubmittedDate, row.tenderSubmittedDate) &&
          isSame(existing.tenderResult, row.tenderResult) &&
          isSame(existing.tenderStatusRemark, row.tenderStatusRemark) &&
          isSame(existing.avenirStatus, row.avenirStatus) &&
          isSame(existing.adnocRftNo, row.adnocRftNo) &&
          isSame(existing.remarksReason, row.remarksReason) &&
          isSame(String(existing.opportunityValue ?? ''), row.opportunityValue)
        );
      };

      const created: FormState[] = [];
      const updated: FormState[] = [];
      const unchanged: FormState[] = [];
      parsed.forEach((row) => {
        const existing = existingByRef.get(normalizeRef(row.opportunityRefNo));
        if (!existing) return created.push(row);
        if (isUpdated(row, existing)) return updated.push(row);
        return unchanged.push(row);
      });

      setSheetUploadRows([...created, ...updated, ...unchanged]);
      setSheetUploadMeta({ created: created.length, updated: updated.length });
      setSheetUploadOpen(true);
      setSheetUploadProgressLabel(null);
    }
  });

  const logManualFlow = (flowId: string, stage: string, details: Record<string, unknown> = {}) => {
    // Hidden diagnostics
  };

  const filteredData = useMemo(() => applyFilters(opportunities, filters), [opportunities, filters]);
  const canEdit = canPerformAction('manual_opportunity_updates_write');
  const editFromRow = (row: Opportunity) => {
    if (!canEdit) {
      toast.error('You do not have permission to edit rows.');
      return;
    }
    setEditorMode('update');
    setEditorOpen(true);
    setSelectedRow(row);
    setFormFromOpportunity(row);
    setSearch(String(row.opportunityRefNo || '').trim());
  };
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
      setSnapshotEdits({});
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
      tenderSubmittedDate: String(opp.tenderSubmittedDate || ''),
      tenderResult: String(opp.tenderResult || ''),
      tenderStatusRemark: String(opp.tenderStatusRemark || ''),
      internalLead: String(opp.internalLead || ''),
      opportunityValue: opp.opportunityValue !== null && opp.opportunityValue !== undefined ? String(opp.opportunityValue) : '',
      avenirStatus: String(opp.avenirStatus || ''),
      adnocRftNo: String(opp.adnocRftNo || ''),
      remarksReason: String(opp.remarksReason || ''),
    });

    const nextSnapshots: Record<string, string> = {};
    const snap = opp.rawGraphData?.rowSnapshot;
    if (snap && typeof snap === 'object') {
      Object.entries(snap as Record<string, unknown>).forEach(([k, v]) => {
        nextSnapshots[String(k)] = v === null || v === undefined ? '' : String(v);
      });
    }
    setSnapshotEdits(nextSnapshots);
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
    setSnapshotEdits({});
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

      const refForSnapshots = String(form.opportunityRefNo || '').trim();
      const snapshotEntries = Object.entries(snapshotEdits || {})
        .map(([header, value]) => ({ header: String(header || '').trim(), value: value === null || value === undefined ? '' : String(value) }))
        .filter((row) => row.header && row.value.trim() !== '');
      if (refForSnapshots && snapshotEntries.length) {
        const snapshotStartedAt = performance.now();
        logManualFlow(flowId, 'save-snapshots-start', { count: snapshotEntries.length });
        for (const entry of snapshotEntries) {
          const snapRes = await fetch(`${API_URL}/opportunities/manual-entry/save`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              mode: 'update',
              confirmed: true,
              opportunityRefNo: refForSnapshots,
              patch: { snapshot: { header: entry.header, value: entry.value } },
            }),
          });
          const snapData = await snapRes.json().catch(() => ({}));
          if (!snapRes.ok) throw new Error(snapData?.error || `Failed to save snapshot: ${entry.header}`);
        }
        logManualFlow(flowId, 'save-snapshots-success', { count: snapshotEntries.length, totalMs: Math.round(performance.now() - snapshotStartedAt) });
      }

      logManualFlow(flowId, 'save-success', {
        requestMs,
        changedFields: Number(data?.changedFields || 0),
        overwriteCount: Number(data?.overwriteCount || 0),
        backendTiming: data?.timing || null,
      });
      toast.success(editorMode === "new" ? "New row added." : "Row updated.");
      setConfirmOpen(false);
      setEditorOpen(false);
      setPreviewDiffs([]);

      // Optimistically update the UI if possible
      if (data?.row || (data?.rows && data.rows[0])) {
         const updatedRow = data.row || data.rows[0];
         upsertOpportunities([updatedRow]);
      }

      // Refresh data in background to ensure everything is in sync
      void (async () => {
        const refreshStartedAt = performance.now();
        await refreshData({ background: true });
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
      await refreshData({ background: true });
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
          {canPerformAction?.('opportunities_sheet_upload') ? (
            <>
              <input
                type="file"
                accept=".xlsx"
                className="hidden"
                id="opportunities-sheet-upload"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void executeUpload(file);
                  e.currentTarget.value = '';
                }}
                disabled={isUploading || isCommitting}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => document.getElementById('opportunities-sheet-upload')?.click()}
                loading={isUploading}
                disabled={isCommitting}
              >
                Upload Sheet
              </Button>
              {isUploading && (
                <div className="hidden sm:flex items-center gap-3 pl-3 text-xs text-muted-foreground border-l border-border ml-1">
                  <div className="h-1.5 w-32 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-primary transition-[width] duration-200"
                      style={{ width: `${Math.max(2, Math.min(100, uploadProgress))}%` }}
                    />
                  </div>
                  <span className="font-bold text-foreground truncate max-w-[100px]">{sheetUploadProgressLabel}</span>
                </div>
              )}
            </>
          ) : null}
          <Button
            type="button"
            variant={viewMode === 'dashboard_table' ? 'default' : 'outline'}
            onClick={() => setViewMode('dashboard_table')}
          >
            Table
          </Button>
          <Button
            type="button"
            variant={viewMode === 'spreadsheet' ? 'default' : 'outline'}
            onClick={() => setViewMode('spreadsheet')}
          >
            Spreadsheet
          </Button>
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
        </div>
      </div>

      <AdvancedFilters
        data={opportunities}
        filters={filters}
        onFiltersChange={setFilters}
        onClearFilters={() => setFilters({ ...defaultFilters, statuses: statusFilter ? [statusFilter] : [] })}
      />

      <div className="flex-1 min-h-0">
        {viewMode === 'dashboard_table' || spreadsheetCrashed ? (
          <OpportunitiesTable
            data={filteredData}
            onSelectOpportunity={setSelectedRow}
            onRowDoubleClick={(row) => editFromRow(row)}
            columnPreset="sheet"
            responsiveMode="default"
            maxHeight="max-h-[calc(100vh-18rem)]"
          />
        ) : (
          <SpreadsheetOpportunitiesTable
            data={filteredData}
            onSelectOpportunity={setSelectedRow}
            onRowDoubleClick={(row) => editFromRow(row)}
            token={token}
            canEdit={canEdit}
            onUpsertRow={(row) => upsertOpportunities([row])}
          />
        )}
      </div>

      <Dialog
        open={sheetUploadOpen}
        onOpenChange={(open) => {
          if (!isCommitting) setSheetUploadOpen(open);
        }}
      >
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Sheet Upload Preview</DialogTitle>
            <DialogDescription>
              Parsed {sheetUploadRows.length} row(s).
              {sheetUploadMeta ? ` New: ${sheetUploadMeta.created}, Updated: ${sheetUploadMeta.updated}.` : ''}
              {' '}New/updated rows are shown first. Save writes to MongoDB.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[55vh] overflow-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background">
                <tr className="border-b">
                  <th className="px-3 py-2 text-left">Ref</th>
                  <th className="px-3 py-2 text-left">Tender</th>
                  <th className="px-3 py-2 text-left">Client</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Value</th>
                </tr>
              </thead>
              <tbody>
                {sheetUploadRows.slice(0, 200).map((row) => (
                  <tr key={`${row.opportunityRefNo}-${row.tenderName}`} className="border-b last:border-b-0">
                    <td className="px-3 py-2 font-medium">{row.opportunityRefNo || '—'}</td>
                    <td className="px-3 py-2">{row.tenderName || '—'}</td>
                    <td className="px-3 py-2">{row.clientName || '—'}</td>
                    <td className="px-3 py-2">{row.avenirStatus || '—'}</td>
                    <td className="px-3 py-2">{row.opportunityValue || '—'}</td>
                  </tr>
                ))}
                {sheetUploadRows.length > 200 ? (
                  <tr>
                    <td className="px-3 py-2 text-muted-foreground" colSpan={5}>
                      Showing first 200 rows (parsed {sheetUploadRows.length}).
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setSheetUploadOpen(false)} disabled={isCommitting}>
              Cancel
            </Button>
            {isCommitting && (
              <div className="mr-4 flex items-center gap-3 text-xs text-muted-foreground">
                <div className="h-1.5 w-40 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-[width] duration-200"
                    style={{ width: `${Math.max(2, Math.min(100, commitProgress))}%` }}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-foreground">Writing to DB…</span>
                  <span className="tabular-nums opacity-70">{Math.round(commitProgress)}%</span>
                </div>
              </div>
            )}
            <Button type="button" onClick={() => executeCommit()} loading={isCommitting} disabled={!sheetUploadRows.length}>
              Save {sheetUploadRows.length} Row{sheetUploadRows.length === 1 ? '' : 's'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Additional Sheet Columns (saved into raw snapshot)
                </div>
                <div className="grid gap-2 md:grid-cols-2 max-h-[30vh] overflow-y-auto pr-1">
                  {SNAPSHOT_HEADERS.map((header) => (
                    <div key={header} className="space-y-1">
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{header}</div>
                      <Input
                        value={snapshotEdits[header] ?? ''}
                        onChange={(e) => setSnapshotEdits((prev) => ({ ...prev, [header]: e.target.value }))}
                        placeholder={header}
                        disabled={saving || previewing}
                      />
                    </div>
                  ))}
                </div>
              </div>
              <Separator />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setEditorOpen(false)} disabled={saving || previewing}>Cancel</Button>
                <Button
                  type="button"
                  onClick={handlePreviewAndSave}
                  loading={saving || previewing}
                >
                  {editorMode === 'new' ? 'Create' : 'Preview'}
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
            <Button type="button" onClick={() => saveEntry(true)} loading={saving}>Confirm Save</Button>
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
                          loading={resolvingConflictId === field.id}
                          disabled={Boolean(resolvingConflictId && resolvingConflictId !== field.id)}
                        >
                          Keep Existing
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          onClick={() => resolveFieldConflict(field.id, 'use_sheet')}
                          loading={resolvingConflictId === field.id}
                          disabled={Boolean(resolvingConflictId && resolvingConflictId !== field.id)}
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
