import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DataGrid, type GridColDef, type GridRowModel, type GridRowId } from '@mui/x-data-grid';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Minus, Plus, RotateCcw, Search, Trash2, X } from 'lucide-react';
import { Opportunity } from '@/data/opportunityData';
import { getDisplayStatus, normalizeCanonicalStatus } from '@/lib/opportunityStatus';
import { toast } from 'sonner';
import { OPPORTUNITY_COLUMN_HEADERS } from '@/lib/opportunities/columns';
import styles from './SpreadsheetOpportunitiesTable.module.css';

type Column = {
  header: string;
  widthPx?: number;
};

type RowKind = 'existing' | 'draft';

type SheetRow = {
  __kind: RowKind;
  __gridId: string;
  __sourceId?: string;
  rawSheetYear: string;
  opportunityRefNo: string;
  tenderName: string;
  clientName: string;
  groupClassification: string;
  internalLead: string;
  opportunityClassification: string;
  dateTenderReceived: string;
  tenderPlannedSubmissionDate: string;
  avenirStatus: string;
  adnocRftNo: string;
  opportunityValue: string;
  rawSnapshot: Record<string, string>;
};

type PendingCellKey = `${string}:${string}`;
type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

type ConfirmationState = null | {
  rowId: string;
  fieldLabel: string;
  requestBody: Record<string, unknown>;
  previousRow: SheetRow;
  nextRow: SheetRow;
};

const API_URL = import.meta.env.VITE_API_URL || '/api';
const TAIL_DRAFT_BATCH_SIZE = 50;
const INITIAL_TAIL_DRAFT_ROWS = 100;
const TAIL_DRAFT_ID_PREFIX = 'tail-draft-';

const normalizeHeader = (value: string) => String(value || '').trim().toUpperCase().replace(/\s+/g, ' ');

const ALL_COLUMN_HEADERS: Column[] = OPPORTUNITY_COLUMN_HEADERS.map((header) => ({
  header,
  widthPx:
    header === 'Sr.no' ? 72 :
    header === 'Year' ? 80 :
    header === 'Tender no' ? 140 :
    header === 'Tender name' ? 320 :
    header === 'Client' ? 220 :
    header === 'END USER' ? 220 :
    header === 'ADNOC RFT NO' ? 160 :
    header === 'Tender Location (Execution)' ? 220 :
    header === 'GDS/GES' ? 110 :
    header === 'Assigned Person' ? 200 :
    header === 'Stage of project, Concept, FEED, DE' ? 240 :
    header === 'Tender Type' ? 140 :
    header === 'date tender recd' ? 140 :
    header === 'Tender Due  date' ? 140 :
    header === 'Tender  Submitted  date' ? 160 :
    header === 'AVENIR STATUS' ? 140 :
    header === 'REMARKS/REASON' ? 340 :
    header === 'TENDER RESULT' ? 140 :
    header === 'TENDER STATUS' ? 240 :
    header === 'Currency, USD/AED' ? 150 :
    header === 'GM%' ? 90 :
    header === 'Tender value' ? 160 :
    header === 'Sub-contract value' ? 180 :
    header === 'GM Value' ? 140 :
    header === 'Go%' ? 90 :
    header === 'Get %' ? 90 :
    header === 'GO/Get %' ? 100 :
    header === 'go/get value' ? 140 :
    header === 'USD to AED' ? 120 :
    header === 'who was awarded the project' ? 260 :
    header === 'final awarded price' ? 180 :
    120,
})) as const;

// Sensitive mapping: keep as-is (do not change semantics).
const EDITABLE_HEADER_TO_FIELD: Record<string, keyof Opportunity> = {
  [normalizeHeader('Year')]: 'rawSheetYear',
  [normalizeHeader('Tender name')]: 'tenderName',
  [normalizeHeader('Client')]: 'clientName',
  [normalizeHeader('GDS/GES')]: 'groupClassification',
  [normalizeHeader('Assigned Person')]: 'internalLead',
  [normalizeHeader('Tender Type')]: 'opportunityClassification',
  [normalizeHeader('date tender recd')]: 'dateTenderReceived',
  [normalizeHeader('Tender Due  date')]: 'tenderPlannedSubmissionDate',
  [normalizeHeader('AVENIR STATUS')]: 'avenirStatus',
  [normalizeHeader('ADNOC RFT NO')]: 'adnocRftNo',
  [normalizeHeader('Tender value')]: 'opportunityValue',
};

