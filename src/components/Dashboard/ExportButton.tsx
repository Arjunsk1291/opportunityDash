import { useEffect, useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Opportunity } from '@/data/opportunityData';
import { useCurrency } from '@/contexts/CurrencyContext';
import { getDisplayStatus } from '@/lib/opportunityStatus';
import { useAuth } from '@/contexts/AuthContext';
import defaultExportLogo from '@/assets/avenir-logo.png';
import { DEFAULT_EXPORT_TEMPLATE, ExportTemplateConfig, normalizeExportTemplate } from '@/lib/exportTemplate';

const API_URL = import.meta.env.VITE_API_URL || '/api';

interface ExportButtonProps {
  data: Opportunity[];
  filename?: string;
}

interface ExportColumn {
  id: string;
  label: string;
  getValue: (opp: Opportunity) => string | number;
}

const normalizeHeader = (value: string) => String(value || '').trim().toUpperCase().replace(/\s+/g, ' ');

const getSnapshotValue = (opp: Opportunity, candidateHeaders: string[]) => {
  const snapshot = opp.rawGraphData?.rowSnapshot;
  if (!snapshot || typeof snapshot !== 'object') return '';

  const entries = Object.entries(snapshot);
  for (const header of candidateHeaders) {
    const normalizedHeader = normalizeHeader(header);
    const match = entries.find(([key]) => normalizeHeader(key) === normalizedHeader);
    if (match) return String(match[1] ?? '').trim();
  }

  return '';
};

const getAdnocRftNo = (opp: Opportunity) => String(
  opp.adnocRftNo
  || getSnapshotValue(opp, ['ADNOC RFT NO', 'ADNOC RFT NO.'])
  || '',
).trim();

const getRfpReceivedDisplay = (opp: Opportunity) => (
  opp.dateTenderReceived
  || (typeof opp.rawGraphData?.rfpReceivedDisplay === 'string' ? opp.rawGraphData.rfpReceivedDisplay : '')
  || ''
);

const getSubmissionDisplay = (opp: Opportunity) => (
  opp.tenderSubmittedDate
  || opp.tenderPlannedSubmissionDate
  || (typeof opp.rawGraphData?.tenderSubmittedDisplay === 'string' ? opp.rawGraphData.tenderSubmittedDisplay : '')
  || (typeof opp.rawGraphData?.plannedSubmissionDisplay === 'string' ? opp.rawGraphData.plannedSubmissionDisplay : '')
  || ''
);

const getPostBidDisplay = (opp: Opportunity) => {
  const normalized = String(opp.postBidDetailType || '').trim().toUpperCase();
  if (normalized === 'OTHER') {
    const otherValue = String(opp.postBidDetailOther || '').trim();
    return otherValue ? `Other: ${otherValue}` : 'Other';
  }

  const labels: Record<string, string> = {
    TECHNICAL_CLARIFICATION_MEETING: 'Technical Clarification meeting',
    TECHNICAL_PRESENTATION: 'Technical presentation',
    NO_RESPONSE: 'No response',
  };

  return labels[normalized] || '';
};

const normalizeComparisonText = (value: string | null | undefined) => String(value || '').trim().toLowerCase();
const getBaseRefNo = (value: string | null | undefined) => String(value || '').trim().replace(/_EOI$/i, '');
const isEoiRefNo = (value: string | null | undefined) => /_EOI$/i.test(String(value || '').trim());
const getExportRefNo = (opp: Opportunity) => getBaseRefNo(opp.opportunityRefNo);

const getExportTypeRank = (opp: Opportunity) => {
  const normalizedType = String(opp.opportunityClassification || '').trim().toUpperCase();
  if (normalizedType === 'TENDER') return 0;
  if (normalizedType.includes('EOI') || isEoiRefNo(opp.opportunityRefNo)) return 1;
  return 2;
};

