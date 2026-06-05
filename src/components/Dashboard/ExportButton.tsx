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
import { getDisplayStatus } from '@/lib/opportunityStatus';
import { useAuth } from '@/contexts/AuthContext';
import defaultExportLogo from '@/assets/avenir-logo.png';
import { DEFAULT_EXPORT_TEMPLATE, ExportTemplateConfig, normalizeExportTemplate } from '@/lib/exportTemplate';
import { toast } from 'sonner';
import { OPPORTUNITY_COLUMNS } from '@/lib/opportunities/columns';
import { ROW_GDS, ROW_GES, STATUS_LOST, STATUS_WON, TENDER_FLAG_LOST } from '@/lib/opportunities/colors';

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

const getPercentFraction = (value: unknown) => {
  const parsed = Number(String(value ?? '').replace(/%/g, '').trim());
  if (!Number.isFinite(parsed)) return 0;
  return parsed > 1 ? parsed / 100 : parsed;
};

const getOpportunityColumnValue = (opp: Opportunity, columnKey: string, index: number) => {
  const header = String(columnKey || '').trim();
  switch (header) {
    case 'Sr.no':
      return index + 1;
    case 'rawSheetYear':
      return String(opp.rawSheetYear || opp.rawGraphData?.year || '').trim();
    case 'opportunityRefNo':
      return getExportRefNo(opp);
    case 'tenderName':
      return opp.tenderName || '';
    case 'clientName':
      return opp.clientName || '';
    case 'END USER':
      return getSnapshotValue(opp, ['END USER']);
    case 'adnocRftNo':
      return getAdnocRftNo(opp);
    case 'Tender Location (Execution)':
      return getSnapshotValue(opp, ['Tender Location (Execution)']);
    case 'groupClassification':
      return opp.groupClassification || '';
    case 'internalLead':
      return opp.internalLead || '';
    case 'Stage of project, Concept, FEED, DE':
      return getSnapshotValue(opp, ['Stage of project, Concept, FEED, DE']);
    case 'opportunityClassification':
      return opp.opportunityClassification || '';
    case 'dateTenderReceived':
      return getRfpReceivedDisplay(opp);
    case 'BID / NO BID DECISION':
      return getSnapshotValue(opp, ['BID / NO BID DECISION']);
    case 'tenderPlannedSubmissionDate':
      return getSubmissionDisplay(opp);
    case 'tenderSubmittedDate':
      return opp.tenderSubmittedDate || getSnapshotValue(opp, ['Tender  Submitted  date', 'Tender Submitted date']);
    case 'avenirStatus':
      return opp.avenirStatus || '';
    case 'remarksReason':
      return opp.remarksReason || '';
    case 'tenderResult':
      return opp.tenderResult || getSnapshotValue(opp, ['TENDER RESULT']);
    case 'tenderStatusRemark':
      return opp.tenderStatusRemark || getSnapshotValue(opp, ['TENDER STATUS', 'TENDER STATUS -']);
    case 'Currency, USD/AED':
      return getSnapshotValue(opp, ['Currency, USD/AED']);
    case 'GM%':
      return getPercentFraction(getSnapshotValue(opp, ['GM%']));
    case 'opportunityValue':
      return opp.opportunityValue ?? '';
    case 'Sub-contract value':
      return getSnapshotValue(opp, ['Sub-contract value']);
    case 'GM Value': {
      const tenderValue = Number(opp.opportunityValue || 0);
      return tenderValue * getPercentFraction(getSnapshotValue(opp, ['GM%']));
    }
    case 'Go%':
      return getPercentFraction(getSnapshotValue(opp, ['Go%']));
    case 'Get %':
      return getPercentFraction(getSnapshotValue(opp, ['Get %']));
    case 'GO/Get %': {
      const go = getPercentFraction(getSnapshotValue(opp, ['Go%']));
      const get = getPercentFraction(getSnapshotValue(opp, ['Get %']));
      return go * get;
    }
    case 'go/get value': {
      const tenderValue = Number(opp.opportunityValue || 0);
      const go = getPercentFraction(getSnapshotValue(opp, ['Go%']));
      const get = getPercentFraction(getSnapshotValue(opp, ['Get %']));
      return tenderValue * go * get;
    }
    case 'USD to AED': {
      const tenderValue = Number(opp.opportunityValue || 0);
      return String(getSnapshotValue(opp, ['Currency, USD/AED'])).toUpperCase() === 'USD' ? tenderValue * 3.67 : tenderValue;
    }
    case 'who was awarded the project':
      return getSnapshotValue(opp, ['who was awarded the project']);
    case 'final awarded price':
      return getSnapshotValue(opp, ['final awarded price']);
    default:
      return getSnapshotValue(opp, [columnKey]);
  }
};

