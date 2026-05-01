import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Minus, Pencil, Plus, RotateCcw, Save, Trash2, X } from 'lucide-react';
import { Opportunity } from '@/data/opportunityData';
import { getDisplayStatus, getStatusBadgeClass, normalizeCanonicalStatus } from '@/lib/opportunityStatus';
import { DataGrid, GridToolbar, useGridApiRef, type GridColDef } from '@mui/x-data-grid';
import styles from './ExcelOpportunitiesTable.module.css';

type Column = {
  header: string;
  widthPx?: number;
};

type EditableOpportunityRow = Opportunity & {
  __rowIndex: number;
  __tempId?: string;
  __gridId?: string;
};

const normalizeHeader = (value: string) => String(value || '').trim().toUpperCase().replace(/\s+/g, ' ');

const ALL_COLUMN_HEADERS: Column[] = [
  { header: 'Sr.no', widthPx: 72 },
  { header: 'Year', widthPx: 80 },
  { header: 'Tender no', widthPx: 140 },
  { header: 'Tender name', widthPx: 320 },
  { header: 'Client', widthPx: 220 },
  { header: 'END USER', widthPx: 220 },
  { header: 'ADNOC RFT NO', widthPx: 160 },
  { header: 'Tender Location (Execution)', widthPx: 220 },
  { header: 'GDS/GES', widthPx: 110 },
  { header: 'Assigned Person', widthPx: 200 },
  { header: 'Stage of project, Concept, FEED, DE', widthPx: 240 },
  { header: 'Tender Type', widthPx: 140 },
  { header: 'date tender recd', widthPx: 140 },
  { header: 'Tender Due  date', widthPx: 140 },
  { header: 'Tender  Submitted  date', widthPx: 160 },
  { header: 'AVENIR STATUS', widthPx: 140 },
  { header: 'REMARKS/REASON', widthPx: 340 },
  { header: 'TENDER RESULT', widthPx: 140 },
  { header: 'TENDER STATUS -', widthPx: 240 },
  { header: 'Currency, USD/AED', widthPx: 150 },
  { header: 'GM%', widthPx: 90 },
  { header: 'Tender value', widthPx: 160 },
  { header: 'Sub-contract value', widthPx: 180 },
  { header: 'GM Value', widthPx: 140 },
  { header: 'Go%', widthPx: 90 },
  { header: 'Get %', widthPx: 90 },
  { header: 'GO/Get %', widthPx: 100 },
  { header: 'go/get value', widthPx: 140 },
  { header: 'USD to AED', widthPx: 120 },
  { header: 'who was awarded the project', widthPx: 260 },
  { header: 'final awarded price', widthPx: 180 },
] as const;

function getSnapshotValue(opp: Opportunity, headerLabel: string): string {
  const snapshot = opp.rawGraphData?.rowSnapshot;
  if (!snapshot || typeof snapshot !== 'object') return '';
  const target = normalizeHeader(headerLabel);
  for (const [key, rawValue] of Object.entries(snapshot)) {
    if (normalizeHeader(key) !== target) continue;
    return rawValue === null || rawValue === undefined ? '' : String(rawValue).trim();
  }
  return '';
}

function getSmartValue(opp: Opportunity, headerLabel: string): string {
  const header = normalizeHeader(headerLabel);
  switch (header) {
    case 'YEAR':
      return String(opp.rawSheetYear || opp.rawGraphData?.year || '').trim();
    case 'TENDER NO':
    case 'REF NO':
      return String(opp.tenderNo || opp.opportunityRefNo || '').trim();
    case 'TENDER NAME':
      return String(opp.tenderName || '').trim();
    case 'CLIENT':
      return String(opp.clientName || '').trim();
    case 'GDS/GES':
      return String(opp.groupClassification || '').trim();
    case 'ASSIGNED PERSON':
    case 'LEAD':
      return String(opp.internalLead || '').trim();
    case 'TENDER TYPE':
      return String(opp.opportunityClassification || '').trim();
    case 'DATE TENDER RECD':
      return String(opp.dateTenderReceived || opp.rawGraphData?.rfpReceivedDisplay || '').trim();
    case 'TENDER DUE DATE':
      return String(opp.tenderPlannedSubmissionDate || opp.rawGraphData?.plannedSubmissionDisplay || '').trim();
    case 'TENDER SUBMITTED DATE':
      return String(opp.tenderSubmittedDate || opp.rawGraphData?.tenderSubmittedDisplay || '').trim();
    case 'AVENIR STATUS':
      return String(opp.avenirStatus || opp.rawAvenirStatus || '').trim();
    case 'REMARKS/REASON':
      return String(opp.remarksReason || '').trim();
    case 'TENDER RESULT':
      return String(opp.tenderResult || opp.rawTenderResult || '').trim();
    case 'TENDER STATUS -':
      return String(opp.tenderStatusRemark || '').trim();
    default:
      return '';
  }
}

