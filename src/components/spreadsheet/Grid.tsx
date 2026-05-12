import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useSpreadsheet, getColW, getRowH } from "@/lib/spreadsheet/store";
import { HEADER_HEIGHT, HEADER_WIDTH } from "@/lib/spreadsheet/types";
import { cellKey, colLetter, normalizeRange } from "@/lib/spreadsheet/utils";
import { evaluateCell } from "@/lib/spreadsheet/formula";
import { GridContextMenu } from "./GridContextMenu";
import { HeaderFilterMenu } from "./HeaderFilterMenu";

export function Grid() {
  const workbook = useSpreadsheet((s) => s.workbook);
  const sheet = workbook.sheets.find((s) => s.id === workbook.activeSheetId)!;
  const selection = useSpreadsheet((s) => s.selection);
  const editing = useSpreadsheet((s) => s.editing);

  const setActive = useSpreadsheet((s) => s.setActive);
  const setSelection = useSpreadsheet((s) => s.setSelection);
  const startEdit = useSpreadsheet((s) => s.startEdit);
  const updateEdit = useSpreadsheet((s) => s.updateEdit);
  const commitEdit = useSpreadsheet((s) => s.commitEdit);
  const cancelEdit = useSpreadsheet((s) => s.cancelEdit);
  const moveActive = useSpreadsheet((s) => s.moveActive);
  const setColWidth = useSpreadsheet((s) => s.setColWidth);
  const setRowHeight = useSpreadsheet((s) => s.setRowHeight);
  const copySelection = useSpreadsheet((s) => s.copySelection);
  const pastePlain = useSpreadsheet((s) => s.pastePlain);
  const clearSelection = useSpreadsheet((s) => s.clearSelection);
  const undo = useSpreadsheet((s) => s.undo);
  const redo = useSpreadsheet((s) => s.redo);
  const painter = useSpreadsheet((s) => s.formatPainter);
  const applyPainterCell = useSpreadsheet((s) => s.applyFormatPainterCell);
  const stopPainter = useSpreadsheet((s) => s.stopFormatPainter);
  const ensureTailRows = useSpreadsheet((s) => s.ensureTailRows);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [scroll, setScroll] = useState({ x: 0, y: 0 });
  const [viewport, setViewport] = useState({ w: 0, h: 0 });

  const rowOffsets = useMemo(() => {
    const arr = new Array(sheet.rowCount + 1).fill(0);
    let acc = 0;
    for (let r = 0; r < sheet.rowCount; r++) {
      arr[r] = acc;
      if (!sheet.hiddenRows[r]) acc += getRowH(sheet, r);
    }
    arr[sheet.rowCount] = acc;
    return arr;
  }, [sheet]);

  const colOffsets = useMemo(() => {
    const arr = new Array(sheet.colCount + 1).fill(0);
    let acc = 0;
    for (let c = 0; c < sheet.colCount; c++) {
      arr[c] = acc;
      if (!sheet.hiddenCols[c]) acc += getColW(sheet, c);
    }
    arr[sheet.colCount] = acc;
    return arr;
  }, [sheet]);

  const totalW = colOffsets[sheet.colCount];
  const totalH = rowOffsets[sheet.rowCount];

  const getCellX = useCallback((col: number) => colOffsets[col] || 0, [colOffsets]);
  const getCellY = useCallback((row: number) => rowOffsets[row] || 0, [rowOffsets]);
  const getCellWidth = useCallback((col: number) => getColW(sheet, col), [sheet]);
  const getCellHeight = useCallback((row: number) => getRowH(sheet, row), [sheet]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => setViewport({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const findIdx = (offsets: number[], pos: number, n: number) => {
    let lo = 0, hi = n - 1, ans = 0;
    while (lo <= hi) {
      const m = (lo + hi) >> 1;
      if (offsets[m] <= pos) { ans = m; lo = m + 1; }
      else hi = m - 1;
    }
    return ans;
  };

  const startRow = findIdx(rowOffsets, scroll.y, sheet.rowCount);
  const endRow = Math.min(sheet.rowCount, findIdx(rowOffsets, scroll.y + viewport.h, sheet.rowCount) + 2);
  const startCol = findIdx(colOffsets, scroll.x, sheet.colCount);
  const endCol = Math.min(sheet.colCount, findIdx(colOffsets, scroll.x + viewport.w, sheet.colCount) + 2);

  const isDragging = useRef(false);
  const onCellMouseDown = (r: number, c: number, e: React.MouseEvent) => {
    if (e.button === 2) {
      const sel = normalizeRange(selection.anchor, selection.focus);
      if (r < sel.r1 || r > sel.r2 || c < sel.c1 || c > sel.c2) setActive(r, c);
      return;
    }
    if (editing) commitEdit();
    isDragging.current = true;
    setActive(r, c, e.shiftKey);
    ensureTailRows(50);
    if (painter) applyPainterCell(r, c);
  };
  const onCellMouseEnter = (r: number, c: number) => {
    if (isDragging.current) {
      setSelection({ anchor: selection.anchor, focus: { r, c } });
      if (painter) applyPainterCell(r, c);
    }
  };
  useEffect(() => {
    const up = () => { isDragging.current = false; };
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && painter) {
        e.preventDefault();
        stopPainter();
        return;
      }
      if (editing) {
        if (e.key === "Enter") { e.preventDefault(); commitEdit({ dr: 1, dc: 0 }); }
        else if (e.key === "Tab") { e.preventDefault(); commitEdit({ dr: 0, dc: e.shiftKey ? -1 : 1 }); }
        else if (e.key === "Escape") { e.preventDefault(); cancelEdit(); }
        return;
      }
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); return; }
      if (meta && (e.key === "y" || (e.key === "z" && e.shiftKey))) { e.preventDefault(); redo(); return; }
      if (meta && e.key === "c") { e.preventDefault(); copySelection(false); return; }
      if (meta && e.key === "x") { e.preventDefault(); copySelection(true); return; }
      if (meta && e.key === "a") {
        e.preventDefault();
        setSelection({ anchor: { r: 0, c: 0 }, focus: { r: sheet.rowCount - 1, c: sheet.colCount - 1 } });
        return;
      }
      const ext = e.shiftKey;
      switch (e.key) {
        case "ArrowUp": e.preventDefault(); moveActive(-1, 0, ext); return;
        case "ArrowDown": e.preventDefault(); moveActive(1, 0, ext); ensureTailRows(50); return;
        case "ArrowLeft": e.preventDefault(); moveActive(0, -1, ext); return;
        case "ArrowRight": e.preventDefault(); moveActive(0, 1, ext); return;
        case "Tab": e.preventDefault(); moveActive(0, e.shiftKey ? -1 : 1); return;
        case "Enter": e.preventDefault(); startEdit(selection.focus.r, selection.focus.c); ensureTailRows(50); return;
        case "F2": e.preventDefault(); startEdit(selection.focus.r, selection.focus.c); return;
        case "Delete":
        case "Backspace": e.preventDefault(); clearSelection(); return;
        case "Home": e.preventDefault(); setActive(selection.focus.r, 0, ext); return;
        case "End": e.preventDefault(); setActive(selection.focus.r, sheet.colCount - 1, ext); return;
      }
      if (!meta && e.key.length === 1) { e.preventDefault(); startEdit(selection.focus.r, selection.focus.c, e.key); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, selection, sheet, cancelEdit, clearSelection, commitEdit, copySelection, moveActive, redo, setActive, setSelection, startEdit, undo, painter, stopPainter, ensureTailRows]);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (editing) return;
      const text = e.clipboardData?.getData("text/plain");
      if (text != null) { e.preventDefault(); pastePlain(selection.focus.r, selection.focus.c, text); }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [selection, editing, pastePlain]);

  const [resizing, setResizing] = useState<{ kind: "col" | "row"; idx: number; start: number; orig: number } | null>(null);
  useEffect(() => {
    if (!resizing) return;
    const move = (e: MouseEvent) => {
      const delta = (resizing.kind === "col" ? e.clientX : e.clientY) - resizing.start;
      const next = resizing.orig + delta;
      if (resizing.kind === "col") setColWidth(resizing.idx, next);
      else setRowHeight(resizing.idx, next);
    };
    const up = () => setResizing(null);
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
  }, [resizing, setColWidth, setRowHeight]);

  const sel = normalizeRange(selection.anchor, selection.focus);
  const visibleCols: number[] = [];
  for (let c = startCol; c < endCol; c++) if (!sheet.hiddenCols[c]) visibleCols.push(c);

  const freezeRowCount = Math.max(0, Math.min(sheet.freezeRows || 0, sheet.rowCount));
  const frozenRows: number[] = [];
  for (let r = 0; r < freezeRowCount; r++) if (!sheet.hiddenRows[r]) frozenRows.push(r);

  const bodyRows: number[] = [];
  const bodyStart = Math.max(startRow, freezeRowCount);
  for (let r = bodyStart; r < endRow; r++) if (!sheet.hiddenRows[r]) bodyRows.push(r);

  const rowHeaderRows: number[] = [];
  // Row headers should line up with what is actually rendered: frozen rows (in frozen band) + body rows.
  frozenRows.forEach((r) => rowHeaderRows.push(r));
  bodyRows.forEach((r) => rowHeaderRows.push(r));

  const mergeOrigin = useMemo(() => {
    const origins = new Map<string, { r1: number; c1: number; r2: number; c2: number }>();
    const skip = new Set<string>();
    for (const mg of sheet.merges || []) {
      origins.set(`${mg.r1},${mg.c1}`, mg);
      for (let r = mg.r1; r <= mg.r2; r++) for (let c = mg.c1; c <= mg.c2; c++) if (!(r === mg.r1 && c === mg.c1)) skip.add(`${r},${c}`);
    }
    return { origins, skip };
  }, [sheet.merges]);

  const renderCell = useCallback((r: number, c: number) => {
    const cell = sheet.cells[cellKey(r, c)];
    if (!cell) return "";
    if (cell.value.startsWith("=")) {
      const e = evaluateCell(r, c, sheet.cells);
      if (e.error) return e.error;
      return e.value == null ? "" : String(e.value);
    }
    return cell.value;
  }, [sheet.cells]);

  const mergeSpan = useCallback((r: number, c: number) => {
    const mg = mergeOrigin.origins.get(`${r},${c}`);
    if (!mg) return null;
    const width = (getCellX(mg.c2) + getCellWidth(mg.c2)) - getCellX(mg.c1);
    const height = (getCellY(mg.r2) + getCellHeight(mg.r2)) - getCellY(mg.r1);
    return { width, height, mg };
  }, [mergeOrigin, getCellX, getCellY, getCellWidth, getCellHeight]);

  return (
    <GridContextMenu>
      <div
        ref={scrollRef}
        className="grid-scroll relative flex-1 overflow-auto bg-background outline-none"
        tabIndex={0}
        onScroll={(e) => setScroll({ x: e.currentTarget.scrollLeft, y: e.currentTarget.scrollTop })}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div style={{ width: totalW + HEADER_WIDTH, height: totalH + HEADER_HEIGHT, position: "relative" }}>
          {/* Corner */}
          <div className="sticky left-0 top-0 z-40 border-b border-r bg-grid-header" style={{ width: HEADER_WIDTH, height: HEADER_HEIGHT }} />

          {/* Column headers */}
          <div className="sticky top-0 z-30" style={{ left: HEADER_WIDTH, height: HEADER_HEIGHT, marginLeft: HEADER_WIDTH }}>
            {visibleCols.map((c) => {
              const left = getCellX(c);
              const w = getCellWidth(c);
              const active = c >= sel.c1 && c <= sel.c2;
              return (
                <div
                  key={c}
                  className={`absolute flex items-center justify-center border-b border-r text-[11px] font-medium text-grid-header-fg select-none ${active ? "bg-grid-header-active" : "bg-grid-header"}`}
                  style={{ left, width: w, height: HEADER_HEIGHT, top: 0 }}
                  onMouseDown={(e) => {
                    if (e.button !== 0) return;
                    isDragging.current = true;
                    setSelection({ anchor: { r: 0, c }, focus: { r: sheet.rowCount - 1, c } });
                  }}
                  onMouseEnter={() => { if (isDragging.current) setSelection({ anchor: selection.anchor, focus: { r: sheet.rowCount - 1, c } }); }}
                >
                  <span>{colLetter(c)}</span>
                  <div className="ml-1"><HeaderFilterMenu col={c} /></div>
                  <div
                    className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-primary/40"
                    onMouseDown={(e) => { e.stopPropagation(); setResizing({ kind: "col", idx: c, start: e.clientX, orig: w }); }}
                  />
                </div>
              );
            })}
          </div>

          {/* Frozen rows overlay (rendered once; excluded from body). */}
          {freezeRowCount > 0 && (
            <div className="sticky z-[25]" style={{ top: HEADER_HEIGHT, left: HEADER_WIDTH, height: 0, marginLeft: HEADER_WIDTH }}>
              <div style={{ position: "absolute", top: 0, left: 0, height: getCellY(freezeRowCount), width: totalW, pointerEvents: "auto" }}>
                {frozenRows.map((r) =>
                  visibleCols.map((c) => {
                    if (mergeOrigin.skip.has(`${r},${c}`)) return null;
                    const left = getCellX(c);
                    const top = getCellY(r);
                    let w = getCellWidth(c);
                    let h = getCellHeight(r);
                    const span = mergeSpan(r, c);
                    if (span) { w = span.width; h = span.height; }
                    const cell = sheet.cells[cellKey(r, c)];
                    const fmt = cell?.format;
                    const display = renderCell(r, c);
                    const isNum = typeof display === "string" && display !== "" && !isNaN(parseFloat(display)) && /^-?\d*\.?\d+$/.test(display.trim());
                    const align = fmt?.align || (isNum ? "right" : "left");
                    const wrap = fmt?.wrap;
                    return (
                      <div
                        key={`f-${r}-${c}`}
                        className="absolute border-b border-r text-[13px] overflow-hidden"
                        style={{
                          left, top, width: w, height: h,
                          borderColor: "var(--grid-line)",
                          backgroundColor: fmt?.bg || "hsl(var(--grid-header))",
                          boxShadow: r === freezeRowCount - 1 ? "0 1px 0 var(--border)" : undefined,
                        }}
                        onMouseDown={(e) => onCellMouseDown(r, c, e)}
                        onMouseEnter={() => onCellMouseEnter(r, c)}
                        onDoubleClick={() => startEdit(r, c)}
                      >
                        <div
                          className={`px-1.5 leading-tight flex h-full ${wrap ? "items-start py-1" : "items-center whitespace-nowrap"}`}
                          style={{
                            justifyContent: align === "right" ? "flex-end" : align === "center" ? "center" : "flex-start",
                            textAlign: align as any,
                            fontWeight: fmt?.bold ? 700 : 400,
                            fontStyle: fmt?.italic ? "italic" : "normal",
                            textDecoration: fmt?.underline ? "underline" : "none",
                            color: fmt?.color,
                            whiteSpace: wrap ? "pre-wrap" : "nowrap",
                            wordBreak: wrap ? "break-word" : "normal",
                          }}
                        >
                          {display}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* Row headers: frozen band (sticky) + body (scroll). */}
          {freezeRowCount > 0 && (
            <div className="sticky left-0 z-[26]" style={{ top: HEADER_HEIGHT, width: HEADER_WIDTH, height: 0 }}>
              <div style={{ position: "absolute", top: 0, left: 0, width: HEADER_WIDTH, height: getCellY(freezeRowCount), pointerEvents: "auto" }}>
                {frozenRows.map((r) => {
                  const top = getCellY(r);
                  const h = getCellHeight(r);
                  const active = r >= sel.r1 && r <= sel.r2;
                  return (
                    <div
                      key={`rh-f-${r}`}
                      className={`absolute flex items-center justify-center border-b border-r text-[11px] font-medium text-grid-header-fg select-none ${active ? "bg-grid-header-active" : "bg-grid-header"}`}
                      style={{ top, height: h, width: HEADER_WIDTH }}
                      onMouseDown={(e) => { if (e.button !== 0) return; isDragging.current = true; setSelection({ anchor: { r, c: 0 }, focus: { r, c: sheet.colCount - 1 } }); }}
                      onMouseEnter={() => { if (isDragging.current) setSelection({ anchor: selection.anchor, focus: { r, c: sheet.colCount - 1 } }); }}
                    >
                      {r + 1}
                      <div className="absolute bottom-0 left-0 h-1 w-full cursor-row-resize hover:bg-primary/40" onMouseDown={(e) => { e.stopPropagation(); setResizing({ kind: "row", idx: r, start: e.clientY, orig: h }); }} />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="sticky left-0 z-30" style={{ top: HEADER_HEIGHT, width: HEADER_WIDTH, height: totalH }}>
            {bodyRows.map((r) => {
              const top = getCellY(r);
              const h = getCellHeight(r);
              const active = r >= sel.r1 && r <= sel.r2;
              return (
                <div
                  key={`rh-${r}`}
                  className={`absolute flex items-center justify-center border-b border-r text-[11px] font-medium text-grid-header-fg select-none ${active ? "bg-grid-header-active" : "bg-grid-header"}`}
                  style={{ top, height: h, width: HEADER_WIDTH }}
                  onMouseDown={(e) => { if (e.button !== 0) return; isDragging.current = true; setSelection({ anchor: { r, c: 0 }, focus: { r, c: sheet.colCount - 1 } }); }}
                  onMouseEnter={() => { if (isDragging.current) setSelection({ anchor: selection.anchor, focus: { r, c: sheet.colCount - 1 } }); }}
                >
                  {r + 1}
                  <div className="absolute bottom-0 left-0 h-1 w-full cursor-row-resize hover:bg-primary/40" onMouseDown={(e) => { e.stopPropagation(); setResizing({ kind: "row", idx: r, start: e.clientY, orig: h }); }} />
                </div>
              );
            })}
          </div>

          {/* Body cells (non-frozen rows only). */}
          <div style={{ position: "absolute", left: HEADER_WIDTH, top: HEADER_HEIGHT }}>
            {bodyRows.map((r) =>
              visibleCols.map((c) => {
                if (mergeOrigin.skip.has(`${r},${c}`)) return null;
                const left = getCellX(c);
                const top = getCellY(r);
                let w = getCellWidth(c);
                let h = getCellHeight(r);
                const span = mergeSpan(r, c);
                if (span) { w = span.width; h = span.height; }
                const cell = sheet.cells[cellKey(r, c)];
                const fmt = cell?.format;
                const isInRange = r >= sel.r1 && r <= sel.r2 && c >= sel.c1 && c <= sel.c2;
                const isActive = r === selection.focus.r && c === selection.focus.c;
                const isEditing = editing && editing.r === r && editing.c === c;
                const display = renderCell(r, c);
                const isNum = typeof display === "string" && display !== "" && !isNaN(parseFloat(display)) && /^-?\d*\.?\d+$/.test(display.trim());
                const align = fmt?.align || (isNum ? "right" : "left");
                const wrap = fmt?.wrap;

                return (
                  <div
                    key={`${r}-${c}`}
                    className={`absolute border-b border-r text-[13px] overflow-hidden ${isInRange && !isActive && !fmt?.bg ? "bg-grid-selection-fill" : ""}`}
                    style={{ left, top, width: w, height: h, borderColor: "var(--grid-line)", backgroundColor: fmt?.bg }}
                    onMouseDown={(e) => onCellMouseDown(r, c, e)}
                    onMouseEnter={() => onCellMouseEnter(r, c)}
                    onDoubleClick={() => startEdit(r, c)}
                  >
                    {isEditing ? (
                      <input
                        autoFocus
                        className="absolute inset-0 w-full px-1 text-[13px] outline-none ring-2 ring-primary bg-grid-active-cell"
                        style={{ fontWeight: fmt?.bold ? 700 : 400 }}
                        value={editing!.value}
                        onChange={(e) => updateEdit(e.target.value)}
                        onBlur={() => commitEdit()}
                      />
                    ) : (
                      <div
                        className={`px-1.5 leading-tight flex h-full ${wrap ? "items-start py-1" : "items-center whitespace-nowrap"}`}
                        style={{
                          justifyContent: align === "right" ? "flex-end" : align === "center" ? "center" : "flex-start",
                          textAlign: align as any,
                          fontWeight: fmt?.bold ? 700 : 400,
                          fontStyle: fmt?.italic ? "italic" : "normal",
                          textDecoration: fmt?.underline ? "underline" : "none",
                          color: fmt?.color,
                          whiteSpace: wrap ? "pre-wrap" : "nowrap",
                          wordBreak: wrap ? "break-word" : "normal",
                        }}
                      >
                        {display}
                      </div>
                    )}
                  </div>
                );
              })
            )}

            {!editing && (() => {
              const left = getCellX(sel.c1);
              const top = getCellY(sel.r1);
              const right = getCellX(sel.c2) + getCellWidth(sel.c2);
              const bot = getCellY(sel.r2) + getCellHeight(sel.r2);
              return (
                <div className="pointer-events-none absolute border-2 border-grid-selection" style={{ left: left - 1, top: top - 1, width: right - left + 1, height: bot - top + 1 }} />
              );
            })()}
          </div>
        </div>
      </div>
    </GridContextMenu>
  );
}