const EMPTY_ROW: Omit<SheetRow, '__kind' | '__gridId'> = {
  __sourceId: undefined,
  rawSheetYear: '',
  opportunityRefNo: '',
  tenderName: '',
  clientName: '',
  groupClassification: '',
  internalLead: '',
  opportunityClassification: '',
  dateTenderReceived: '',
  tenderPlannedSubmissionDate: '',
  avenirStatus: '',
  adnocRftNo: '',
  opportunityValue: '',
  rawSnapshot: {},
};

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
      return getSnapshotValue(opp, headerLabel);
  }
}

function buildExistingRow(opp: Opportunity, rowIndex: number): SheetRow {
  const rawSnapshot: Record<string, string> = {};
  const snapshot = opp.rawGraphData?.rowSnapshot;
  if (snapshot && typeof snapshot === 'object') {
    for (const [k, v] of Object.entries(snapshot)) rawSnapshot[String(k)] = v === null || v === undefined ? '' : String(v);
  }
  return {
    __kind: 'existing',
    __gridId: String(opp.id || opp._id || `${rowIndex}`),
    __sourceId: String(opp.id || opp._id || ''),
    rawSheetYear: String(opp.rawSheetYear || opp.rawGraphData?.year || '').trim(),
    opportunityRefNo: String(opp.opportunityRefNo || opp.tenderNo || '').trim(),
    tenderName: String(opp.tenderName || '').trim(),
    clientName: String(opp.clientName || '').trim(),
    groupClassification: String(opp.groupClassification || '').trim(),
    internalLead: String(opp.internalLead || '').trim(),
    opportunityClassification: String(opp.opportunityClassification || '').trim(),
    dateTenderReceived: String(opp.dateTenderReceived || '').trim(),
    tenderPlannedSubmissionDate: String(opp.tenderPlannedSubmissionDate || '').trim(),
    avenirStatus: String(opp.avenirStatus || '').trim(),
    adnocRftNo: String(opp.adnocRftNo || '').trim(),
    opportunityValue: opp.opportunityValue === null || opp.opportunityValue === undefined ? '' : String(opp.opportunityValue),
    rawSnapshot,
  };
}

function isEditableHeader(header: string) {
  const normalized = normalizeHeader(header);
  if (normalized === normalizeHeader('Sr.no')) return false;
  if (normalized === normalizeHeader('Tender no')) return false;
  return Boolean(EDITABLE_HEADER_TO_FIELD[normalized]);
}

function buildDraftRow(id: string): SheetRow {
  return { __kind: 'draft', __gridId: id, ...EMPTY_ROW };
}

function isTailDraftRow(row: SheetRow) {
  return row.__kind === 'draft' && String(row.__gridId).startsWith(TAIL_DRAFT_ID_PREFIX);
}