function getDisplayValue(opp: Opportunity, headerLabel: string): string {
  const primary = getSmartValue(opp, headerLabel);
  if (primary) return primary;
  return getSnapshotValue(opp, headerLabel);
}

const EDITABLE_HEADERS = new Set([
  'TENDER NO',
  'TENDER NAME',
  'CLIENT',
  'GDS/GES',
  'ASSIGNED PERSON',
  'TENDER TYPE',
  'DATE TENDER RECD',
  'TENDER DUE DATE',
  'AVENIR STATUS',
  'TENDER VALUE',
  'ADNOC RFT NO',
]);

const REQUIRED_EDIT_FIELDS: Array<keyof Opportunity> = [
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

const API_URL = import.meta.env.VITE_API_URL || '/api';

const normalizeText = (value: unknown) => String(value ?? '').trim();

const coerceOpportunityValue = (raw: unknown) => {
  if (raw === null || raw === undefined || raw === '') return NaN;
  const normalized = String(raw).replace(/,/g, '').replace(/[^0-9.-]/g, '').trim();
  if (!normalized) return NaN;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : NaN;
};

const isRowValidForSave = (row: Partial<Opportunity>) => {
  for (const key of REQUIRED_EDIT_FIELDS) {
    if (key === 'opportunityValue') {
      const parsed = coerceOpportunityValue((row as Opportunity).opportunityValue);
      if (!Number.isFinite(parsed)) return false;
      continue;
    }
    if (!normalizeText((row as Opportunity)[key])) return false;
  }
  return true;
};

const buildManualEntryPayloadFromRow = (row: Partial<Opportunity>) => ({
  opportunityRefNo: normalizeText(row.opportunityRefNo),
  tenderName: normalizeText(row.tenderName),
  opportunityClassification: normalizeText(row.opportunityClassification),
  clientName: normalizeText(row.clientName),
  groupClassification: normalizeText(row.groupClassification),
  dateTenderReceived: normalizeText(row.dateTenderReceived),
  tenderPlannedSubmissionDate: normalizeText(row.tenderPlannedSubmissionDate),
  internalLead: normalizeText(row.internalLead),
  opportunityValue: String((row as Opportunity).opportunityValue ?? ''),
  avenirStatus: normalizeText(row.avenirStatus),
  adnocRftNo: normalizeText(row.adnocRftNo),
});

export function ExcelOpportunitiesTable({
  data,
  onSelectOpportunity,
  editable,
  authToken,
  canEdit,
  onSaved,
}: {
  data: Opportunity[];
  onSelectOpportunity?: (opp: Opportunity) => void;
  editable?: boolean;
  authToken?: string | null;
  canEdit?: boolean;
  onSaved?: () => void | Promise<void>;
}) {
  const dataRef = useRef<Opportunity[]>(data);
  const [zoomPct, setZoomPct] = useState(100);
  const zoomScale = Math.max(50, Math.min(160, zoomPct)) / 100;
  const [pageSize, setPageSize] = useState<number | 'all'>('all');
  const [page, setPage] = useState(0);
  const allowEdit = Boolean(editable && canEdit && authToken);
  const apiRef = useGridApiRef();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [jumpToRow, setJumpToRow] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [selection, setSelection] = useState<Array<string>>([]);
  const [saving, setSaving] = useState(false);
  const saveTimer = useRef<number | null>(null);
  const dirtyRowIds = useRef<Set<string>>(new Set());
  const [editRows, setEditRows] = useState<EditableOpportunityRow[]>([]);
  const latestRowsRef = useRef<EditableOpportunityRow[]>([]);
  const isEditingRef = useRef(false);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    if (!isEditing) return;
    // Keep local copy aligned if data changes while editing (e.g., background refresh).
    // Conservative approach: do not clobber unsaved edits; only append rows we don't have yet.
    setEditRows((current) => {
      const knownIds = new Set(current.map((row) => String(row.id || row.__tempId || '')));
      const append = data
        .map((opp, idx) => ({ ...opp, __rowIndex: idx } as EditableOpportunityRow))
        .filter((row) => {
          const id = String(row.id || row.__tempId || '');
          return id && !knownIds.has(id);
        });
      return append.length ? [...current, ...append] : current;
    });
  }, [data, isEditing]);

  useEffect(() => {
    isEditingRef.current = isEditing;
  }, [isEditing]);

  useEffect(() => {
    latestRowsRef.current = editRows;
  }, [editRows]);

  const scheduleAutoSave = () => {
    if (!allowEdit || !isEditingRef.current) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void saveDirtyRows({ source: 'autosave' });
    }, 1200);
  };

  const saveDirtyRows = async ({ source }: { source: 'autosave' | 'manual' }) => {
    if (!allowEdit || !isEditingRef.current) return;
    if (saving) return;
    const dirty = Array.from(dirtyRowIds.current);
    if (!dirty.length) return;

    const rowsById = new Map(latestRowsRef.current.map((row) => [String(row.id || row.__tempId || ''), row]));
    const toSave = dirty
      .map((id) => rowsById.get(id))
      .filter(Boolean) as EditableOpportunityRow[];

    const invalid = toSave.filter((row) => !isRowValidForSave(row));
    if (invalid.length) {
      // Only block manual saves; autosave should be silent for partial rows.
      if (source === 'manual') {
        window.alert('Some edited rows are missing required fields. Fill all required fields (including numeric Value) before saving.');
      }
      return;
    }

    setSaving(true);
    try {
      for (const row of toSave) {
        const payload = buildManualEntryPayloadFromRow(row);
        const mode = row.__tempId ? 'new' : 'update';
        const response = await fetch(`${API_URL}/opportunities/manual-entry/save`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, mode, confirmed: true }),
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.error || 'Failed to save row');
        }
        dirtyRowIds.current.delete(String(row.id || row.__tempId || ''));
      }
      await onSaved?.();
      setEditRows(dataRef.current.map((opp, idx) => ({ ...opp, __rowIndex: idx } as EditableOpportunityRow)));
    } catch (error) {
      console.error('[excel-table.save.error]', error);
      if (source === 'manual') window.alert((error as Error)?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const deleteSelectedRows = async () => {
    if (!allowEdit || !isEditing) return;
    if (!selection.length) return;
    const confirmed = window.confirm(`Delete ${selection.length} row(s)? This removes them from MongoDB.`);
    if (!confirmed) return;

    const rowsByGridId = new Map(rows.map((row) => [String(row.__gridId || ''), row]));
    const selectedRows = selection.map((id) => rowsByGridId.get(id)).filter(Boolean) as EditableOpportunityRow[];

    setSaving(true);
    try {
      for (const row of selectedRows) {
        const rowId = String(row.id || row.__tempId || '');
        if (row.__tempId) {
          dirtyRowIds.current.delete(rowId);
          continue;
        }
        const response = await fetch(`${API_URL}/opportunities/manual-entry/delete`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ opportunityRefNo: row.opportunityRefNo, confirmed: true }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error || 'Failed to delete row');
        dirtyRowIds.current.delete(rowId);
      }

      setEditRows((current) => current.filter((row) => {
        const gridId = rows.find((candidate) => candidate.id === row.id && candidate.__rowIndex === row.__rowIndex)?.__gridId;
        return gridId ? !selection.includes(String(gridId)) : true;
      }));
      setSelection([]);
      await onSaved?.();
      setEditRows(dataRef.current.map((opp, idx) => ({ ...opp, __rowIndex: idx } as EditableOpportunityRow)));
    } catch (error) {
      console.error('[excel-table.delete.error]', error);
      window.alert((error as Error)?.message || 'Delete failed');
    } finally {
      setSaving(false);
    }
  };

  const addNewRow = () => {
    if (!allowEdit || !isEditing) return;
    const tempId = `temp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const empty: EditableOpportunityRow = {
      __tempId: tempId,
      __rowIndex: editRows.length,
      id: tempId,
      opportunityRefNo: '',
      adnocRftNo: '',
      tenderNo: '',
      tenderName: '',
      clientName: '',
      clientType: '',
      clientLead: '',
      opportunityClassification: '',
      opportunityStatus: '',
      canonicalStage: '',
      qualificationStatus: '',
      groupClassification: '',
      domainSubGroup: '',
      internalLead: '',
      opportunityValue: 0,
      opportunityValue_imputed: false,
      opportunityValue_imputation_reason: '',
      probability: 0,
      probability_imputed: false,
      probability_imputation_reason: '',
      expectedValue: 0,
      dateTenderReceived: '',
      tenderPlannedSubmissionDate: '',
      tenderPlannedSubmissionDate_imputed: false,
      tenderPlannedSubmissionDate_imputation_reason: '',
      tenderSubmittedDate: '',
      lastContactDate: '',
      lastContactDate_imputed: false,
      lastContactDate_imputation_reason: '',
      daysSinceTenderReceived: 0,
      daysToPlannedSubmission: 0,
      agedDays: 0,
      willMissDeadline: false,
      isAtRisk: false,
      partnerInvolvement: false,
      partnerName: '',
      country: '',
      awardStatus: '',
      avenirStatus: '',
      rawGraphData: { rowSnapshot: {} },
    };
    setEditRows((current) => [empty, ...current.map((row, idx) => ({ ...row, __rowIndex: idx + 1 }))]);
    dirtyRowIds.current.add(tempId);
    setSelection([tempId]);
  };

  const columns: GridColDef<EditableOpportunityRow>[] = useMemo(() => {
    const baseFontSizePx = Math.round(12 * zoomScale);
    const monoFontSizePx = Math.max(10, Math.round(11 * zoomScale));

    const renderValue = (opp: Opportunity, header: string) => {
      const normalized = normalizeHeader(header);
      const value = getDisplayValue(opp, header);

      if (normalized === normalizeHeader('AVENIR STATUS')) {
        const status = value || '';
        return status ? (
          <Badge className={`max-w-[10rem] truncate ${getStatusBadgeClass(status, opp)}`}>{status}</Badge>
        ) : (
          <span className={styles.muted}>—</span>
        );
      }

      if (normalized === normalizeHeader('GDS/GES')) {
        const group = value || '';
        if (!group) return <span className={styles.muted}>—</span>;
        return <span style={{ fontFamily: 'JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', fontSize: monoFontSizePx }}>{group}</span>;
      }

      if (normalized === normalizeHeader('Tender no') || normalized === normalizeHeader('ADNOC RFT NO')) {
        return value ? (
          <span style={{ fontFamily: 'JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', fontSize: monoFontSizePx }}>{value}</span>
        ) : (
          <span className={styles.muted}>—</span>
        );
      }

      return value || <span className={styles.muted}>—</span>;
    };

    const headerCols: GridColDef<Opportunity & { __rowIndex: number }>[] = ALL_COLUMN_HEADERS.map((col) => ({
      field: `col:${normalizeHeader(col.header)}`,
      headerName: col.header,
      width: Math.round((col.widthPx || 180) * zoomScale),
      sortable: true,
      filterable: true,
      editable: Boolean(allowEdit && isEditing && EDITABLE_HEADERS.has(normalizeHeader(col.header))),
      renderCell: (params) => renderValue(params.row, col.header),
      valueGetter: (_value, row) => getDisplayValue(row, col.header),
      valueSetter: (value, row) => {
        const header = normalizeHeader(col.header);
        const next = { ...row } as EditableOpportunityRow;
        const text = normalizeText(value);

        switch (header) {
          case 'TENDER NO':
          case 'REF NO':
            next.opportunityRefNo = text;
            next.tenderNo = text;
            return next;
          case 'TENDER NAME':
            next.tenderName = text;
            return next;
          case 'CLIENT':
            next.clientName = text;
            return next;
          case 'GDS/GES':
            next.groupClassification = text;
            return next;
          case 'ASSIGNED PERSON':
          case 'LEAD':
            next.internalLead = text;
            return next;
          case 'TENDER TYPE':
            next.opportunityClassification = text;
            return next;
          case 'DATE TENDER RECD':
            next.dateTenderReceived = text;
            return next;
          case 'TENDER DUE DATE':
            next.tenderPlannedSubmissionDate = text;
            return next;
          case 'AVENIR STATUS':
            next.avenirStatus = text;
            return next;
          case 'TENDER VALUE': {
            const parsed = coerceOpportunityValue(text);
            next.opportunityValue = Number.isFinite(parsed) ? parsed : next.opportunityValue;
            return next;
          }
          case 'ADNOC RFT NO':
            next.adnocRftNo = text;
            return next;
          default:
            return row;
        }
      },
    }));

    return [
      {
        field: '__rowIndex',
        headerName: '#',
        width: Math.round(72 * zoomScale),
        sortable: false,
        filterable: false,
        disableColumnMenu: true,
        renderCell: (params) => (
          <span style={{ fontFamily: 'JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', fontSize: baseFontSizePx }}>
            {params.row.__rowIndex + 1}
          </span>
        ),
      },
      ...headerCols,
    ];
  }, [allowEdit, isEditing, zoomScale]);

  const rows = useMemo(() => {
    const baseRows = (allowEdit && isEditing)
      ? editRows
      : data.map((opp, idx) => ({ ...opp, __rowIndex: idx } as EditableOpportunityRow));

    // DataGrid requires globally-unique row ids. If upstream data has duplicates (e.g., same refNo reused),
    // scrolling/virtualization can break and appear "stuck" around ~100 rows.
    const seen = new Map<string, number>();
    return baseRows.map((row) => {
      const baseId = String(row.id || row.__tempId || '');
      const count = (seen.get(baseId) || 0) + 1;
      seen.set(baseId, count);
      const suffix = count === 1 ? '' : `#${count}`;
      return { ...row, __gridId: `${baseId}${suffix}` } as EditableOpportunityRow;
    });
  }, [allowEdit, data, editRows, isEditing]);
  const rowHeight = Math.max(28, Math.round(34 * zoomScale));
  const headerHeight = Math.max(34, Math.round(40 * zoomScale));
  const showAllRows = pageSize === 'all';
  const enableSelection = Boolean(allowEdit && isEditing);

  useEffect(() => {
    if (!enableSelection && selection.length) setSelection([]);
  }, [enableSelection, selection.length]);

  useEffect(() => {
    if (!enableSelection || selection.length === 0) return;
    const validIds = new Set(rows.map((row) => String(row.__gridId || row.id || row.__tempId || '')));
    const filtered = selection.filter((id) => validIds.has(id));
    if (filtered.length !== selection.length) setSelection(filtered);
  }, [enableSelection, rows, selection]);

  useEffect(() => {
    const gridRowsCount = apiRef.current?.getRowsCount?.() ?? null;
    const baseIds = rows.map((r) => String(r.id || r.__tempId || ''));
    const uniqueBaseIds = new Set(baseIds);
    const duplicateBaseIdCount = baseIds.length - uniqueBaseIds.size;
    console.log('[excel.table.diag]', {
      rowsProp: data.length,
      rowsRenderedProp: rows.length,
      gridRowsCount,
      uniqueBaseIds: uniqueBaseIds.size,
      duplicateBaseIdCount,
      pageSize,
      showAllRows,
      isEditing,
      allowEdit,
    });
  }, [allowEdit, apiRef, data.length, isEditing, pageSize, rows.length, showAllRows]);

  useEffect(() => {
    // Log visible range on scroll (best-effort) for diagnostics.
    // Even with "Rows = All", we keep internal grid scrolling (virtualized) to avoid expanding the page to 900+ rows.
    const el = containerRef.current?.querySelector?.('.MuiDataGrid-virtualScroller') as HTMLElement | null;
    if (!el) return;
    let lastLoggedAt = 0;
    const handler = () => {
      const now = Date.now();
      if (now - lastLoggedAt < 500) return;
      lastLoggedAt = now;
      logVisibleRange('gridScroll');
    };
    el.addEventListener('scroll', handler, { passive: true });
    window.setTimeout(() => logVisibleRange('mounted'), 0);
    window.setTimeout(() => logVisibleRange('mounted+100ms'), 100);
    return () => el.removeEventListener('scroll', handler);
  }, [rows.length, rowHeight]);

  const logVisibleCount = (reason: string) => {
    const gridRowsCount = apiRef.current?.getRowsCount?.() ?? null;
    console.log('[excel.table.rows]', {
      reason,
      rowsProp: data.length,
      rowsRenderedProp: rows.length,
      gridRowsCount,
      pageSize,
      showAllRows,
    });
  };

  const logVisibleRange = (reason: string) => {
    const gridRowsCount = apiRef.current?.getRowsCount?.() ?? rows.length;
    const scroll = apiRef.current?.getScrollPosition?.() || { top: 0, left: 0 };

    // Best-effort: infer visible row range from scrollTop + viewport height.
    const virtualScroller = containerRef.current?.querySelector?.('.MuiDataGrid-virtualScroller') as HTMLElement | null;
    const viewportHeight = virtualScroller?.clientHeight ?? containerRef.current?.clientHeight ?? 0;
    const rowH = rowHeight || 1;
    const first = Math.max(0, Math.floor((scroll.top || 0) / rowH));
    const visibleCount = viewportHeight ? Math.max(1, Math.ceil(viewportHeight / rowH)) : null;
    const last = visibleCount === null ? null : Math.min(gridRowsCount - 1, first + visibleCount - 1);
    const scrollHeight = virtualScroller?.scrollHeight ?? null;
    const clientHeight = virtualScroller?.clientHeight ?? null;
    const maxScrollTop = scrollHeight !== null && clientHeight !== null ? Math.max(0, scrollHeight - clientHeight) : null;

    console.log('[excel.table.visibleRange]', {
      reason,
      scrollTop: scroll.top || 0,
      viewportHeight,
      rowHeight: rowH,
      approxFirstRowIndex1Based: first + 1,
      approxLastRowIndex1Based: last === null ? null : last + 1,
      gridRowsCount,
      scrollHeight,
      clientHeight,
      maxScrollTop,
    });
  };

  useEffect(() => {
    if (!allowEdit) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (!isEditingRef.current) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key.toLowerCase() !== 's') return;
      e.preventDefault();
      void saveDirtyRows({ source: 'manual' });
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [allowEdit]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className={styles.toolbar}>
        <div className="flex items-center gap-2">
          <div className="text-sm font-semibold">Excel view</div>
          <Separator orientation="vertical" className="h-5" />
          <div className={styles.zoomLabel}>Zoom {Math.round(zoomScale * 100)}%</div>
          <Separator orientation="vertical" className="h-5" />
          <div className={styles.zoomLabel}>{data.length} rows</div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Go to</span>
            <input
              className="h-9 w-[92px] rounded-md border border-input bg-background px-2 text-sm"
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="Row #"
              value={jumpToRow}
              onChange={(e) => setJumpToRow(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                const target = Math.max(1, Number.parseInt(jumpToRow, 10) || 1);
                apiRef.current?.scrollToIndexes?.({ rowIndex: target - 1, colIndex: 0 });
                window.setTimeout(() => logVisibleRange('jumpToRow:enter'), 50);
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                const target = Math.max(1, Number.parseInt(jumpToRow, 10) || 1);
                apiRef.current?.scrollToIndexes?.({ rowIndex: target - 1, colIndex: 0 });
                window.setTimeout(() => logVisibleRange('jumpToRow:click'), 50);
              }}
            >
              Jump
            </Button>
          </div>
          {allowEdit ? (
            <>
              {isEditing ? (
                <>
                  <Button type="button" variant="default" size="sm" onClick={() => void saveDirtyRows({ source: 'manual' })} disabled={saving}>
                    <Save className="mr-2 h-4 w-4" /> Save {saving ? '...' : ''}
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={addNewRow} disabled={saving}>
                    <Plus className="mr-2 h-4 w-4" /> Add row
                  </Button>
                  <Button type="button" variant="destructive" size="sm" onClick={() => void deleteSelectedRows()} disabled={saving || selection.length === 0}>
                    <Trash2 className="mr-2 h-4 w-4" /> Delete
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const discard = dirtyRowIds.current.size > 0
                        ? window.confirm('Discard unsaved edits?')
                        : true;
                      if (!discard) return;
                      dirtyRowIds.current.clear();
                      setSelection([]);
                      setEditRows([]);
                      setIsEditing(false);
                    }}
                    disabled={saving}
                  >
                    <X className="mr-2 h-4 w-4" /> Cancel
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    dirtyRowIds.current.clear();
                    setSelection([]);
                    setEditRows(data.map((opp, idx) => ({ ...opp, __rowIndex: idx } as EditableOpportunityRow)));
                    setIsEditing(true);
                  }}
                >
                  <Pencil className="mr-2 h-4 w-4" /> Edit
                </Button>
              )}
              <Separator orientation="vertical" className="h-5" />
            </>
          ) : null}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Rows</span>
            <select
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={pageSize === 'all' ? 'all' : String(pageSize)}
              onChange={(e) => {
                const raw = e.target.value;
                const next = raw === 'all' ? 'all' : Number(raw);
                setPage(0);
                setPageSize(next);
              }}
            >
              <option value="all">All</option>
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </select>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => setZoomPct((v) => Math.max(50, v - 10))}>
            <Minus className="mr-2 h-4 w-4" /> Zoom out
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setZoomPct((v) => Math.min(160, v + 10))}>
            <Plus className="mr-2 h-4 w-4" /> Zoom in
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setZoomPct(100)}>
            <RotateCcw className="mr-2 h-4 w-4" /> Reset
          </Button>
        </div>
      </div>

      <div ref={containerRef} className={`${styles.viewport} flex-1 min-h-0`}>
        <DataGrid
          apiRef={apiRef}
          rows={rows}
          columns={columns}
          getRowId={(row) => String((row as EditableOpportunityRow).__gridId || (row as EditableOpportunityRow).id || (row as EditableOpportunityRow).__tempId || '')}
          density="compact"
          rowHeight={rowHeight}
          columnHeaderHeight={headerHeight}
          disableRowSelectionOnClick
          checkboxSelection={enableSelection}
          rowSelectionModel={enableSelection ? selection : undefined}
          onRowSelectionModelChange={enableSelection ? ((model) => setSelection(model.map(String))) : undefined}
          keepNonExistentRowsSelected={enableSelection}
          onRowClick={(params) => {
            if (allowEdit && isEditing) return;
            onSelectOpportunity?.(params.row);
          }}
          processRowUpdate={(newRow) => {
            const rowId = String((newRow as EditableOpportunityRow).id || (newRow as EditableOpportunityRow).__tempId || '');
            dirtyRowIds.current.add(rowId);
            scheduleAutoSave();
            return newRow;
          }}
          pagination={pageSize !== 'all'}
          {...(pageSize === 'all'
            ? {}
            : {
                paginationModel: { page, pageSize },
                onPaginationModelChange: (model: { page: number; pageSize: number }) => {
                  setPage(model.page);
                  setPageSize(model.pageSize);
                },
              })}
          onSortModelChange={() => {
            window.setTimeout(() => logVisibleCount('sortModelChange'), 0);
            window.setTimeout(() => logVisibleRange('sortModelChange'), 0);
          }}
          onFilterModelChange={() => {
            window.setTimeout(() => logVisibleCount('filterModelChange'), 0);
            window.setTimeout(() => logVisibleRange('filterModelChange'), 0);
          }}
          pageSizeOptions={[25, 50, 100]}
          slots={{ toolbar: GridToolbar }}
          slotProps={{
            toolbar: {
              showQuickFilter: true,
              quickFilterProps: { debounceMs: 300 },
              printOptions: { disableToolbarButton: true },
            },
          }}
          hideFooter={pageSize === 'all'}
          getRowClassName={(params) => {
            const status = normalizeCanonicalStatus(getDisplayStatus(params.row));
            if (!status) return '';
            return `opp-row status-${status.replace(/\s+/g, '-').replace(/\//g, '-').toLowerCase()}`;
          }}
          sx={{
            height: '100%',
            border: 0,
            backgroundColor: 'transparent',
            '& .MuiDataGrid-toolbarContainer': {
              padding: '8px 10px',
              borderBottom: '1px solid hsl(var(--border))',
              backgroundColor: 'hsl(var(--background))',
            },
            '& .MuiDataGrid-toolbarContainer .MuiButtonBase-root': {
              color: 'hsl(var(--foreground))',
            },
            '& .MuiDataGrid-toolbarContainer .MuiInputBase-root': {
              color: 'hsl(var(--foreground))',
              borderRadius: 10,
              backgroundColor: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              paddingInline: 8,
            },
            '& .MuiDataGrid-columnHeaders': {
              backgroundColor: 'hsl(var(--card))',
              color: 'hsl(var(--foreground))',
              borderBottom: '1px solid hsl(var(--border))',
              fontWeight: 700,
            },
            '& .MuiDataGrid-columnSeparator': {
              color: 'hsl(var(--border))',
            },
            '& .MuiDataGrid-cell': {
              borderBottom: '1px solid hsl(var(--border))',
              color: 'hsl(var(--foreground))',
              outline: 'none',
            },
            '& .MuiDataGrid-row:hover': {
              backgroundColor: 'hsl(var(--muted) / 0.5)',
              cursor: 'pointer',
            },
            '& .MuiDataGrid-row.Mui-selected': {
              backgroundColor: 'hsl(var(--primary) / 0.06)',
            },
            '& .MuiDataGrid-row.Mui-selected:hover': {
              backgroundColor: 'hsl(var(--primary) / 0.1)',
            },
            '& .MuiDataGrid-virtualScroller': {
              backgroundColor: 'transparent',
            },
            '& .MuiDataGrid-footerContainer': {
              borderTop: '1px solid hsl(var(--border))',
              backgroundColor: 'hsl(var(--background))',
              color: 'hsl(var(--foreground))',
            },
            '& .MuiTablePagination-root': {
              color: 'hsl(var(--foreground))',
            },

            '& .opp-row.status-working': { backgroundColor: 'hsl(var(--warning) / 0.24)' },
            '& .opp-row.status-submitted': { backgroundColor: 'hsl(var(--pending) / 0.24)' },
            '& .opp-row.status-awarded': { backgroundColor: 'hsl(var(--success) / 0.24)' },
            '& .opp-row.status-lost': { backgroundColor: 'hsl(var(--destructive) / 0.24)' },
            '& .opp-row.status-regretted': { backgroundColor: 'hsl(var(--muted) / 0.88)' },
            '& .opp-row.status-to-start': { backgroundColor: 'hsl(var(--info) / 0.22)' },
            '& .opp-row.status-ongoing': { backgroundColor: 'hsl(var(--info) / 0.22)' },
            '& .opp-row.status-hold---closed': { backgroundColor: 'hsl(var(--muted) / 0.88)' },
            '& .opp-row:hover': { backgroundColor: 'hsl(var(--muted) / 0.65) !important' },
          }}
        />
      </div>
    </div>
  );
}
