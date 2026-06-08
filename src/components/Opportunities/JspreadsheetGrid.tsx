import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import jspreadsheet from 'jspreadsheet-ce';
import 'jspreadsheet-ce/dist/jspreadsheet.css';
import 'jsuites/dist/jsuites.css';
import { toast } from 'sonner';
import { Opportunity } from '@/data/opportunityData';
import { OPPORTUNITY_COLUMNS } from '@/lib/opportunities/columns';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const DIRECT_DB_KEYS = new Set([
  'rawSheetYear', 'opportunityRefNo', 'tenderName', 'opportunityClassification',
  'clientName', 'groupClassification', 'dateTenderReceived', 'tenderPlannedSubmissionDate',
  'tenderSubmittedDate', 'tenderResult', 'tenderStatusRemark', 'internalLead',
  'opportunityValue', 'avenirStatus', 'adnocRftNo', 'remarksReason',
]);

const REF_NO_COL_INDEX = OPPORTUNITY_COLUMNS.findIndex((c) => c.key === 'opportunityRefNo');

const ENUM_SOURCES: Record<string, string[]> = {
  groupClassification: ['GDS', 'GES'],
  'Stage of project, Concept, FEED, DE': ['Concept', 'FEED', 'DE', 'Other'],
  'BID / NO BID DECISION': ['BID', 'NO BID'],
  avenirStatus: ['WORKING', 'SUBMITTED', 'AWARDED', 'LOST', 'REGRETTED', 'TO START', 'ONGOING', 'HOLD / CLOSED'],
  tenderStatusRemark: ['WON', 'LOST', 'PENDING', 'AWARDED', 'DROPPED'],
  'Currency, USD/AED': ['USD', 'AED'],
};

const COL_WIDTHS = [40, 60, 100, 250, 180, 140, 140, 160, 80, 120, 160, 100, 110, 110, 120, 140, 120, 200, 120, 100, 90, 60, 100, 100, 80, 60, 60, 70, 90, 90, 160, 120];

function buildColumns() {
  return OPPORTUNITY_COLUMNS.map((col, idx) => {
    const base = {
      title: col.header,
      width: COL_WIDTHS[idx] ?? 100,
      readOnly: !!col.readOnly,
    };
    if (col.type === 'enum') {
      return { ...base, type: 'dropdown', source: ENUM_SOURCES[col.key] || [] };
    }
    if (col.type === 'number') {
      return { ...base, type: 'numeric', mask: '#,##0.##' };
    }
    if (col.type === 'percent') {
      return { ...base, type: 'numeric', mask: '#0.##' };
    }
    if (col.type === 'date') {
      return { ...base, type: 'calendar', options: { format: 'YYYY-MM-DD' } };
    }
    return { ...base, type: 'text' };
  });
}

function buildRows(opportunities: Opportunity[], exchangeRate: number): string[][] {
  return opportunities.map((opp, idx) => {
    const snap = (opp.rawGraphData?.rowSnapshot || {}) as Record<string, unknown>;
    const get = (key: string) => {
      if (DIRECT_DB_KEYS.has(key)) {
        const val = (opp as Record<string, unknown>)[key];
        return val !== null && val !== undefined ? String(val) : '';
      }
      const v = snap[key];
      return v !== null && v !== undefined ? String(v) : '';
    };

    const opportunityValue = Number(String(opp.opportunityValue ?? '').replace(/,/g, '')) || 0;
    const gmPct = Number(String(get('GM%'))) || 0;
    const goPct = Number(String(get('Go%'))) || 0;
    const getPct = Number(String(get('Get %'))) || 0;
    const currency = String(get('Currency, USD/AED')).toUpperCase();

    const gmValue = opportunityValue * (gmPct / 100);
    const goGetPct = goPct * getPct / 10000;
    const goGetValue = opportunityValue * goGetPct;
    const usdToAed = currency === 'USD' ? opportunityValue * exchangeRate : opportunityValue;

    return OPPORTUNITY_COLUMNS.map((col, colIdx): string => {
      if (col.key === 'Sr.no') return String(idx + 1);
      if (col.key === 'GM Value') return gmValue ? String(gmValue.toFixed(2)) : '';
      if (col.key === 'GO/Get %') return goGetPct ? String((goGetPct * 100).toFixed(2)) : '';
      if (col.key === 'go/get value') return goGetValue ? String(goGetValue.toFixed(2)) : '';
      if (col.key === 'USD to AED') return usdToAed ? String(usdToAed.toFixed(2)) : '';
      return get(col.key);
    });
  });
}

