import { useSpreadsheet } from "@/lib/spreadsheet/store";
import {
  Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight,
  Undo2, Redo2, Scissors, Copy, ClipboardPaste, Trash2,
  ArrowDownAZ, ArrowUpAZ, Filter, FilterX,
  Snowflake, EyeOff, Eye, Plus, Download, Upload, Sigma,
  Paintbrush,
} from "lucide-react";
import { useRef } from "react";
import { normalizeRange } from "@/lib/spreadsheet/utils";
import { downloadWorkbook } from "@/lib/excelWorkbook";

function ToolBtn({ children, onClick, title, active }: { children: React.ReactNode; onClick: () => void; title: string; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`inline-flex h-7 w-7 items-center justify-center rounded text-foreground/80 hover:bg-muted ${active ? "bg-muted text-foreground" : ""}`}
      type="button"
    >
      {children}
    </button>
  );
}

const Sep = () => <div className="mx-1 h-5 w-px bg-border" />;

export function Toolbar() {
  const undo = useSpreadsheet((s) => s.undo);
  const redo = useSpreadsheet((s) => s.redo);
  const copySelection = useSpreadsheet((s) => s.copySelection);
  const clearSelection = useSpreadsheet((s) => s.clearSelection);
  const applyFormat = useSpreadsheet((s) => s.applyFormatToSelection);
  const sortByColumn = useSpreadsheet((s) => s.sortByColumn);
  const setFilter = useSpreadsheet((s) => s.setFilter);
  const clearFilters = useSpreadsheet((s) => s.clearFilters);
  const freezeTopRow = useSpreadsheet((s) => s.freezeTopRow);
  const freezeFirstCol = useSpreadsheet((s) => s.freezeFirstCol);
  const hideRows = useSpreadsheet((s) => s.hideRows);
  const unhideAllRows = useSpreadsheet((s) => s.unhideAllRows);
  const unhideAllCols = useSpreadsheet((s) => s.unhideAllCols);
  const insertRow = useSpreadsheet((s) => s.insertRow);
  const importCSV = useSpreadsheet((s) => s.importCSV);
  const exportCSV = useSpreadsheet((s) => s.exportCSV);
  const setCell = useSpreadsheet((s) => s.setCell);
  const startPainter = useSpreadsheet((s) => s.startFormatPainter);
  const stopPainter = useSpreadsheet((s) => s.stopFormatPainter);
  const painter = useSpreadsheet((s) => s.formatPainter);
  const selection = useSpreadsheet((s) => s.selection);

  const fileRef = useRef<HTMLInputElement>(null);
  const sel = normalizeRange(selection.anchor, selection.focus);

  const downloadCSV = () => {
    const csv = exportCSV();
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "sheet.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const downloadXlsx = async () => {
    const state = useSpreadsheet.getState();
    const wbState = state.workbook;
    const active = wbState.sheets.find((s) => s.id === wbState.activeSheetId) || wbState.sheets[0];
    const ExcelJS = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet(active?.name || "Sheet1");

    const toExcelFill = (hex?: string) => {
      if (!hex) return undefined;
      const raw = String(hex).replace("#", "").toUpperCase();
      const argb = raw.length === 6 ? `FF${raw}` : raw;
      return { type: "pattern", pattern: "solid", fgColor: { argb } } as const;
    };
    const toExcelColor = (hex?: string) => {
      if (!hex) return undefined;
      const raw = String(hex).replace("#", "").toUpperCase();
      const argb = raw.length === 6 ? `FF${raw}` : raw;
      return { argb } as const;
    };

    // widths/heights
    for (let c = 0; c < active.colCount; c++) {
      const px = active.colWidths?.[c] ?? 100;
      ws.getColumn(c + 1).width = Math.max(4, Math.round(Number(px) / 7));
    }
    for (let r = 0; r < active.rowCount; r++) {
      const px = active.rowHeights?.[r] ?? 24;
      ws.getRow(r + 1).height = Math.max(12, Math.round(Number(px) / 1.33));
    }

    for (let r = 0; r < active.rowCount; r++) {
      if (active.hiddenRows?.[r]) continue;
      for (let c = 0; c < active.colCount; c++) {
        if (active.hiddenCols?.[c]) continue;
        const key = `${r},${c}`;
        const cell = active.cells?.[key];
        if (!cell) continue;
        const out = ws.getCell(r + 1, c + 1);
        const text = String(cell.value ?? "");
        out.value = text.startsWith("=") ? { formula: text.slice(1) } : text;
        const fmt = cell.format || {};
        if (fmt.bg) out.fill = toExcelFill(fmt.bg) as any;
        out.font = {
          name: "Calibri",
          size: 13,
          bold: Boolean(fmt.bold),
          italic: Boolean(fmt.italic),
          underline: fmt.underline ? "single" : undefined,
          color: toExcelColor(fmt.color) as any,
        } as any;
        out.alignment = {
          horizontal: fmt.align || undefined,
          vertical: "middle",
          wrapText: Boolean(fmt.wrap),
        } as any;
      }
    }

    (active.merges || []).forEach((m) => {
      try { ws.mergeCells(m.r1 + 1, m.c1 + 1, m.r2 + 1, m.c2 + 1); } catch { /* ignore */ }
    });

    await downloadWorkbook(workbook as any, `${String(active?.name || "sheet").replace(/[^\w\- ]+/g, "")}.xlsx`);
  };

  const insertSum = () => {
    const r = selection.focus.r;
    const c = selection.focus.c;
    if (r > 0) {
      const start = `${String.fromCharCode(65 + c)}1`;
      const end = `${String.fromCharCode(65 + c)}${r}`;
      setCell(r, c, `=SUM(${start}:${end})`);
    }
  };

  const filterPrompt = () => {
    const q = window.prompt("Filter column by text (leave empty to clear):", "");
    if (q === null) return;
    setFilter(sel.c1, q);
  };

  return (
    <div className="flex items-center gap-0.5 border-b bg-toolbar px-2 py-1.5">
      <ToolBtn onClick={undo} title="Undo (Ctrl+Z)"><Undo2 className="h-4 w-4" /></ToolBtn>
      <ToolBtn onClick={redo} title="Redo (Ctrl+Y)"><Redo2 className="h-4 w-4" /></ToolBtn>
      <Sep />
      <ToolBtn onClick={() => copySelection(true)} title="Cut"><Scissors className="h-4 w-4" /></ToolBtn>
      <ToolBtn onClick={() => copySelection(false)} title="Copy"><Copy className="h-4 w-4" /></ToolBtn>
      <ToolBtn onClick={async () => {
        try {
          const text = await navigator.clipboard.readText();
          useSpreadsheet.getState().pastePlain(sel.r1, sel.c1, text);
        } catch { /* ignore */ }
      }} title="Paste"><ClipboardPaste className="h-4 w-4" /></ToolBtn>
      <ToolBtn onClick={clearSelection} title="Clear"><Trash2 className="h-4 w-4" /></ToolBtn>
      <Sep />
      <ToolBtn onClick={() => applyFormat({ bold: true })} title="Bold"><Bold className="h-4 w-4" /></ToolBtn>
      <ToolBtn onClick={() => applyFormat({ italic: true })} title="Italic"><Italic className="h-4 w-4" /></ToolBtn>
      <ToolBtn onClick={() => applyFormat({ underline: true })} title="Underline"><Underline className="h-4 w-4" /></ToolBtn>
      <Sep />
      <ToolBtn onClick={() => applyFormat({ align: "left" })} title="Align left"><AlignLeft className="h-4 w-4" /></ToolBtn>
      <ToolBtn onClick={() => applyFormat({ align: "center" })} title="Align center"><AlignCenter className="h-4 w-4" /></ToolBtn>
      <ToolBtn onClick={() => applyFormat({ align: "right" })} title="Align right"><AlignRight className="h-4 w-4" /></ToolBtn>
      <Sep />
      <ToolBtn onClick={insertSum} title="Sum"><Sigma className="h-4 w-4" /></ToolBtn>
      <ToolBtn onClick={() => sortByColumn(sel.c1, "asc")} title="Sort A→Z"><ArrowDownAZ className="h-4 w-4" /></ToolBtn>
      <ToolBtn onClick={() => sortByColumn(sel.c1, "desc")} title="Sort Z→A"><ArrowUpAZ className="h-4 w-4" /></ToolBtn>
      <ToolBtn onClick={filterPrompt} title="Filter column"><Filter className="h-4 w-4" /></ToolBtn>
      <ToolBtn onClick={clearFilters} title="Clear filters"><FilterX className="h-4 w-4" /></ToolBtn>
      <Sep />
      <button
        type="button"
        onClick={() => { if (painter) stopPainter(); else startPainter(false); }}
        onDoubleClick={() => { startPainter(true); }}
        title="Format painter (click to apply once, double-click to lock, Esc to release)"
        className={`inline-flex h-7 w-7 items-center justify-center rounded text-foreground/80 hover:bg-muted ${painter ? "bg-muted text-foreground" : ""}`}
      >
        <Paintbrush className="h-4 w-4" />
      </button>
      <ToolBtn onClick={freezeTopRow} title="Freeze top row"><Snowflake className="h-4 w-4" /></ToolBtn>
      <ToolBtn onClick={freezeFirstCol} title="Freeze first column"><Snowflake className="h-4 w-4 -rotate-90" /></ToolBtn>
      <Sep />
      <ToolBtn onClick={() => insertRow(sel.r1, "above")} title="Insert row"><Plus className="h-4 w-4" /></ToolBtn>
      <ToolBtn onClick={() => hideRows(sel.r1, sel.r2)} title="Hide rows"><EyeOff className="h-4 w-4" /></ToolBtn>
      <ToolBtn onClick={() => { unhideAllRows(); unhideAllCols(); }} title="Unhide all"><Eye className="h-4 w-4" /></ToolBtn>
      <Sep />
      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          const text = await f.text();
          importCSV(text);
          e.target.value = "";
        }}
      />
      <ToolBtn onClick={() => fileRef.current?.click()} title="Import CSV"><Upload className="h-4 w-4" /></ToolBtn>
      <ToolBtn onClick={downloadCSV} title="Export CSV"><Download className="h-4 w-4" /></ToolBtn>
      <ToolBtn onClick={() => { void downloadXlsx(); }} title="Export XLSX"><Download className="h-4 w-4" /></ToolBtn>
    </div>
  );
}
