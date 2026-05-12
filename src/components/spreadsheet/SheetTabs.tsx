import { useSpreadsheet } from "@/lib/spreadsheet/store";
import { Plus, X } from "lucide-react";
import { useState } from "react";

export function SheetTabs() {
  const sheets = useSpreadsheet((s) => s.workbook.sheets);
  const activeId = useSpreadsheet((s) => s.workbook.activeSheetId);
  const setActiveSheet = useSpreadsheet((s) => s.setActiveSheet);
  const addSheet = useSpreadsheet((s) => s.addSheet);
  const removeSheet = useSpreadsheet((s) => s.removeSheet);
  const renameSheet = useSpreadsheet((s) => s.renameSheet);

  const [editing, setEditing] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-1 border-t bg-toolbar px-2 py-1">
      <button
        onClick={addSheet}
        className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
        title="New sheet"
        type="button"
      >
        <Plus className="h-4 w-4" />
      </button>
      <div className="mx-1 h-5 w-px bg-border" />
      {sheets.map((s) => {
        const active = s.id === activeId;
        return (
          <div
            key={s.id}
            className={`group flex items-center gap-1 rounded-t px-3 py-1 text-xs cursor-pointer ${active ? "bg-background border-t border-x text-foreground font-medium relative -mb-px" : "text-muted-foreground hover:bg-muted/60"}`}
            onClick={() => setActiveSheet(s.id)}
            onDoubleClick={() => setEditing(s.id)}
          >
            {editing === s.id ? (
              <input
                autoFocus
                defaultValue={s.name}
                className="h-5 w-24 bg-transparent text-xs outline-none border-b border-primary"
                onBlur={(e) => { renameSheet(s.id, e.target.value || s.name); setEditing(null); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  if (e.key === "Escape") setEditing(null);
                }}
              />
            ) : (
              <span>{s.name}</span>
            )}
            {active && sheets.length > 1 && (
              <button
                onClick={(e) => { e.stopPropagation(); removeSheet(s.id); }}
                className="ml-1 opacity-0 group-hover:opacity-100 hover:text-destructive"
                type="button"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