const getExportReceivedTimestamp = (opp: Opportunity) => {
  const directTimestamp = opp.dateTenderReceived ? Date.parse(opp.dateTenderReceived) : Number.NaN;
  if (!Number.isNaN(directTimestamp)) return directTimestamp;

  const display = getRfpReceivedDisplay(opp);
  const displayTimestamp = display ? Date.parse(display) : Number.NaN;
  if (!Number.isNaN(displayTimestamp)) return displayTimestamp;

  return 0;
};

const stripHexHash = (value: string) => value.replace(/^#/, '').toUpperCase();

const getWorksheetSafeName = (value: string) => {
  const sanitized = String(value || '')
    .replace(/[\\/*?:[\]]/g, ' ')
    .trim()
    .slice(0, 31);
  return sanitized || DEFAULT_EXPORT_TEMPLATE.sheetName;
};

const inferImageExtension = (dataUrl: string): 'png' | 'jpeg' => (
  /^data:image\/png/i.test(dataUrl) ? 'png' : 'jpeg'
);

const blobToDataUrl = async (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(new Error('Failed to prepare logo'));
  reader.readAsDataURL(blob);
});

const getDefaultLogoDataUrl = async () => {
  const response = await fetch(defaultExportLogo);
  const blob = await response.blob();
  return blobToDataUrl(blob);
};

export function ExportButton({ data, filename = 'opportunities' }: ExportButtonProps) {
  const { currency, convertValue } = useCurrency();
  const { token } = useAuth();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [includeConvertedEoiDuplicates, setIncludeConvertedEoiDuplicates] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportTemplate, setExportTemplate] = useState<ExportTemplateConfig>(DEFAULT_EXPORT_TEMPLATE);

  const columns = useMemo<ExportColumn[]>(() => {
    const currencySymbol = currency === 'AED' ? 'AED' : 'USD';

    return [
      { id: 'refNo', label: 'Avenir Ref', getValue: (opp) => getExportRefNo(opp) },
      { id: 'adnocRftNo', label: 'ADNOC Ref', getValue: (opp) => getAdnocRftNo(opp) },
      { id: 'tenderName', label: 'Tender Name', getValue: (opp) => opp.tenderName },
      { id: 'tenderType', label: 'Tender Type', getValue: (opp) => opp.opportunityClassification || '' },
      { id: 'client', label: 'Client', getValue: (opp) => opp.clientName },
      { id: 'status', label: 'Status', getValue: (opp) => getDisplayStatus(opp) },
      { id: 'group', label: 'Group', getValue: (opp) => opp.groupClassification },
      { id: 'lead', label: 'Lead', getValue: (opp) => opp.internalLead || 'Unassigned' },
      { id: 'value', label: `Value (${currencySymbol})`, getValue: (opp) => Math.round(convertValue(opp.opportunityValue)) },
      { id: 'rfpReceived', label: 'RFP Received', getValue: (opp) => getRfpReceivedDisplay(opp) },
      { id: 'submission', label: 'Submission', getValue: (opp) => getSubmissionDisplay(opp) },
      { id: 'postBidDetails', label: 'Post bid details', getValue: (opp) => getPostBidDisplay(opp) },
    ];
  }, [convertValue, currency]);

  const [selectedColumnIds, setSelectedColumnIds] = useState<string[]>(() => columns.map((column) => column.id));

  useEffect(() => {
    setSelectedColumnIds((previous) => {
      const validIds = new Set(columns.map((column) => column.id));
      const retained = previous.filter((id) => validIds.has(id));
      return retained.length ? retained : columns.map((column) => column.id);
    });
  }, [columns]);

  useEffect(() => {
    if (!token) {
      setExportTemplate(DEFAULT_EXPORT_TEMPLATE);
      return;
    }

    let cancelled = false;
    const loadTemplate = async () => {
      try {
        const response = await fetch(API_URL + '/export-template/config', {
          headers: {
            Authorization: 'Bearer ' + token,
            'Content-Type': 'application/json',
          },
        });
        if (!response.ok) return;
        const result = await response.json();
        if (!cancelled) setExportTemplate(normalizeExportTemplate(result));
      } catch (error) {
        console.error('Failed to load export template:', error);
      }
    };

    loadTemplate();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const exportableData = useMemo(() => {
    if (includeConvertedEoiDuplicates) return data;

    return data.filter((opp) => {
      if (!isEoiRefNo(opp.opportunityRefNo)) return true;

      const baseRefNo = normalizeComparisonText(getBaseRefNo(opp.opportunityRefNo));
      const tenderName = normalizeComparisonText(opp.tenderName);
      if (!baseRefNo || !tenderName) return true;

      const convertedTenderExists = data.some((candidate) => (
        candidate.id !== opp.id
        && !isEoiRefNo(candidate.opportunityRefNo)
        && normalizeComparisonText(candidate.opportunityRefNo) === baseRefNo
        && normalizeComparisonText(candidate.tenderName) === tenderName
        && normalizeComparisonText(candidate.opportunityClassification) === 'tender'
      ));

      return !convertedTenderExists;
    });
  }, [data, includeConvertedEoiDuplicates]);

  const handleExport = async () => {
    const selectedColumns = columns.filter((column) => selectedColumnIds.includes(column.id));
    if (!selectedColumns.length) return;

    setIsExporting(true);
    try {
      const ExcelJS = await import('exceljs');
      const orderedData = [...exportableData].sort((a, b) => {
        const typeRankDiff = getExportTypeRank(a) - getExportTypeRank(b);
        if (typeRankDiff !== 0) return typeRankDiff;

        const receivedDiff = getExportReceivedTimestamp(b) - getExportReceivedTimestamp(a);
        if (receivedDiff !== 0) return receivedDiff;

        return getExportRefNo(a).localeCompare(getExportRefNo(b));
      });

      const seenSignatures = new Set<string>();
      const exportData = orderedData.reduce<Array<Record<string, string | number>>>((rows, opp) => {
        const row = Object.fromEntries(selectedColumns.map((column) => [column.label, column.getValue(opp)]));
        const signature = JSON.stringify(row);
        if (seenSignatures.has(signature)) return rows;
        seenSignatures.add(signature);
        rows.push(row);
        return rows;
      }, []);

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet(getWorksheetSafeName(exportTemplate.sheetName));
      const columnCount = Math.max(selectedColumns.length, 1);
      const lastColumnIndex = columnCount;
      const titleStartColumn = exportTemplate.showLogo && columnCount >= 3 ? 3 : 1;

      let logoDataUrl = '';
      if (exportTemplate.showLogo) {
        logoDataUrl = exportTemplate.logoDataUrl || await getDefaultLogoDataUrl();
        if (logoDataUrl) {
          const imageId = workbook.addImage({
            base64: logoDataUrl,
            extension: inferImageExtension(logoDataUrl),
          });
          worksheet.addImage(imageId, {
            tl: { col: 0, row: 0 },
            ext: { width: 150, height: 46 },
          });
        }
      }

      worksheet.mergeCells(1, titleStartColumn, 1, lastColumnIndex);
      worksheet.getCell(1, titleStartColumn).value = exportTemplate.title;
      worksheet.getCell(1, titleStartColumn).font = { size: 16, bold: true, color: { argb: `FF${stripHexHash(exportTemplate.titleColor)}` } };
      worksheet.getCell(1, titleStartColumn).alignment = { vertical: 'middle', horizontal: 'left' };
      worksheet.getRow(1).height = 24;

      worksheet.mergeCells(2, titleStartColumn, 2, lastColumnIndex);
      worksheet.getCell(2, titleStartColumn).value = exportTemplate.introText;
      worksheet.getCell(2, titleStartColumn).font = { size: 11, color: { argb: `FF${stripHexHash(exportTemplate.introColor)}` } };
      worksheet.getCell(2, titleStartColumn).alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
      worksheet.getRow(2).height = exportTemplate.introText ? 36 : 18;

      const headerRowIndex = 4;
      const headerRow = worksheet.getRow(headerRowIndex);
      selectedColumns.forEach((column, index) => {
        const cell = headerRow.getCell(index + 1);
        cell.value = column.label;
        cell.font = { bold: true, color: { argb: `FF${stripHexHash(exportTemplate.headerTextColor)}` } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: `FF${stripHexHash(exportTemplate.headerBackgroundColor)}` },
        };
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          right: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        };
      });
      headerRow.height = 22;

      exportData.forEach((rowData) => {
        const row = worksheet.addRow(selectedColumns.map((column) => rowData[column.label] ?? ''));
        row.eachCell((cell) => {
          cell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
            left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
            bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
            right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          };
        });
      });

      worksheet.columns = selectedColumns.map((column) => {
        const maxContentLength = Math.max(
          column.label.length,
          ...exportData.map((row) => String(row[column.label] ?? '').length),
          12,
        );
        return {
          width: Math.min(Math.max(maxContentLength + 2, 14), 38),
        };
      });

      worksheet.views = [{ state: 'frozen', ySplit: headerRowIndex }];
      worksheet.autoFilter = {
        from: { row: headerRowIndex, column: 1 },
        to: { row: headerRowIndex, column: lastColumnIndex },
      };

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob(
        [buffer],
        { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
      );
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${filename}_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setIsDialogOpen(false);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setIsDialogOpen(true)} className="gap-2">
        <Download className="h-4 w-4" />
        Export Excel
      </Button>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-2xl">
          <DialogHeader>
            <DialogTitle>Export opportunity columns</DialogTitle>
            <DialogDescription>
              Choose which columns to export for the current filtered result set. {exportableData.length} row{exportableData.length === 1 ? '' : 's'} will be included.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
              Export template:
              {' '}
              <span className="font-medium text-foreground">{exportTemplate.title}</span>
              {' · '}
              Sheet
              {' '}
              <span className="font-medium text-foreground">{getWorksheetSafeName(exportTemplate.sheetName)}</span>
            </div>

            <div className="flex items-center justify-between gap-4 rounded-md border p-3">
              <div className="space-y-1">
                <p className="text-sm font-medium">Include converted EOI duplicates</p>
                <p className="text-xs text-muted-foreground">
                  Turn this on to export both `_EOI` rows and their converted tender rows.
                </p>
              </div>
              <Switch
                checked={includeConvertedEoiDuplicates}
                onCheckedChange={setIncludeConvertedEoiDuplicates}
                aria-label="Include converted EOI duplicates"
              />
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                {selectedColumnIds.length} of {columns.length} columns selected
              </p>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setSelectedColumnIds(columns.map((column) => column.id))}>
                  Select all
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setSelectedColumnIds([])}>
                  Clear all
                </Button>
              </div>
            </div>

            <div className="max-h-[50vh] overflow-y-auto pr-1">
              <div className="grid gap-3 sm:grid-cols-2">
                {columns.map((column) => {
                  const checked = selectedColumnIds.includes(column.id);
                  return (
                    <div
                      key={column.id}
                      className="flex items-start gap-3 rounded-md border p-3 text-sm transition-colors hover:bg-muted/40"
                    >
                      <Checkbox
                        id={`export-column-${column.id}`}
                        checked={checked}
                        onCheckedChange={(nextChecked) => {
                          setSelectedColumnIds((current) => (
                            nextChecked
                              ? Array.from(new Set([...current, column.id]))
                              : current.filter((id) => id !== column.id)
                          ));
                        }}
                      />
                      <Label htmlFor={`export-column-${column.id}`} className="cursor-pointer leading-5">
                        {column.label}
                      </Label>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleExport} disabled={!exportableData.length || !selectedColumnIds.length || isExporting}>
              {isExporting ? 'Exporting...' : 'Export selected columns'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
