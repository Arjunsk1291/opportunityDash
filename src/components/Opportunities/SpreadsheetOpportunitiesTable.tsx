import { useEffect, useMemo, useRef, useState } from 'react';
import jspreadsheet from 'jspreadsheet-ce';
import 'jspreadsheet-ce/dist/jspreadsheet.css';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Minus, Plus, RotateCcw, Search, X } from 'lucide-react';
import { Opportunity } from '@/data/opportunityData';
import { getDisplayStatus, normalizeCanonicalStatus } from '@/lib/opportunityStatus';
import styles from './SpreadsheetOpportunitiesTable.module.css';

type Column = {
  header: string;
  widthPx?: number;
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
    case 'ADNOC RFT NO':
      return String(opp.adnocRftNo || '').trim();
    case 'TENDER VALUE':
      return opp.opportunityValue !== null && opp.opportunityValue !== undefined ? String(opp.opportunityValue) : '';
    default:
      return '';
  }
}

function getDisplayValue(opp: Opportunity, headerLabel: string): string {
  const primary = getSmartValue(opp, headerLabel);
  if (primary) return primary;
  return getSnapshotValue(opp, headerLabel);
}

export function SpreadsheetOpportunitiesTable({
  data,
  onSelectOpportunity,
}: {
  data: Opportunity[];
  onSelectOpportunity?: (opp: Opportunity) => void;
}) {
  const spreadsheetRef = useRef<HTMLDivElement | null>(null);
  const instanceRef = useRef<{ destroy?: () => void } | null>(null);
  const [zoomPct, setZoomPct] = useState(100);
  const zoomScale = Math.max(50, Math.min(160, zoomPct)) / 100;
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLowerCase();

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

  const sheetData = useMemo(() => {
    return filteredData.map((opp, idx) => {
      const row: string[] = [];
      row.push(String(idx + 1));
      for (const col of ALL_COLUMN_HEADERS.slice(1)) {
        row.push(getDisplayValue(opp, col.header));
      }
      return row;
    });
  }, [filteredData]);

  useEffect(() => {
    if (!spreadsheetRef.current) return;

    if (instanceRef.current?.destroy) {
      instanceRef.current.destroy();
      instanceRef.current = null;
    }

    const columns = ALL_COLUMN_HEADERS.map((col, index) => ({
      type: index === 0 ? 'numeric' : 'text',
      title: col.header,
      width: Math.round((col.widthPx || 180) * zoomScale),
      readOnly: true,
    }));

    instanceRef.current = jspreadsheet(spreadsheetRef.current, {
      data: sheetData,
      columns,
      minDimensions: [columns.length, Math.max(sheetData.length, 1)],
      columnDrag: false,
      rowDrag: false,
      allowInsertRow: false,
      allowInsertColumn: false,
      allowDeleteRow: false,
      allowDeleteColumn: false,
      columnSorting: true,
      tableOverflow: true,
      tableWidth: '100%',
      tableHeight: '100%',
      defaultRowHeight: 28,
      onselection: (_instance: unknown, _x1: unknown, y1: number) => {
        const index = Number(y1);
        const opp = filteredData[index];
        if (opp) onSelectOpportunity?.(opp);
      },
      updateTable: (_instance: unknown, cell: HTMLElement, _col: number, rowIndex: number) => {
        if (!cell) return;
        const rowEl = cell.parentElement as HTMLTableRowElement | null;
        if (!rowEl) return;
        const opp = filteredData[rowIndex];
        if (!opp) return;
        const status = normalizeCanonicalStatus(getDisplayStatus(opp));
        const className = status ? `opp-row status-${status.replace(/\s+/g, '-').replace(/\//g, '-').toLowerCase()}` : 'opp-row';
        if (rowEl.className !== className) rowEl.className = className;
      },
    });

    // Apply zoom by scaling font-size.
    const root = spreadsheetRef.current;
    root.style.fontSize = `${Math.round(12 * zoomScale)}px`;

    return () => {
      if (instanceRef.current?.destroy) {
        instanceRef.current.destroy();
        instanceRef.current = null;
      }
    };
  }, [filteredData, onSelectOpportunity, sheetData, zoomScale]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="text-sm font-semibold">Excel view</div>
          <Separator orientation="vertical" className="h-5" />
          <div className="text-xs text-muted-foreground">Zoom {Math.round(zoomScale * 100)}%</div>
          <Separator orientation="vertical" className="h-5" />
          <div className="text-xs text-muted-foreground">
            {filteredData.length} rows
            {filteredData.length !== data.length ? ` (filtered from ${data.length})` : ''}
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
        </div>
      </div>

      <div className={`flex-1 min-h-0 overflow-hidden rounded-xl border border-border bg-background ${styles.shell}`}>
        <div ref={spreadsheetRef} className={`h-full w-full ${styles.sheet}`} />
      </div>
    </div>
  );
}
