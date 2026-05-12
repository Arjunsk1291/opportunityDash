import { Toolbar } from "./Toolbar";
import { FormulaBar } from "./FormulaBar";
import { Grid } from "./Grid";
import { SheetTabs } from "./SheetTabs";
import { useSpreadsheet } from "@/lib/spreadsheet/store";
import { normalizeRange } from "@/lib/spreadsheet/utils";
import { evaluateCell } from "@/lib/spreadsheet/formula";
import { useMemo } from "react";

function StatusBar() {
  const sel = useSpreadsheet((s) => s.selection);
  const sheet = useSpreadsheet((s) => s.workbook.sheets.find((x) => x.id === s.workbook.activeSheetId)!);
  const stats = useMemo(() => {
    const { r1, r2, c1, c2 } = normalizeRange(sel.anchor, sel.focus);
    const nums: number[] = [];
    let count = 0;
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        const cell = sheet.cells[`${r},${c}`];
        if (!cell) continue;
        count++;
        let v: unknown = cell.value;
        if (cell.value.startsWith("=")) v = evaluateCell(r, c, sheet.cells).value;
        const n = parseFloat(String(v ?? ""));
        if (!isNaN(n)) nums.push(n);
      }
    }
    const sum = nums.reduce((a, b) => a + b, 0);
    const avg = nums.length ? sum / nums.length : 0;
    return { count, sum, avg, n: nums.length };
  }, [sel, sheet.cells]);

  const isMulti = sel.anchor.r !== sel.focus.r || sel.anchor.c !== sel.focus.c;
  return (
    <div className="flex items-center justify-between border-t bg-toolbar px-3 py-1 text-[11px] text-muted-foreground">
      <div>{isMulti ? `${stats.count} cell${stats.count !== 1 ? "s" : ""} selected` : "Ready"}</div>
      {stats.n > 0 && (
        <div className="flex gap-4 font-mono">
          <span>Sum: {stats.sum.toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>
          <span>Avg: {stats.avg.toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>
          <span>Count: {stats.n}</span>
        </div>
      )}
    </div>
  );
}

export function Spreadsheet() {
  return (
    <div className="flex h-[calc(100vh-18rem)] min-h-0 flex-col bg-background border rounded-md overflow-hidden">
      <header className="flex items-center justify-between border-b bg-background px-4 py-2">
        <div className="flex items-center gap-3">
          <div className="flex h-7 w-7 items-center justify-center rounded bg-primary text-primary-foreground font-bold text-sm">G</div>
          <div>
            <h1 className="text-sm font-semibold leading-none">AVENIR — Master Tender List</h1>
            <p className="text-[10px] text-muted-foreground mt-0.5">Backend-synced · Autosave coming next</p>
          </div>
        </div>
        <div className="text-[11px] text-muted-foreground">Grid · v2</div>
      </header>
      <Toolbar />
      <FormulaBar />
      <Grid />
      <StatusBar />
      <SheetTabs />
    </div>
  );
}

