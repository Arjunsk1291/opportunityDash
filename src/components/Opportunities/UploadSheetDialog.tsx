import { useState, useRef } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Upload } from 'lucide-react';
import { Opportunity } from '@/data/opportunityData';
import { getFirstWorksheet, loadWorkbookFromArrayBuffer } from '@/lib/excelWorkbook';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { fetchBidDecisionRecords } from '@/lib/bidDecision';
import { fetchPotentialOpportunityRows, getExtrasTenderName } from '@/lib/potentialOpportunities';
import { findManualMatches, type ManualMatchCandidate } from '@/lib/manualMatchFinder';
import { archiveUploadedSheet, arrayBufferToBase64 } from '@/lib/sheetNotify';

const API_URL = import.meta.env.VITE_API_URL || '/api';
const MAX_OPPORTUNITY_UPLOAD_ROWS = 5000;
const SHEET_UPLOAD_COMMIT_BATCH_SIZE = 100;

type RowFormState = {
  rawSheetYear: string;
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

const HEADER_CANDIDATES: Record<keyof RowFormState, string[]> = {
  rawSheetYear: ['year'],
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

interface UploadSheetDialogProps {
  token: string | null;
  opportunities: Opportunity[];
  onUpsertOpportunities: (rows: Opportunity[]) => void;
  onRefreshData: () => void;
  onManualMatchesFound?: (matches: ManualMatchCandidate[]) => void;
  onSheetArchived?: (archiveId: string, meta: { filename: string; createdCount: number; updatedCount: number }) => void;
}

export function UploadSheetDialog({ token, opportunities, onUpsertOpportunities, onRefreshData, onManualMatchesFound, onSheetArchived }: UploadSheetDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [parsedRows, setParsedRows] = useState<RowFormState[]>([]);
  const [uploadMeta, setUploadMeta] = useState<{ created: number; updated: number } | null>(null);
  const [progressLabel, setProgressLabel] = useState<string | null>(null);
  // Raw bytes of the file currently in the preview, kept only so the exact uploaded file can be emailed after commit.
  const rawFileRef = useRef<{ filename: string; base64: string } | null>(null);

  const normalizeRef = (v: string) => String(v || '').trim().toLowerCase();
  const normalizeHeader = (v: unknown) => String(v || '').trim().toLowerCase().replace(/\s+/g, ' ');

  const { execute: executeCommit, isLoading: isCommitting, progress: commitProgress } = useAsyncAction({
    action: async (_: void, reportProgress) => {
      if (!parsedRows.length) throw new Error('No parsed rows to save.');
      const batches: RowFormState[][] = [];
      for (let i = 0; i < parsedRows.length; i += SHEET_UPLOAD_COMMIT_BATCH_SIZE) {
        batches.push(parsedRows.slice(i, i + SHEET_UPLOAD_COMMIT_BATCH_SIZE));
      }
      const touchedByRef = new Map<string, Opportunity>();
      for (let bIdx = 0; bIdx < batches.length; bIdx += 1) {
        setProgressLabel(`Writing batch ${bIdx + 1} of ${batches.length}…`);
        reportProgress?.(Math.round((bIdx / batches.length) * 100));
        const res = await fetch(`${API_URL}/opportunities/sheet-upload/commit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ rows: batches[bIdx] }),
        });
        const raw = await res.text();
        const data = raw ? (() => { try { return JSON.parse(raw); } catch { return { error: raw }; } })() : {};
        if (!res.ok) throw new Error(data?.error || `Save failed (HTTP ${res.status})`);
        (Array.isArray(data?.rows) ? data.rows : []).forEach((row: Opportunity) => {
          const ref = String(row.opportunityRefNo || row.tenderNo || '').trim().toLowerCase();
          if (ref) touchedByRef.set(ref, row);
        });
      }
      const touched = Array.from(touchedByRef.values());
      const committedMeta = uploadMeta;
      const rawFile = rawFileRef.current;
      if (touched.length) onUpsertOpportunities(touched);
      setParsedRows([]);
      setPreviewOpen(false);
      setUploadMeta(null);
      void onRefreshData();

      if (touched.length && token && rawFile && onSheetArchived) {
        try {
          const archiveId = await archiveUploadedSheet(token, {
            filename: rawFile.filename,
            contentBase64: rawFile.base64,
            rowCount: parsedRows.length,
            createdCount: committedMeta?.created || 0,
            updatedCount: committedMeta?.updated || 0,
          });
          if (archiveId) {
            onSheetArchived(archiveId, {
              filename: rawFile.filename,
              createdCount: committedMeta?.created || 0,
              updatedCount: committedMeta?.updated || 0,
            });
          }
        } catch {
          // Non-critical: skip the send-notification prompt silently, the upload itself already succeeded.
        }
      }

      if (touched.length && token && onManualMatchesFound) {
        try {
          const [bidDecisions, potentialRows] = await Promise.all([
            fetchBidDecisionRecords(token),
            fetchPotentialOpportunityRows(token),
          ]);
          const manualBidDecisions = bidDecisions.filter((record) => record.sourceMode === 'manual');
          const unmatchedPotentialRows = potentialRows
            .filter((row) => !row.opportunity)
            .map((row) => ({ id: row.id, opportunityRefNo: row.opportunityRefNo, tenderName: getExtrasTenderName(row.extras) }));
          const touchedRefs = touched.map((row) => ({
            opportunityRefNo: String(row.opportunityRefNo || row.tenderNo || ''),
            tenderName: String(row.tenderName || ''),
          }));
          const matches = findManualMatches(touchedRefs, manualBidDecisions, unmatchedPotentialRows);
          if (matches.length) onManualMatchesFound(matches);
        } catch {
          // Non-critical: skip match detection silently if it fails, the upload itself already succeeded.
        }
      }

      return { success: true };
    },
    successMessage: () => 'Sheet uploaded successfully.',
  });

  const { execute: executeUpload, isLoading: isUploading, progress: uploadProgress } = useAsyncAction({
    action: async (file: File, reportProgress) => {
      setProgressLabel('Reading workbook…');
      reportProgress?.(5);
      const buffer = await file.arrayBuffer();
      rawFileRef.current = { filename: file.name, base64: arrayBufferToBase64(buffer) };
      reportProgress?.(15);
      const workbook = await loadWorkbookFromArrayBuffer(buffer);
      reportProgress?.(40);
      const worksheet = getFirstWorksheet(workbook);
      if (!worksheet) throw new Error('No worksheet found.');

      const maxCols = 50;
      const maxScanRows = Math.min(15, worksheet.rowCount);
      const maxRows = Math.min(worksheet.rowCount, MAX_OPPORTUNITY_UPLOAD_ROWS);

      setProgressLabel('Detecting headers…');
      const scoreRow = (rowIdx: number) => {
        const row = worksheet.getRow(rowIdx);
        let score = 0;
        const cells: string[] = [];
        for (let c = 1; c <= maxCols; c++) cells.push(normalizeHeader(row.getCell(c).value));
        (Object.keys(HEADER_CANDIDATES) as Array<keyof RowFormState>).forEach((key) => {
          if (cells.some((cell) => HEADER_CANDIDATES[key].includes(cell))) score++;
        });
        return score;
      };

      let headerRowIdx = 1;
      let bestScore = -1;
      for (let r = 1; r <= maxScanRows; r++) {
        const s = scoreRow(r);
        if (s > bestScore) { bestScore = s; headerRowIdx = r; }
      }

      const headerRow = worksheet.getRow(headerRowIdx);
      const normalizedHeaders: string[] = [];
      for (let c = 1; c <= maxCols; c++) normalizedHeaders.push(normalizeHeader(headerRow.getCell(c).value));

      const colIdx: Partial<Record<keyof RowFormState, number>> = {};
      (Object.keys(HEADER_CANDIDATES) as Array<keyof RowFormState>).forEach((key) => {
        const idx = normalizedHeaders.findIndex((h) => HEADER_CANDIDATES[key].includes(h));
        if (idx >= 0) colIdx[key] = idx + 1;
      });

      if (colIdx.opportunityRefNo === undefined) throw new Error('Could not find a Tender no / Ref no column.');

      const getCellText = (excelRow: { getCell: (i: number) => { value: unknown } }, key: keyof RowFormState) => {
        const idx = colIdx[key];
        if (idx === undefined) return '';
        const raw = excelRow.getCell(idx).value ?? '';
        if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw.toISOString().slice(0, 10);
        return String(raw ?? '').trim();
      };

      setProgressLabel('Mapping rows…');
      reportProgress?.(50);
      const parsed: RowFormState[] = [];
      const rowSpan = Math.max(1, maxRows - headerRowIdx);
      for (let r = headerRowIdx + 1; r <= maxRows; r++) {
        if ((r - headerRowIdx) % 250 === 0) {
          reportProgress?.(50 + Math.round(((r - headerRowIdx) / rowSpan) * 40));
        }
        const excelRow = worksheet.getRow(r);
        const refNo = getCellText(excelRow, 'opportunityRefNo');
        const tenderName = getCellText(excelRow, 'tenderName');
        const client = getCellText(excelRow, 'clientName');
        if (!refNo && !tenderName && !client) continue;
        parsed.push({
          rawSheetYear: getCellText(excelRow, 'rawSheetYear'),
          opportunityRefNo: refNo,
          tenderName,
          opportunityClassification: getCellText(excelRow, 'opportunityClassification'),
          clientName: client,
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

      setProgressLabel('Diffing with database…');
      reportProgress?.(92);
      const existingByRef = new Map(opportunities.map((o) => [normalizeRef(String(o.opportunityRefNo || o.tenderNo || '')), o]));
      const created: RowFormState[] = [];
      const updated: RowFormState[] = [];
      const unchanged: RowFormState[] = [];
      parsed.forEach((row) => {
        const existing = existingByRef.get(normalizeRef(row.opportunityRefNo));
        if (!existing) { created.push(row); return; }
        const isSame = (a: unknown, b: unknown) => String(a ?? '').trim() === String(b ?? '').trim();
        const changed = !(
          isSame(existing.opportunityRefNo, row.opportunityRefNo) &&
          isSame(existing.tenderName, row.tenderName) &&
          isSame(existing.clientName, row.clientName) &&
          isSame(existing.avenirStatus, row.avenirStatus)
        );
        if (changed) updated.push(row); else unchanged.push(row);
      });

      setParsedRows([...created, ...updated, ...unchanged]);
      setUploadMeta({ created: created.length, updated: updated.length });
      setPreviewOpen(true);
      setProgressLabel(null);
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void executeUpload(file);
    e.currentTarget.value = '';
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx"
        className="hidden"
        onChange={handleFileChange}
        disabled={isUploading || isCommitting}
      />
      <Button
        type="button"
        variant="outline"
        onClick={() => fileInputRef.current?.click()}
        disabled={isUploading || isCommitting}
      >
        <Upload className="mr-2 h-4 w-4" />
        {isUploading ? (
          <span className="flex items-center gap-2">
            Uploading… {Math.round(uploadProgress)}%
          </span>
        ) : 'Upload Sheet'}
      </Button>
      {progressLabel && !previewOpen && (
        <span className="text-xs text-muted-foreground">{progressLabel}</span>
      )}

      <Dialog open={previewOpen} onOpenChange={(open) => { if (!isCommitting) setPreviewOpen(open); }}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Sheet Upload Preview</DialogTitle>
            <DialogDescription>
              Parsed {parsedRows.length} row(s).{uploadMeta ? ` New: ${uploadMeta.created}, Updated: ${uploadMeta.updated}.` : ''}
              {' '}New/updated rows are shown first. Confirm to write to MongoDB.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 mb-2">
            {uploadMeta && (
              <>
                <Badge variant="default">{uploadMeta.created} new</Badge>
                <Badge variant="secondary">{uploadMeta.updated} updated</Badge>
                <Badge variant="outline">{parsedRows.length - uploadMeta.created - uploadMeta.updated} unchanged</Badge>
              </>
            )}
          </div>
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
                {parsedRows.slice(0, 200).map((row, i) => (
                  <tr key={`${row.opportunityRefNo}-${i}`} className="border-b last:border-b-0 hover:bg-muted/20">
                    <td className="px-3 py-2 font-medium">{row.opportunityRefNo || '—'}</td>
                    <td className="px-3 py-2 max-w-[240px] truncate">{row.tenderName || '—'}</td>
                    <td className="px-3 py-2">{row.clientName || '—'}</td>
                    <td className="px-3 py-2">{row.avenirStatus || '—'}</td>
                    <td className="px-3 py-2">{row.opportunityValue || '—'}</td>
                  </tr>
                ))}
                {parsedRows.length > 200 && (
                  <tr><td className="px-3 py-2 text-muted-foreground" colSpan={5}>Showing first 200 of {parsedRows.length} rows.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-end gap-3">
            <Button variant="outline" onClick={() => setPreviewOpen(false)} disabled={isCommitting}>Cancel</Button>
            {isCommitting && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <div className="h-1.5 w-32 overflow-hidden rounded-full bg-muted">
                  <div className="h-full bg-primary transition-[width] duration-200" style={{ width: `${Math.max(2, Math.min(100, commitProgress))}%` }} />
                </div>
                <span>{progressLabel || 'Saving…'} {Math.round(commitProgress)}%</span>
              </div>
            )}
            <Button onClick={() => executeCommit()} disabled={!parsedRows.length || isCommitting}>
              {isCommitting ? 'Saving…' : `Save ${parsedRows.length} Row${parsedRows.length === 1 ? '' : 's'}`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
