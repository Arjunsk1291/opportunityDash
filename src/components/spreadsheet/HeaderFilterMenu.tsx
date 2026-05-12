import { useState } from "react";
import { ArrowDownAZ, ArrowUpAZ, Filter, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useSpreadsheet } from "@/lib/spreadsheet/store";

export function HeaderFilterMenu({ col }: { col: number }) {
  const sortByColumn = useSpreadsheet((s) => s.sortByColumn);
  const setFilter = useSpreadsheet((s) => s.setFilter);
  const filters = useSpreadsheet((s) => s.workbook.sheets.find((x) => x.id === s.workbook.activeSheetId)!.filters);
  const sort = useSpreadsheet((s) => s.workbook.sheets.find((x) => x.id === s.workbook.activeSheetId)!.sort);
  const existing = filters.find((f) => f.column === col)?.query || "";
  const [q, setQ] = useState(existing);
  const [open, setOpen] = useState(false);
  const active = !!existing || sort?.column === col;

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setQ(existing); }}>
      <PopoverTrigger asChild>
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); setOpen(true); }}
          className={`inline-flex h-4 w-4 items-center justify-center rounded-sm transition-opacity ${active ? "opacity-100 text-primary" : "opacity-40 hover:opacity-100"}`}
          title="Sort & filter"
          type="button"
        >
          <Filter className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-1.5 text-xs" onMouseDown={(e) => e.stopPropagation()}>
        <button
          onClick={() => { sortByColumn(col, "asc"); setOpen(false); }}
          className="flex w-full items-center gap-2 rounded px-2 py-1.5 hover:bg-muted"
          type="button"
        >
          <ArrowDownAZ className="h-3.5 w-3.5" /> Sort A → Z
        </button>
        <button
          onClick={() => { sortByColumn(col, "desc"); setOpen(false); }}
          className="flex w-full items-center gap-2 rounded px-2 py-1.5 hover:bg-muted"
          type="button"
        >
          <ArrowUpAZ className="h-3.5 w-3.5" /> Sort Z → A
        </button>
        <div className="my-1 h-px bg-border" />
        <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">Filter contains</div>
        <div className="flex items-center gap-1 px-1">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { setFilter(col, q); setOpen(false); } }}
            placeholder="Search…"
            className="h-7 flex-1 rounded border px-2 text-xs outline-none focus:ring-1 focus:ring-primary"
          />
          {existing && (
            <button
              onClick={() => { setFilter(col, ""); setQ(""); setOpen(false); }}
              className="inline-flex h-7 w-7 items-center justify-center rounded hover:bg-muted text-muted-foreground"
              title="Clear filter"
              type="button"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="mt-1 flex justify-end gap-1 px-1">
          <button
            onClick={() => { setFilter(col, ""); setOpen(false); }}
            className="rounded px-2 py-1 text-[11px] hover:bg-muted"
            type="button"
          >Clear</button>
          <button
            onClick={() => { setFilter(col, q); setOpen(false); }}
            className="rounded bg-primary px-2 py-1 text-[11px] text-primary-foreground hover:opacity-90"
            type="button"
          >Apply</button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

