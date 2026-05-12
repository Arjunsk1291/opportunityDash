import { useSpreadsheet } from "@/lib/spreadsheet/store";
import { a1, cellKey } from "@/lib/spreadsheet/utils";
import { useEffect, useState } from "react";

export function FormulaBar() {
  const selection = useSpreadsheet((s) => s.selection);
  const editing = useSpreadsheet((s) => s.editing);
  const sheet = useSpreadsheet((s) => s.workbook.sheets.find((x) => x.id === s.workbook.activeSheetId)!);
  const startEdit = useSpreadsheet((s) => s.startEdit);
  const updateEdit = useSpreadsheet((s) => s.updateEdit);
  const commitEdit = useSpreadsheet((s) => s.commitEdit);

  const r = selection.focus.r;
  const c = selection.focus.c;
  const cell = sheet.cells[cellKey(r, c)];
  const display = editing && editing.r === r && editing.c === c ? editing.value : (cell?.value || "");
  const [local, setLocal] = useState(display);

  useEffect(() => { setLocal(display); }, [display, r, c]);

  return (
    <div className="flex items-center gap-2 border-b bg-background px-2 py-1">
      <div className="flex h-7 min-w-[60px] items-center justify-center rounded border bg-muted px-2 text-xs font-mono font-medium text-muted-foreground">
        {a1(r, c)}
      </div>
      <div className="flex h-7 w-7 items-center justify-center text-muted-foreground italic font-serif text-sm border-r pr-2">fx</div>
      <input
        className="h-7 flex-1 bg-transparent px-1 text-sm outline-none font-mono"
        value={editing ? editing.value : local}
        onFocus={() => { if (!editing) startEdit(r, c); }}
        onChange={(e) => {
          if (!editing) startEdit(r, c, e.target.value);
          else updateEdit(e.target.value);
          setLocal(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commitEdit({ dr: 1, dc: 0 }); (e.target as HTMLInputElement).blur(); }
          else if (e.key === "Escape") { useSpreadsheet.getState().cancelEdit(); (e.target as HTMLInputElement).blur(); }
        }}
      />
    </div>
  );
}

