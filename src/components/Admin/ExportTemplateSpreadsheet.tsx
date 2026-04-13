import { useEffect, useMemo, useRef } from 'react';
import jspreadsheet from 'jspreadsheet-ce';
import 'jspreadsheet-ce/dist/jspreadsheet.css';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import type { ExportTemplateConfig } from '@/lib/exportTemplate';

const GRID_COLUMNS = 12;
const GRID_ROWS = 24;

const TITLE_MARKER = '[[TITLE]]';
const INTRO_MARKER = '[[INTRO]]';
const LOGO_MARKER = '[[LOGO]]';
const HEADER_MARKER = '[[HEADER]]';

type MarkerPosition = { row: number; column: number };

const columnName = (index: number) => {
  let value = index + 1;
  let name = '';
  while (value > 0) {
    const mod = (value - 1) % 26;
    name = String.fromCharCode(65 + mod) + name;
    value = Math.floor((value - mod) / 26);
  }
  return name;
};

const buildGrid = (template: ExportTemplateConfig, previewHeaders: string[]) => {
  const data = Array.from({ length: GRID_ROWS }, () => Array.from({ length: GRID_COLUMNS }, () => ''));
  const mergeCells: Record<string, [number, number]> = {};

  const placeMarker = (row: number, column: number, marker: string) => {
    if (row < 1 || column < 1) return;
    if (row > GRID_ROWS || column > GRID_COLUMNS) return;
    data[row - 1][column - 1] = marker;
  };

  placeMarker(template.titleRow, template.titleColumn, TITLE_MARKER);
  if (template.titleColumnSpan > 1 || template.titleRowSpan > 1) {
    mergeCells[`${columnName(template.titleColumn - 1)}${template.titleRow}`] = [
      Math.max(template.titleColumnSpan, 1),
      Math.max(template.titleRowSpan, 1),
    ];
  }

  placeMarker(template.introRow, template.introColumn, INTRO_MARKER);
  if (template.introColumnSpan > 1 || template.introRowSpan > 1) {
    mergeCells[`${columnName(template.introColumn - 1)}${template.introRow}`] = [
      Math.max(template.introColumnSpan, 1),
      Math.max(template.introRowSpan, 1),
    ];
  }

  if (template.showLogo) {
    placeMarker(template.logoRow, template.logoColumn, LOGO_MARKER);
  }

  placeMarker(template.headerRow, template.headerColumn, HEADER_MARKER);
  const headerRowIndex = template.headerRow - 1;
  if (headerRowIndex >= 0 && headerRowIndex < GRID_ROWS) {
    previewHeaders.forEach((label, index) => {
      const columnIndex = template.headerColumn - 1 + index;
      if (columnIndex >= 0 && columnIndex < GRID_COLUMNS) {
        data[headerRowIndex][columnIndex] = data[headerRowIndex][columnIndex] || label;
      }
    });
  }

  return { data, mergeCells };
};

const findMarker = (data: string[][], marker: string): MarkerPosition | null => {
  for (let rowIndex = 0; rowIndex < data.length; rowIndex += 1) {
    const row = data[rowIndex] || [];
    for (let columnIndex = 0; columnIndex < row.length; columnIndex += 1) {
      if (String(row[columnIndex] || '').trim() === marker) {
        return { row: rowIndex + 1, column: columnIndex + 1 };
      }
    }
  }
  return null;
};

const getMergeMap = (instance: any): Record<string, [number, number]> => {
  if (!instance) return {};
  if (typeof instance.getMerge === 'function') return instance.getMerge() || {};
  if (typeof instance.getMerged === 'function') return instance.getMerged() || {};
  if (instance.options?.mergeCells) return instance.options.mergeCells;
  if (typeof instance.getConfig === 'function') return instance.getConfig()?.mergeCells || {};
  return {};
};

type ExportTemplateSpreadsheetProps = {
  exportTemplate: ExportTemplateConfig;
  onTemplateChange: (next: ExportTemplateConfig) => void;
  canEdit: boolean;
  previewHeaders: string[];
};