export function SpreadsheetOpportunitiesTable({
  data,
  onSelectOpportunity,
  onRowDoubleClick,
  token,
  canEdit,
  onUpsertRow,
}: {
  data: Opportunity[];
  onSelectOpportunity?: (opp: Opportunity) => void;
  onRowDoubleClick?: (opp: Opportunity) => void;
  token?: string | null;
  canEdit?: boolean;
  onUpsertRow?: (row: Partial<Opportunity> & { id?: string }) => void;
}) {
  const [zoomPct, setZoomPct] = useState(100);
  const zoomScale = Math.max(50, Math.min(160, zoomPct)) / 100;
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLowerCase();

  const [rows, setRows] = useState<SheetRow[]>([]);
  const existingByGridId = useRef(new Map<string, Opportunity>());
  const [pendingCells, setPendingCells] = useState<Set<PendingCellKey>>(() => new Set());
  const [rowSaveStates, setRowSaveStates] = useState<Record<string, SaveState>>({});
  const [confirmState, setConfirmState] = useState<ConfirmationState>(null);
  const [tailDraftCount, setTailDraftCount] = useState(1);
  const saveTimersRef = useRef<Map<string, number>>(new Map());
  const dirtyOriginalRowsRef = useRef<Map<string, SheetRow>>(new Map());
  const pendingPatchRef = useRef<Map<string, Partial<SheetRow>>>(new Map());
  const latestRowsRef = useRef<SheetRow[]>([]);

  useEffect(() => {
    existingByGridId.current = new Map(
      data.map((opp, idx) => [String(opp.id || opp._id || `${idx}`), opp]),
    );
  }, [data]);

  useEffect(() => {
    latestRowsRef.current = rows;
  }, [rows]);

  const filteredData = useMemo(() => {
    if (!normalizedQuery) return data;
    return data.filter((opp) => {
      const parts: string[] = [];
      parts.push(String(opp.opportunityRefNo || ''));
      parts.push(String(opp.tenderNo || ''));
      parts.push(String(opp.tenderName || ''));
      parts.push(String(opp.clientName || ''));
      parts.push(String(opp.groupClassification || ''));
      parts.push(String(opp.internalLead || ''));
      parts.push(String(opp.avenirStatus || ''));
      const snapshot = opp.rawGraphData?.rowSnapshot;
      if (snapshot && typeof snapshot === 'object') {
        parts.push(Object.values(snapshot).map((v) => String(v ?? '')).join(' '));
      }
      return parts.join(' ').toLowerCase().includes(normalizedQuery);
    });
  }, [data, normalizedQuery]);

  useEffect(() => {
    setRows((previous) => {
      const preservedDrafts = previous.filter((row) => row.__kind === 'draft' && !isTailDraftRow(row));
      const existingRows = filteredData.map((opp, idx) => buildExistingRow(opp, idx));
      const tailDraftRows = Array.from({ length: tailDraftCount }, (_, idx) => buildDraftRow(`${TAIL_DRAFT_ID_PREFIX}${idx + 1}`));
      return [...existingRows, ...preservedDrafts, ...tailDraftRows];
    });
  }, [filteredData, tailDraftCount]);

  useEffect(() => {
    setRows((previous) => {
      const withoutTail = previous.filter((row) => !isTailDraftRow(row));
      const tailDraftRows = Array.from({ length: tailDraftCount }, (_, idx) => buildDraftRow(`${TAIL_DRAFT_ID_PREFIX}${idx + 1}`));
      return [...withoutTail, ...tailDraftRows];
    });
  }, [tailDraftCount]);

  const insertDraftRowBelow = (gridId: string) => {
    setRows((prev) => {
      const index = prev.findIndex((r) => r.__gridId === gridId);
      const at = index >= 0 ? index + 1 : prev.length;
      const id = `draft-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const draft: SheetRow = buildDraftRow(id);
      const next = prev.slice();
      next.splice(at, 0, draft);
      return next;
    });
  };

  const discardDraftRow = (gridId: string) => {
    setRows((prev) => prev.filter((r) => r.__gridId !== gridId));
  };

  const setPending = (rowId: string, field: string, on: boolean) => {
    const key: PendingCellKey = `${rowId}:${field}`;
    setPendingCells((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const setRowState = useCallback((rowId: string, state: SaveState) => {
    setRowSaveStates((previous) => (previous[rowId] === state ? previous : { ...previous, [rowId]: state }));
  }, []);

  const clearRowTimer = useCallback((rowId: string) => {
    const timer = saveTimersRef.current.get(rowId);
    if (timer) window.clearTimeout(timer);
    saveTimersRef.current.delete(rowId);
  }, []);

  const rollbackRow = useCallback((rowId: string) => {
    const original = dirtyOriginalRowsRef.current.get(rowId);
    if (!original) return;
    setRows((previous) => previous.map((row) => (row.__gridId === rowId ? original : row)));
  }, []);

  const flushRowSave = useCallback(async (rowId: string) => {
    clearRowTimer(rowId);
    const patch = pendingPatchRef.current.get(rowId);
    if (!patch || Object.keys(patch).length === 0) return;
    const currentRow = latestRowsRef.current.find((row) => row.__gridId === rowId) || null;
    if (!currentRow) return;
    setRowState(rowId, 'saving');

    try {
      if (!token) throw new Error('Not authenticated.');
      const response = await fetch(`${API_URL}/opportunities/manual-entry/save`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: currentRow.__kind === 'draft' ? 'new' : 'update',
          confirmed: true,
          opportunityRefNo: String(currentRow.opportunityRefNo || '').trim(),
          ...(currentRow.__kind === 'draft'
            ? {
                rawSheetYear: currentRow.rawSheetYear,
                tenderName: currentRow.tenderName,
                clientName: currentRow.clientName,
                groupClassification: currentRow.groupClassification,
                internalLead: currentRow.internalLead,
                opportunityClassification: currentRow.opportunityClassification,
                dateTenderReceived: currentRow.dateTenderReceived,
                tenderPlannedSubmissionDate: currentRow.tenderPlannedSubmissionDate,
                tenderSubmittedDate: '',
                opportunityValue: currentRow.opportunityValue,
                avenirStatus: currentRow.avenirStatus,
                adnocRftNo: currentRow.adnocRftNo,
              }
            : { patch }),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(data?.error || 'Failed to save'));
      if (data?.row) onUpsertRow?.(data.row);
      if (currentRow.__kind === 'draft' && data?.row) {
        const createdRow = buildExistingRow(data.row as Opportunity, 0);
        setRows((previous) => previous.map((row) => (row.__gridId === rowId ? createdRow : row)));
      }
      dirtyOriginalRowsRef.current.delete(rowId);
      pendingPatchRef.current.delete(rowId);
      setRowState(rowId, 'saved');
      window.setTimeout(() => {
        setRowState(rowId, 'idle');
      }, 900);
      toast.success(currentRow.__kind === 'draft' ? 'New row saved.' : 'Saved.');
    } catch (error) {
      pendingPatchRef.current.delete(rowId);
      rollbackRow(rowId);
      setRowState(rowId, 'error');
      toast.error((error as Error).message || 'Failed to save.');
      window.setTimeout(() => {
        setRowState(rowId, 'dirty');
      }, 1200);
    }
  }, [clearRowTimer, onUpsertRow, rollbackRow, setRowState, token]);

  const queueRowSave = useCallback((rowId: string, patch: Partial<SheetRow>, originalRow: SheetRow) => {
    pendingPatchRef.current.set(rowId, { ...(pendingPatchRef.current.get(rowId) || {}), ...patch });
    if (!dirtyOriginalRowsRef.current.has(rowId)) dirtyOriginalRowsRef.current.set(rowId, originalRow);
    setRowState(rowId, 'dirty');
    clearRowTimer(rowId);
    const timer = window.setTimeout(() => {
      void flushRowSave(rowId);
    }, 600);
    saveTimersRef.current.set(rowId, timer);
  }, [clearRowTimer, flushRowSave, setRowState]);

  const flushAllRowSaves = useCallback(() => {
    Array.from(saveTimersRef.current.keys()).forEach((rowId) => {
      void flushRowSave(rowId);
    });
  }, [flushRowSave]);

  useEffect(() => {
    const onBeforeUnload = () => flushAllRowSaves();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      flushAllRowSaves();
    };
  }, [flushAllRowSaves]);

  const saveExistingPatch = async (row: SheetRow, field: keyof Opportunity, value: unknown, confirmed: boolean) => {
    if (!token) throw new Error('Not authenticated.');
    const opportunityRefNo = String(row.opportunityRefNo || '').trim();
    if (!opportunityRefNo) throw new Error('Missing opportunity reference number for this row.');
    const response = await fetch(`${API_URL}/opportunities/manual-entry/save`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'update',
        confirmed,
        opportunityRefNo,
        patch: { [field]: value },
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const err = String(data?.error || 'Failed to save');
      const e = new Error(err);
      // @ts-expect-error attach payload
      e.__payload = data;
      throw e;
    }
    if (data?.row) onUpsertRow?.(data.row);
    return data;
  };

  const saveExistingSnapshot = async (row: SheetRow, header: string, value: unknown, confirmed: boolean) => {
    if (!token) throw new Error('Not authenticated.');
    const opportunityRefNo = String(row.opportunityRefNo || '').trim();
    if (!opportunityRefNo) throw new Error('Missing opportunity reference number for this row.');
    const response = await fetch(`${API_URL}/opportunities/manual-entry/save`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'update',
        confirmed,
        opportunityRefNo,
        patch: { snapshot: { header, value } },
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const err = String(data?.error || 'Failed to save');
      const e = new Error(err);
      // @ts-expect-error attach payload
      e.__payload = data;
      throw e;
    }
    if (data?.row) onUpsertRow?.(data.row);
    return data;
  };

  const createDraftAsNew = async (row: SheetRow, confirmed: boolean) => {
    if (!token) throw new Error('Not authenticated.');
    const opportunityRefNo = String(row.opportunityRefNo || '').trim();
    if (!opportunityRefNo) throw new Error('opportunityRefNo is required');
    const response = await fetch(`${API_URL}/opportunities/manual-entry/save`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'new',
        confirmed,
        opportunityRefNo,
        rawSheetYear: row.rawSheetYear,
        tenderName: row.tenderName,
        clientName: row.clientName,
        groupClassification: row.groupClassification,
        internalLead: row.internalLead,
        opportunityClassification: row.opportunityClassification,
        dateTenderReceived: row.dateTenderReceived,
        tenderPlannedSubmissionDate: row.tenderPlannedSubmissionDate,
        opportunityValue: row.opportunityValue,
        avenirStatus: row.avenirStatus,
        adnocRftNo: row.adnocRftNo,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const err = String(data?.error || 'Failed to create');
      const e = new Error(err);
      // @ts-expect-error attach payload
      e.__payload = data;
      // @ts-expect-error attach status
      e.__status = response.status;
      throw e;
    }
    if (data?.row) onUpsertRow?.(data.row);
    return data;
  };

  const processRowUpdate = async (newRowModel: GridRowModel, oldRowModel: GridRowModel) => {
    const newRow = newRowModel as SheetRow;
    const oldRow = oldRowModel as SheetRow;
    const rowId = String(newRow.__gridId);

    const changedKeys = (Object.keys(EMPTY_ROW) as Array<keyof typeof EMPTY_ROW>).filter((k) => {
      if (k === 'rawSnapshot') return false;
      return String((newRow as any)[k] ?? '') !== String((oldRow as any)[k] ?? '');
    });

    if (!changedKeys.length) return newRow;

    const patch = changedKeys.reduce<Partial<SheetRow>>((acc, key) => {
      if (key === 'rawSnapshot') return acc;
      acc[key] = (newRow as SheetRow)[key];
      return acc;
    }, {});

    try {
      if (!canEdit) throw new Error('You do not have permission to edit rows.');
      changedKeys.forEach((key) => setPending(rowId, String(key), true));

      setRows((previous) => previous.map((row) => (row.__gridId === rowId ? newRow : row)));

      if (newRow.__kind === 'draft') {
        if (!String(newRow.opportunityRefNo || '').trim()) {
          setRowState(rowId, 'dirty');
          return newRow;
        }
        queueRowSave(rowId, patch, oldRow);
        return newRow;
      }

      queueRowSave(rowId, patch, oldRow);
      return newRow;
    } catch (error) {
      const err = error as Error & { __payload?: any; __status?: number };
      const payload = (err as any).__payload;
      const message = err?.message || 'Failed to save.';
      toast.error(String(payload?.error || message || 'Failed to save.'));
      rollbackRow(rowId);
      return oldRow;
    } finally {
      changedKeys.forEach((key) => {
        setPending(rowId, String(key), false);
      });
    }
  };

  const columns = useMemo(() => {
    const cols: GridColDef<SheetRow>[] = [];

    cols.push({
      field: '__state',
      headerName: '',
      width: Math.round(22 * zoomScale),
      sortable: false,
      filterable: false,
      disableColumnMenu: true,
      renderCell: (params) => {
        const state = rowSaveStates[params.row.__gridId] || 'idle';
        const className = state === 'saving'
          ? 'bg-blue-500'
          : state === 'dirty'
            ? 'bg-amber-500'
            : state === 'saved'
              ? 'bg-emerald-500'
              : state === 'error'
                ? 'bg-red-500'
                : 'bg-transparent';
        return (
          <span className={`inline-block h-2.5 w-2.5 rounded-full ${className}`} title={state} />
        );
      },
    });

    cols.push({
      field: '__actions',
      headerName: '',
      width: Math.round(84 * zoomScale),
      sortable: false,
      filterable: false,
      disableColumnMenu: true,
      renderCell: (params) => {
        const row = params.row;
        return (
          <div className="sheet-row-actions flex items-center gap-1">
            {row.__kind === 'draft' ? (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => discardDraftRow(row.__gridId)}
                title="Discard draft row"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            ) : null}
            {canEdit ? (
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="sheet-insert-row-btn"
                onClick={() => insertDraftRowBelow(row.__gridId)}
                title="Insert row below"
              >
                <Plus className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        );
      },
    });

    cols.push({
      field: 'srNo',
      headerName: 'Sr.no',
      width: Math.round(72 * zoomScale),
      sortable: false,
      filterable: false,
      valueGetter: (_value, row) => {
        const index = rows.findIndex((r) => r.__gridId === row.__gridId);
        return index >= 0 ? String(rows.length - index) : '';
      },
    });

    cols.push({
      field: 'rawSheetYear',
      headerName: 'Year',
      width: Math.round(80 * zoomScale),
      editable: Boolean(canEdit),
      renderCell: (params) => {
        const pending = pendingCells.has(`${params.row.__gridId}:rawSheetYear`);
        return (
          <div className={`truncate ${pending ? 'opacity-60' : ''}`} title={String(params.value ?? '')}>
            {String(params.value ?? '')}
          </div>
        );
      },
    });

    // Tender no as opportunityRefNo.
    cols.push({
      field: 'opportunityRefNo',
      headerName: 'Tender no',
      width: Math.round(140 * zoomScale),
      editable: Boolean(canEdit),
      preProcessEditCellProps: (params) => {
        const value = String(params.props.value ?? '').trim();
        if (params.row.__kind !== 'draft') return { ...params.props, error: false };
        return { ...params.props, error: !value };
      },
      renderCell: (params) => {
        const pending = pendingCells.has(`${params.row.__gridId}:opportunityRefNo`);
        return (
          <div className={`truncate ${pending ? 'opacity-60' : ''}`} title={String(params.value ?? '')}>
            {String(params.value ?? '')}
          </div>
        );
      },
    });

    const byHeader: Array<{ header: string; field: keyof SheetRow; editable: boolean; width: number }> = [
      { header: 'Tender name', field: 'tenderName', editable: true, width: 320 },
      { header: 'Client', field: 'clientName', editable: true, width: 220 },
      { header: 'ADNOC RFT NO', field: 'adnocRftNo', editable: true, width: 160 },
      { header: 'GDS/GES', field: 'groupClassification', editable: true, width: 110 },
      { header: 'Assigned Person', field: 'internalLead', editable: true, width: 200 },
      { header: 'Tender Type', field: 'opportunityClassification', editable: true, width: 140 },
      { header: 'date tender recd', field: 'dateTenderReceived', editable: true, width: 140 },
      { header: 'Tender Due  date', field: 'tenderPlannedSubmissionDate', editable: true, width: 140 },
      { header: 'AVENIR STATUS', field: 'avenirStatus', editable: true, width: 140 },
      { header: 'Tender value', field: 'opportunityValue', editable: true, width: 160 },
    ];

    byHeader.forEach(({ header, field, editable, width }) => {
      cols.push({
        field: String(field),
        headerName: header,
        width: Math.round(width * zoomScale),
        editable: Boolean(canEdit) && editable,
        renderCell: (params) => {
          const pending = pendingCells.has(`${params.row.__gridId}:${String(field)}`);
          return (
            <div className={`truncate ${pending ? 'opacity-60' : ''}`} title={String(params.value ?? '')}>
              {String(params.value ?? '')}
            </div>
          );
        },
      });
    });

    // Non-editable snapshot columns (read-only): render from rawSnapshot if present.
    const already = new Set(cols.map((c) => normalizeHeader(String(c.headerName || ''))));
    ALL_COLUMN_HEADERS.forEach((col) => {
      const header = col.header;
      const normalized = normalizeHeader(header);
      if (already.has(normalized)) return;
      cols.push({
        field: `snap__${normalized}`,
        headerName: header,
        width: Math.round((col.widthPx || 180) * zoomScale),
        editable: false,
        sortable: false,
        valueGetter: (_value, row) => {
          if (row.__kind !== 'existing') return '';
          const opp = existingByGridId.current.get(row.__gridId);
          if (!opp) return '';
          return getSmartValue(opp, header);
        },
      });
    });

    return cols;
  }, [canEdit, pendingCells, rowSaveStates, rows, zoomScale]);

  const rowHeight = Math.round(34 * zoomScale);
  const headerHeight = Math.round(34 * zoomScale);

  const handleConfirm = async () => {
    if (!confirmState) return;
    const { requestBody, nextRow } = confirmState;
    try {
      if (!token) throw new Error('Not authenticated.');
      const response = await fetch(`${API_URL}/opportunities/manual-entry/save`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(data?.error || 'Failed to save'));
      if (data?.row) onUpsertRow?.(data.row);
      toast.success('Saved.');
      setRows((prev) => prev.map((r) => (r.__gridId === confirmState.rowId ? nextRow : r)));
      setConfirmState(null);
    } catch (error) {
      toast.error((error as Error).message || 'Failed to save.');
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="text-sm font-semibold">Excel view</div>
          <Separator orientation="vertical" className="h-5" />
          <div className="text-xs text-muted-foreground">Zoom {Math.round(zoomScale * 100)}%</div>
          <Separator orientation="vertical" className="h-5" />
          <div className="text-xs text-muted-foreground">
            {rows.length} rows
            {rows.length !== data.length ? ` (filtered from ${data.length})` : ''}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-[320px] max-w-[70vw]">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter rows..."
              className="pl-8 pr-8"
            />
            {query ? (
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setQuery('')}
                aria-label="Clear filter"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
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
          {canEdit ? (
            <Button type="button" size="sm" onClick={() => {
              if (!rows.length) {
                const id = `draft-${Date.now()}-${Math.random().toString(16).slice(2)}`;
                setRows([buildDraftRow(id)]);
                return;
              }
              insertDraftRowBelow(rows[rows.length - 1].__gridId);
            }}>
              <Plus className="mr-2 h-4 w-4" /> Add row
            </Button>
          ) : null}
        </div>
      </div>

      <div className={`${styles.viewport} flex-1 min-h-0 rounded-xl border border-border bg-background`}>
        <DataGrid
          rows={rows}
          columns={columns}
          getRowId={(row) => (row as SheetRow).__gridId as GridRowId}
          density="compact"
          rowHeight={rowHeight}
          columnHeaderHeight={headerHeight}
          disableRowSelectionOnClick
          editMode="cell"
          processRowUpdate={processRowUpdate}
          onRowsScrollEnd={() => setTailDraftCount((current) => current + TAIL_DRAFT_BATCH_SIZE)}
          onRowClick={(params) => {
            const row = params.row as SheetRow;
            if (row.__kind !== 'existing') return;
            const opp = existingByGridId.current.get(row.__gridId);
            if (opp) onSelectOpportunity?.(opp);
          }}
          onRowDoubleClick={(params) => {
            const row = params.row as SheetRow;
            if (row.__kind !== 'existing') return;
            const opp = existingByGridId.current.get(row.__gridId);
            if (opp) onRowDoubleClick?.(opp);
          }}
          getRowClassName={(params) => {
            const row = params.row as SheetRow;
            if (row.__kind !== 'existing') return 'opp-row';
            const opp = existingByGridId.current.get(row.__gridId);
            const status = opp ? normalizeCanonicalStatus(getDisplayStatus(opp)) : '';
            if (!status) return 'opp-row';
            return `opp-row status-${status.replace(/\s+/g, '-').replace(/\//g, '-').toLowerCase()}`;
          }}
          sx={{
            height: '100%',
            border: 0,
            backgroundColor: 'transparent',
            '& .MuiDataGrid-columnHeaders': {
              backgroundColor: 'hsl(var(--card))',
              color: 'hsl(var(--foreground))',
              borderBottom: '1px solid hsl(var(--border))',
              fontWeight: 700,
            },
            '& .MuiDataGrid-columnSeparator': { color: 'hsl(var(--border))' },
            '& .MuiDataGrid-cell': {
              borderBottom: '1px solid hsl(var(--border))',
              color: 'hsl(var(--foreground))',
              outline: 'none',
            },
            '& .MuiDataGrid-row:hover': { backgroundColor: 'hsl(var(--muted) / 0.5)' },
            '& .MuiDataGrid-row.Mui-selected': { backgroundColor: 'hsl(var(--primary) / 0.06)' },
            '& .MuiDataGrid-row.Mui-selected:hover': { backgroundColor: 'hsl(var(--primary) / 0.1)' },
            '& .sheet-insert-row-btn': { opacity: 0, pointerEvents: 'none' },
            '& .MuiDataGrid-row:hover .sheet-insert-row-btn': { opacity: 1, pointerEvents: 'auto' },
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

      <Dialog open={Boolean(confirmState)} onOpenChange={(open) => { if (!open) setConfirmState(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Overwrite existing value?</DialogTitle>
            <DialogDescription>
              This change would overwrite an existing value. Confirm to proceed or cancel to revert.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border p-3 text-sm">
            <div className="font-semibold">Field</div>
            <div className="text-muted-foreground">{confirmState?.fieldLabel || 'Field'}</div>
            <div className="mt-3 font-semibold">Tender no</div>
            <div className="text-muted-foreground">{confirmState?.nextRow.opportunityRefNo || '—'}</div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmState(null)}>Cancel</Button>
            <Button type="button" onClick={handleConfirm}>Confirm overwrite</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