export interface JspreadsheetGridHandle {
  search: (term: string) => void;
}

interface JspreadsheetGridProps {
  opportunities: Opportunity[];
  exchangeRate: number;
  token: string | null;
  canEdit: boolean;
  onUpsertOpportunity: (rows: Opportunity[]) => void;
}

export const JspreadsheetGrid = forwardRef<JspreadsheetGridHandle, JspreadsheetGridProps>(
  function JspreadsheetGrid({ opportunities, exchangeRate, token, canEdit, onUpsertOpportunity }, ref) {
    const divRef = useRef<HTMLDivElement>(null);
    const instanceRef = useRef<HTMLDivElement | null>(null);
    const rowColorsRef = useRef<string[]>([]);
    const tokenRef = useRef(token);
    tokenRef.current = token;
    const canEditRef = useRef(canEdit);
    canEditRef.current = canEdit;
    const onUpsertRef = useRef(onUpsertOpportunity);
    onUpsertRef.current = onUpsertOpportunity;
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useImperativeHandle(ref, () => ({
      search: (term: string) => {
        const inst = (instanceRef.current as any)?.jspreadsheet;
        if (inst?.search) inst.search(term);
      },
    }));

    useEffect(() => {
      rowColorsRef.current = opportunities.map((opp) => {
        const status = String(opp.avenirStatus || '').toUpperCase();
        const group = String(opp.groupClassification || '').toUpperCase();
        if (status === 'AWARDED') return '#fffbeb';
        if (status === 'LOST' || status === 'REGRETTED') return '#fff1f2';
        if (group === 'GES') return '#f0fdf4';
        if (group === 'GDS') return '#eff6ff';
        return '';
      });
    }, [opportunities]);

    // Init grid once
    useEffect(() => {
      if (!divRef.current) return;
      jspreadsheet.destroy(divRef.current, true);

      const saveCell = async (refNo: string, colKey: string, colHeader: string, value: string) => {
        const t = tokenRef.current;
        const ce = canEditRef.current;
        if (!t || !ce) return;

        let body: Record<string, unknown>;
        if (DIRECT_DB_KEYS.has(colKey)) {
          body = { opportunityRefNo: refNo, [colKey]: value, mode: 'update', confirmed: true };
        } else {
          body = { opportunityRefNo: refNo, mode: 'update', confirmed: true, patch: { snapshot: { header: colHeader, value } } };
        }

        try {
          const res = await fetch(`${API_URL}/opportunities/manual-entry/save`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data?.error || 'Auto-save failed');
          }
          const data = await res.json().catch(() => ({}));
          const updated = data?.row || data?.rows?.[0];
          if (updated) onUpsertRef.current([updated]);
        } catch (e) {
          toast.error((e as Error).message || 'Auto-save failed');
        }
      };

      const inst = jspreadsheet(divRef.current, {
        data: [[]],
        columns: buildColumns(),
        tableOverflow: true,
        tableWidth: '100%',
        tableHeight: 'calc(100vh - 280px)',
        minDimensions: [32, 5],
        search: false,
        freezeColumns: 3,
        updateTable: (_inst: unknown, cell: HTMLTableCellElement, _colIdx: number, rowIdx: number) => {
          const color = rowColorsRef.current[rowIdx] || '';
          cell.style.backgroundColor = color;
        },
        onchange: (el: HTMLElement, _cell: HTMLTableCellElement, colIdx: string | number, rowIdx: string | number, newVal: unknown) => {
          const col = Number(colIdx);
          const row = Number(rowIdx);
          const column = OPPORTUNITY_COLUMNS[col];
          if (!column || column.readOnly || column.computed) return;

          const inst2 = (el as any)?.jspreadsheet;
          const refNo = String(inst2?.getValueFromCoords?.(REF_NO_COL_INDEX, row) || '').trim();
          if (!refNo) return;

          if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
          saveTimerRef.current = setTimeout(() => {
            void saveCell(refNo, column.key, column.header, String(newVal ?? ''));
          }, 400);
        },
      });

      instanceRef.current = inst as unknown as HTMLDivElement;

      return () => {
        if (divRef.current) jspreadsheet.destroy(divRef.current, true);
      };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Reload data when opportunities change
    useEffect(() => {
      const inst = (instanceRef.current as any);
      if (!inst?.jspreadsheet?.setData) return;
      const rows = buildRows(opportunities, exchangeRate);
      inst.jspreadsheet.setData(rows.length ? rows : [[]]);
    }, [opportunities, exchangeRate]);

    return <div ref={divRef} />;
  }
);