export function ExportTemplateSpreadsheet({
  exportTemplate,
  onTemplateChange,
  canEdit,
  previewHeaders,
}: ExportTemplateSpreadsheetProps) {
  const spreadsheetRef = useRef<HTMLDivElement | null>(null);
  const instanceRef = useRef<any>(null);

  const { data, mergeCells } = useMemo(
    () => buildGrid(exportTemplate, previewHeaders),
    [exportTemplate, previewHeaders],
  );

  useEffect(() => {
    if (!spreadsheetRef.current) return;

    if (instanceRef.current?.destroy) {
      instanceRef.current.destroy();
    }

    instanceRef.current = jspreadsheet(spreadsheetRef.current, {
      data,
      minDimensions: [GRID_COLUMNS, GRID_ROWS],
      columns: Array.from({ length: GRID_COLUMNS }, () => ({ type: 'text' })),
      columnDrag: false,
      rowDrag: false,
      allowInsertRow: false,
      allowInsertColumn: false,
      allowDeleteRow: false,
      allowDeleteColumn: false,
      allowComments: true,
      mergeCells,
      defaultColWidth: 96,
      defaultRowHeight: 28,
      tableOverflow: true,
      tableWidth: '100%',
      tableHeight: '560px',
      editable: canEdit,
    });

    return () => {
      if (instanceRef.current?.destroy) {
        instanceRef.current.destroy();
        instanceRef.current = null;
      }
    };
  }, [data, mergeCells, canEdit]);

  const applyLayout = () => {
    const instance = instanceRef.current;
    if (!instance) return;
    const sheetData = instance.getData?.() as string[][] | undefined;
    if (!sheetData) return;

    const merges = getMergeMap(instance);

    const title = findMarker(sheetData, TITLE_MARKER);
    const intro = findMarker(sheetData, INTRO_MARKER);
    const logo = exportTemplate.showLogo ? findMarker(sheetData, LOGO_MARKER) : null;
    const header = findMarker(sheetData, HEADER_MARKER);

    if (!title) {
      toast.error('Place a [[TITLE]] marker cell to set the title position.');
      return;
    }
    if (!intro) {
      toast.error('Place a [[INTRO]] marker cell to set the intro position.');
      return;
    }
    if (exportTemplate.showLogo && !logo) {
      toast.error('Place a [[LOGO]] marker cell to set the logo position.');
      return;
    }
    if (!header) {
      toast.error('Place a [[HEADER]] marker cell to set the header start.');
      return;
    }

    const titleKey = `${columnName(title.column - 1)}${title.row}`;
    const introKey = `${columnName(intro.column - 1)}${intro.row}`;
    const titleMerge = merges[titleKey] || [1, 1];
    const introMerge = merges[introKey] || [1, 1];

    const next: ExportTemplateConfig = {
      ...exportTemplate,
      titleRow: title.row,
      titleColumn: title.column,
      titleColumnSpan: Math.max(titleMerge[0], 1),
      titleRowSpan: Math.max(titleMerge[1], 1),
      introRow: intro.row,
      introColumn: intro.column,
      introColumnSpan: Math.max(introMerge[0], 1),
      introRowSpan: Math.max(introMerge[1], 1),
      headerRow: header.row,
      headerColumn: header.column,
    };

    if (exportTemplate.showLogo && logo) {
      next.logoRow = logo.row;
      next.logoColumn = logo.column;
    }

    onTemplateChange(next);
    toast.success('Spreadsheet layout applied to template.');
  };

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
        Drag cells, resize columns, and merge blocks directly. Move the marker cells to control where template blocks start.
        {' '}
        Use:
        {' '}
        <span className="font-semibold">[[TITLE]]</span>
        {' '}
        <span className="font-semibold">[[INTRO]]</span>
        {' '}
        <span className="font-semibold">[[LOGO]]</span>
        {' '}
        <span className="font-semibold">[[HEADER]]</span>
      </div>
      <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        <div className="border-b bg-slate-50 px-4 py-3 text-xs font-medium text-slate-500">
          Sheet:
          {' '}
          {exportTemplate.sheetName}
        </div>
        <div className="p-3">
          <div ref={spreadsheetRef} />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={applyLayout} disabled={!canEdit}>
          Apply layout to template
        </Button>
        <Button type="button" variant="outline" onClick={() => onTemplateChange({ ...exportTemplate })} disabled={!canEdit}>
          Reset from template
        </Button>
      </div>
    </div>
  );
}
