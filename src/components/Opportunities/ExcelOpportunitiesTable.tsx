import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Minus, Plus, RotateCcw } from 'lucide-react';
import { Opportunity } from '@/data/opportunityData';
import { getDisplayStatus, getStatusBadgeClass, normalizeCanonicalStatus } from '@/lib/opportunityStatus';
import { DataGrid, GridToolbar, type GridColDef } from '@mui/x-data-grid';
import styles from './ExcelOpportunitiesTable.module.css';

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
    default:
      return '';
  }
}

function getDisplayValue(opp: Opportunity, headerLabel: string): string {
  const primary = getSmartValue(opp, headerLabel);
  if (primary) return primary;
  return getSnapshotValue(opp, headerLabel);
}

export function ExcelOpportunitiesTable({
  data,
  onSelectOpportunity,
}: {
  data: Opportunity[];
  onSelectOpportunity?: (opp: Opportunity) => void;
}) {
  const [zoomPct, setZoomPct] = useState(100);
  const zoomScale = Math.max(50, Math.min(160, zoomPct)) / 100;
  const [pageSize, setPageSize] = useState<number | 'all'>('all');
  const [page, setPage] = useState(0);

  const columns: GridColDef<Opportunity & { __rowIndex: number }>[] = useMemo(() => {
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
      renderCell: (params) => renderValue(params.row, col.header),
      valueGetter: (_value, row) => getDisplayValue(row, col.header),
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
  }, [zoomScale]);

  const rows = useMemo(() => data.map((opp, idx) => ({ ...opp, __rowIndex: idx })), [data]);
  const rowHeight = Math.max(28, Math.round(34 * zoomScale));
  const headerHeight = Math.max(34, Math.round(40 * zoomScale));

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

      <div className={`${styles.viewport} flex-1 min-h-0`}>
        <DataGrid
          rows={rows}
          columns={columns}
          getRowId={(row) => row.id}
          density="compact"
          rowHeight={rowHeight}
          columnHeaderHeight={headerHeight}
          disableRowSelectionOnClick
          onRowClick={(params) => onSelectOpportunity?.(params.row)}
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
