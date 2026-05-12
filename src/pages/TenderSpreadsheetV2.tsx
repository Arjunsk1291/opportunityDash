import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

const API_URL = import.meta.env.VITE_API_URL || '/api';

type WorkbookSheet = {
  id: string;
  name: string;
  rowCount: number;
  colCount: number;
  freezeRows: number;
  columnWidthsPx?: Record<string, number>;
  rowHeightsPx?: Record<string, number>;
  merges?: Array<{ start: string; end: string }>;
  cells: unknown[][];
};

type WorkbookPayload = {
  version: number;
  generatedAt: string;
  workbook: {
    name: string;
    sheets: WorkbookSheet[];
  };
};

export default function TenderSpreadsheetV2() {
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<WorkbookPayload | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!token) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API_URL}/spreadsheet/workbook/opportunities`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = (await res.json().catch(() => null)) as WorkbookPayload | null;
        if (!res.ok) {
          const maybeError = (data && typeof data === 'object' && 'error' in data) ? (data as unknown as { error?: unknown }).error : undefined;
          throw new Error(String(maybeError || 'Failed to load workbook'));
        }
        if (!cancelled) setPayload(data);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [token]);

  const sheet = payload?.workbook?.sheets?.[0] || null;
  const headerRow = useMemo(() => {
    if (!sheet?.cells?.length) return [];
    const idx = Math.max(0, Number(sheet.freezeRows || 1) - 1);
    const row = sheet.cells[idx] || [];
    return row.map((v) => String(v ?? '').trim());
  }, [sheet]);

  const dataRows = useMemo(() => {
    if (!sheet?.cells?.length) return [];
    return sheet.cells.slice(Math.max(0, Number(sheet.freezeRows || 1)));
  }, [sheet]);

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-5 w-96" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 space-y-3">
        <div className="text-xl font-semibold">Spreadsheet (v2)</div>
        <div className="text-sm text-destructive">{error}</div>
      </div>
    );
  }

  if (!sheet) {
    return (
      <div className="p-6 space-y-3">
        <div className="text-xl font-semibold">Spreadsheet (v2)</div>
        <div className="text-sm text-muted-foreground">No workbook data returned.</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xl font-semibold">Spreadsheet (v2)</div>
          <div className="text-sm text-muted-foreground">
            Backend-driven workbook snapshot · {payload?.generatedAt ? new Date(payload.generatedAt).toLocaleString() : ''}
          </div>
        </div>
        <Button type="button" variant="outline" onClick={() => window.location.reload()}>Refresh</Button>
      </div>

      <div className="rounded-md border overflow-auto max-h-[calc(100vh-14rem)]">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-background z-10">
            <tr className="border-b">
              {headerRow.map((h, idx) => (
                <th key={idx} className="px-3 py-2 text-left whitespace-nowrap">{h || `Col ${idx + 1}`}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dataRows.slice(0, 200).map((row, rIdx) => (
              <tr key={rIdx} className="border-b last:border-b-0">
                {headerRow.map((_h, cIdx) => (
                  <td key={cIdx} className="px-3 py-2 align-top whitespace-nowrap">
                    {row?.[cIdx] === null || row?.[cIdx] === undefined ? '' : String(row[cIdx])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-muted-foreground">
        Showing first 200 rows for safety while we replace the current MUI spreadsheet with the Excel-like grid.
      </div>
    </div>
  );
}
