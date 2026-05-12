import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu";
import { useSpreadsheet } from "@/lib/spreadsheet/store";
import { normalizeRange } from "@/lib/spreadsheet/utils";

export function GridContextMenu({ children }: { children: React.ReactNode }) {
  const selection = useSpreadsheet((s) => s.selection);
  const copySelection = useSpreadsheet((s) => s.copySelection);
  const clearSelection = useSpreadsheet((s) => s.clearSelection);
  const insertRow = useSpreadsheet((s) => s.insertRow);
  const insertCol = useSpreadsheet((s) => s.insertCol);
  const deleteRows = useSpreadsheet((s) => s.deleteRows);
  const deleteCols = useSpreadsheet((s) => s.deleteCols);
  const hideRows = useSpreadsheet((s) => s.hideRows);
  const hideCols = useSpreadsheet((s) => s.hideCols);
  const applyFormat = useSpreadsheet((s) => s.applyFormatToSelection);

  const sel = normalizeRange(selection.anchor, selection.focus);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        <ContextMenuItem onSelect={() => copySelection(true)}>Cut</ContextMenuItem>
        <ContextMenuItem onSelect={() => copySelection(false)}>Copy</ContextMenuItem>
        <ContextMenuItem onSelect={async () => {
          try {
            const text = await navigator.clipboard.readText();
            useSpreadsheet.getState().pastePlain(sel.r1, sel.c1, text);
          } catch { /* ignore */ }
        }}>Paste</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => insertRow(sel.r1, "above")}>Insert row above</ContextMenuItem>
        <ContextMenuItem onSelect={() => insertRow(sel.r2, "below")}>Insert row below</ContextMenuItem>
        <ContextMenuItem onSelect={() => insertCol(sel.c1, "left")}>Insert column left</ContextMenuItem>
        <ContextMenuItem onSelect={() => insertCol(sel.c2, "right")}>Insert column right</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => deleteRows(sel.r1, sel.r2)}>Delete rows</ContextMenuItem>
        <ContextMenuItem onSelect={() => deleteCols(sel.c1, sel.c2)}>Delete columns</ContextMenuItem>
        <ContextMenuItem onSelect={() => hideRows(sel.r1, sel.r2)}>Hide rows</ContextMenuItem>
        <ContextMenuItem onSelect={() => hideCols(sel.c1, sel.c2)}>Hide columns</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => clearSelection()}>Clear contents</ContextMenuItem>
        <ContextMenuItem onSelect={() => applyFormat({ bold: true })}>Bold</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