const stripHexHash = (value: string) => value.replace(/^#/, '').toUpperCase();
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const rangesOverlap = (a: [number, number, number, number], b: [number, number, number, number]) => {
  const [aRowStart, aColStart, aRowEnd, aColEnd] = a;
  const [bRowStart, bColStart, bRowEnd, bColEnd] = b;
  return !(aRowEnd < bRowStart || aRowStart > bRowEnd || aColEnd < bColStart || aColStart > bColEnd);
};

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

const mapHorizontalAlign = (value: ExportTemplateConfig['titleHorizontalAlign']) => value;
const mapVerticalAlign = (value: ExportTemplateConfig['titleVerticalAlign']) => value;

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
  const { token } = useAuth();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [includeConvertedEoiDuplicates, setIncludeConvertedEoiDuplicates] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportTemplate, setExportTemplate] = useState<ExportTemplateConfig>(DEFAULT_EXPORT_TEMPLATE);

  const columns = useMemo<ExportColumn[]>(() => (
    OPPORTUNITY_COLUMNS.map((column) => ({
      id: column.key,
      label: column.header,
      getValue: (opp) => getOpportunityColumnValue(opp, column.key, 0),
    }))
  ), []);

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
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          const text = await response.text();
          throw new Error(`Non-JSON response (${response.status}). ${text.slice(0, 80)}`);
        }
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
      const ExcelJSImport = await import('exceljs');
      const ExcelJS = ExcelJSImport.default ?? ExcelJSImport;
      if (!ExcelJS?.Workbook) {
        throw new Error('Excel export engine failed to load.');
      }
      const orderedData = [...exportableData].sort((a, b) => {
        const typeRankDiff = getExportTypeRank(a) - getExportTypeRank(b);
        if (typeRankDiff !== 0) return typeRankDiff;

        const receivedDiff = getExportReceivedTimestamp(b) - getExportReceivedTimestamp(a);
        if (receivedDiff !== 0) return receivedDiff;

        return getExportRefNo(a).localeCompare(getExportRefNo(b));
      });

      const seenSignatures = new Set<string>();
      const exportData = orderedData.reduce<Array<Record<string, string | number | undefined>>>((rows, opp, rowIndex) => {
        const row = {
          __status: getDisplayStatus(opp),
          ...Object.fromEntries(selectedColumns.map((column) => [column.label, getOpportunityColumnValue(opp, column.id, rowIndex)])),
        };
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
      const headerStartColumn = clamp(exportTemplate.headerColumn, 1, 12);
      const headerRowIndex = clamp(exportTemplate.headerRow, 2, 30);
      const titleRowIndex = clamp(exportTemplate.titleRow, 1, Math.max(headerRowIndex - 1, 1));
      const introRowIndex = clamp(exportTemplate.introRow, 1, Math.max(headerRowIndex - 1, 1));
      const titleStartColumn = clamp(exportTemplate.titleColumn, 1, 12);
      const introStartColumn = clamp(exportTemplate.introColumn, 1, 12);
      const titleEndColumn = clamp(titleStartColumn + exportTemplate.titleColumnSpan - 1, titleStartColumn, 12);
      const titleEndRow = clamp(titleRowIndex + exportTemplate.titleRowSpan - 1, titleRowIndex, 20);
      const introEndColumn = clamp(introStartColumn + exportTemplate.introColumnSpan - 1, introStartColumn, 12);
      const introEndRow = clamp(introRowIndex + exportTemplate.introRowSpan - 1, introRowIndex, 24);
      const headerEndColumn = headerStartColumn + selectedColumns.length - 1;
      const mergedRanges: Array<[number, number, number, number]> = [];
      const normalizeRange = (range: [number, number, number, number]) => {
        const [rowStart, colStart, rowEnd, colEnd] = range;
        return [
          Math.min(rowStart, rowEnd),
          Math.min(colStart, colEnd),
          Math.max(rowStart, rowEnd),
          Math.max(colStart, colEnd),
        ] as [number, number, number, number];
      };
      const mergeIfSafe = (range: [number, number, number, number], label: string) => {
        const normalized = normalizeRange(range);
        const overlap = mergedRanges.find((existing) => rangesOverlap(existing, normalized));
        if (overlap) {
          console.warn(`Export merge skipped for ${label}: overlaps existing merge`, { range, overlap });
          toast.warning(`Export layout overlap: ${label} merge skipped.`);
          return false;
        }
        try {
          worksheet.mergeCells(...normalized);
          mergedRanges.push(normalized);
          return true;
        } catch (error) {
          console.warn(`Export merge failed for ${label}:`, error);
          toast.warning(`Export layout merge failed for ${label}.`);
          return false;
        }
      };

      worksheet.columns = Array.from({ length: Math.max(12, headerEndColumn) }, (_unused, index) => ({
        width: clamp(exportTemplate.columnWidths[index] || 18, 12, 60),
      }));
      exportTemplate.rowHeights.forEach((height, index) => {
        worksheet.getRow(index + 1).height = height;
      });

      let logoDataUrl = '';
      if (exportTemplate.showLogo) {
        logoDataUrl = exportTemplate.logoDataUrl || await getDefaultLogoDataUrl();
        if (logoDataUrl) {
          const imageId = workbook.addImage({
            base64: logoDataUrl,
            extension: inferImageExtension(logoDataUrl),
          });
          worksheet.addImage(imageId, {
            tl: { col: clamp(exportTemplate.logoColumn - 1, 0, 11), row: clamp(exportTemplate.logoRow - 1, 0, 19) },
            ext: { width: exportTemplate.logoWidth, height: exportTemplate.logoHeight },
          });
        }
      }

      if (mergeIfSafe([titleRowIndex, titleStartColumn, titleEndRow, titleEndColumn], 'Title')) {
        worksheet.getCell(titleRowIndex, titleStartColumn).value = exportTemplate.title;
        worksheet.getCell(titleRowIndex, titleStartColumn).font = { size: 16, bold: true, color: { argb: `FF${stripHexHash(exportTemplate.titleColor)}` } };
        worksheet.getCell(titleRowIndex, titleStartColumn).alignment = {
          vertical: mapVerticalAlign(exportTemplate.titleVerticalAlign),
          horizontal: mapHorizontalAlign(exportTemplate.titleHorizontalAlign),
          wrapText: true,
        };
      }

      if (exportTemplate.introText) {
        if (mergeIfSafe([introRowIndex, introStartColumn, introEndRow, introEndColumn], 'Intro')) {
          worksheet.getCell(introRowIndex, introStartColumn).value = exportTemplate.introText;
          worksheet.getCell(introRowIndex, introStartColumn).font = { size: 11, color: { argb: `FF${stripHexHash(exportTemplate.introColor)}` } };
          worksheet.getCell(introRowIndex, introStartColumn).alignment = {
            vertical: mapVerticalAlign(exportTemplate.introVerticalAlign),
            horizontal: mapHorizontalAlign(exportTemplate.introHorizontalAlign),
            wrapText: true,
          };
        }
      }

      const headerRow = worksheet.getRow(headerRowIndex);
      selectedColumns.forEach((column, index) => {
        const cell = headerRow.getCell(headerStartColumn + index);
        cell.value = column.label;
        cell.font = { bold: true, color: { argb: `FF${stripHexHash(exportTemplate.headerTextColor)}` } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: `FF${stripHexHash(exportTemplate.headerBackgroundColor)}` },
        };
        cell.alignment = {
          vertical: mapVerticalAlign(exportTemplate.headerVerticalAlign),
          horizontal: mapHorizontalAlign(exportTemplate.headerHorizontalAlign),
          wrapText: true,
        };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          right: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        };
      });
      headerRow.height = 22;

      exportData.forEach((rowData) => {
        const row = worksheet.addRow([]);
        const rowStatus = String(rowData.__status || '').trim().toUpperCase();
        selectedColumns.forEach((column, index) => {
          row.getCell(headerStartColumn + index).value = rowData[column.label] ?? '';
        });
        selectedColumns.forEach((_, index) => {
          const cell = row.getCell(headerStartColumn + index);
          cell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
          const columnLabel = selectedColumns[index].label;
          const rowFill = rowStatus === 'LOST'
            ? STATUS_LOST
            : rowStatus === 'WON' || rowStatus === 'AWARDED'
              ? STATUS_WON
              : '';
          if (columnLabel === 'GDS/GES') {
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: `FF${stripHexHash(String(rowData['GDS/GES'] || '').toUpperCase() === 'GES' ? ROW_GES : ROW_GDS)}` },
            };
          } else if (columnLabel === 'Tender name' && rowStatus === 'LOST') {
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: `FF${stripHexHash(TENDER_FLAG_LOST)}` },
            };
          } else if (rowFill) {
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: `FF${stripHexHash(rowFill)}` },
            };
          }
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
            left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
            bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
            right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          };
          if (selectedColumns[index].label === 'GM%' || selectedColumns[index].label === 'Go%' || selectedColumns[index].label === 'Get %' || selectedColumns[index].label === 'GO/Get %') {
            cell.numFmt = '0.00%';
          } else if (selectedColumns[index].label === 'date tender recd' || selectedColumns[index].label === 'Tender Due  date' || selectedColumns[index].label === 'Tender  Submitted  date') {
            cell.numFmt = 'dd-mmm-yy';
          } else if (selectedColumns[index].label !== 'Sr.no' && selectedColumns[index].label !== 'Year' && selectedColumns[index].label !== 'Tender name' && selectedColumns[index].label !== 'Client' && selectedColumns[index].label !== 'END USER' && selectedColumns[index].label !== 'ADNOC RFT NO' && selectedColumns[index].label !== 'Tender Location (Execution)' && selectedColumns[index].label !== 'GDS/GES' && selectedColumns[index].label !== 'Assigned Person' && selectedColumns[index].label !== 'Stage of project, Concept, FEED, DE' && selectedColumns[index].label !== 'Tender Type' && selectedColumns[index].label !== 'AVENIR STATUS' && selectedColumns[index].label !== 'REMARKS/REASON' && selectedColumns[index].label !== 'TENDER RESULT' && selectedColumns[index].label !== 'TENDER STATUS' && selectedColumns[index].label !== 'Currency, USD/AED' && selectedColumns[index].label !== 'who was awarded the project') {
            cell.numFmt = '#,##0.00';
          } else if (selectedColumns[index].label === 'Tender value' || selectedColumns[index].label === 'Sub-contract value' || selectedColumns[index].label === 'GM Value' || selectedColumns[index].label === 'go/get value' || selectedColumns[index].label === 'USD to AED' || selectedColumns[index].label === 'final awarded price') {
            cell.numFmt = '#,##0.00';
          }
        });
      });

      ['HIT RATIO', 'AS', 'WD'].forEach((sheetName) => {
        workbook.addWorksheet(sheetName);
      });

      worksheet.views = [{ state: 'frozen', ySplit: headerRowIndex }];
      worksheet.autoFilter = {
        from: { row: headerRowIndex, column: headerStartColumn },
        to: { row: headerRowIndex, column: headerEndColumn },
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
    } catch (error) {
      console.error('Export failed:', error);
      toast.error((error as Error)?.message || 'Failed to export Excel file.');
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
            <Button type="button" onClick={handleExport} loading={isExporting} disabled={!exportableData.length || !selectedColumnIds.length}>
              Export selected columns
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
