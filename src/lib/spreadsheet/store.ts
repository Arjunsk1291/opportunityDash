import { create } from "zustand";
import { DEFAULT_COL_WIDTH, DEFAULT_ROW_HEIGHT } from "./types";
import type { Cell, CellAddr, CellFormat, Merge, Sheet, Workbook } from "./types";
import { a1, cellKey, clamp, normalizeRange, tsvToMatrix } from "./utils";

type Selection = { anchor: CellAddr; focus: CellAddr };
type Editing = { r: number; c: number; value: string } | null;

type HistoryEntry = { workbook: Workbook; selection: Selection };

function cloneWorkbook(workbook: Workbook): Workbook {
  return {
    activeSheetId: workbook.activeSheetId,
    sheets: workbook.sheets.map((s) => ({
      ...s,
      cells: { ...s.cells },
      merges: (s.merges || []).map((m) => ({ ...m })),
      colWidths: { ...s.colWidths },
      rowHeights: { ...s.rowHeights },
      hiddenRows: { ...s.hiddenRows },
      hiddenCols: { ...s.hiddenCols },
      filters: (s.filters || []).map((f) => ({ ...f })),
      sort: s.sort ? { ...s.sort } : null,
    })),
  };
}

function emptySheet(id: string, name: string): Sheet {
  return {
    id,
    name,
    rowCount: 200,
    colCount: 40,
    freezeRows: 1,
    freezeCols: 0,
    cells: {},
    merges: [],
    colWidths: {},
    rowHeights: {},
    hiddenRows: {},
    hiddenCols: {},
    filters: [],
    sort: null,
  };
}

function getActiveSheet(workbook: Workbook): Sheet {
  return workbook.sheets.find((s) => s.id === workbook.activeSheetId) || workbook.sheets[0];
}

export function getColW(sheet: Sheet, c: number) {
  return Math.max(24, Math.min(800, sheet.colWidths[c] ?? DEFAULT_COL_WIDTH));
}

export function getRowH(sheet: Sheet, r: number) {
  return Math.max(18, Math.min(400, sheet.rowHeights[r] ?? DEFAULT_ROW_HEIGHT));
}

type SpreadsheetState = {
  workbook: Workbook;
  selection: Selection;
  editing: Editing;
  clipboard: { text: string; cut: boolean } | null;
  history: { undo: HistoryEntry[]; redo: HistoryEntry[] };
  formatPainter: { format: CellFormat; locked: boolean } | null;

  hydrateFromWorkbookPayload: (payload: unknown) => void;
  ensureTailRows: (minExtra?: number) => void;

  setActiveSheet: (id: string) => void;
  addSheet: () => void;
  removeSheet: (id: string) => void;
  renameSheet: (id: string, name: string) => void;

  setSelection: (sel: Selection) => void;
  setActive: (r: number, c: number, extend?: boolean) => void;
  moveActive: (dr: number, dc: number, extend?: boolean) => void;

  startEdit: (r: number, c: number, initial?: string) => void;
  updateEdit: (value: string) => void;
  commitEdit: (opts?: { dr?: number; dc?: number }) => void;
  cancelEdit: () => void;

  setCell: (r: number, c: number, value: string, format?: CellFormat) => void;
  applyFormatToSelection: (patch: Partial<CellFormat>) => void;

  setColWidth: (c: number, w: number) => void;
  setRowHeight: (r: number, h: number) => void;

  copySelection: (cut: boolean) => void;
  pastePlain: (r: number, c: number, text: string) => void;
  clearSelection: () => void;

  undo: () => void;
  redo: () => void;

  sortByColumn: (col: number, dir: "asc" | "desc") => void;
  setFilter: (col: number, query: string) => void;
  clearFilters: () => void;

  freezeTopRow: () => void;
  freezeFirstCol: () => void;

  hideRows: (r1: number, r2: number) => void;
  hideCols: (c1: number, c2: number) => void;
  unhideAllRows: () => void;
  unhideAllCols: () => void;

  insertRow: (at: number, where: "above" | "below") => void;
  insertCol: (at: number, where: "left" | "right") => void;
  deleteRows: (r1: number, r2: number) => void;
  deleteCols: (c1: number, c2: number) => void;

  importCSV: (text: string) => void;
  exportCSV: () => string;

  startFormatPainter: (locked?: boolean) => void;
  stopFormatPainter: () => void;
  applyFormatPainterCell: (r: number, c: number) => void;
};

function pushHistory(state: SpreadsheetState) {
  const entry: HistoryEntry = { workbook: cloneWorkbook(state.workbook), selection: { ...state.selection, anchor: { ...state.selection.anchor }, focus: { ...state.selection.focus } } };
  state.history.undo.push(entry);
  if (state.history.undo.length > 50) state.history.undo.shift();
  state.history.redo = [];
}

function cellOrEmpty(sheet: Sheet, r: number, c: number): Cell {
  return sheet.cells[cellKey(r, c)] || { value: "" };
}

function ensureSize(sheet: Sheet, r: number, c: number) {
  if (r >= sheet.rowCount) sheet.rowCount = r + 1;
  if (c >= sheet.colCount) sheet.colCount = c + 1;
}

function applyFiltersToSheet(sheet: Sheet) {
  const filters = sheet.filters.filter((f) => String(f.query || "").trim() !== "");
  if (!filters.length) {
    sheet.hiddenRows = { ...sheet.hiddenRows }; // keep manual hidden
    return;
  }
  const nextHidden: Record<number, boolean> = {};
  for (let r = sheet.freezeRows; r < sheet.rowCount; r++) {
    let ok = true;
    for (const f of filters) {
      const v = cellOrEmpty(sheet, r, f.column).value;
      if (!String(v ?? "").toLowerCase().includes(String(f.query).toLowerCase())) { ok = false; break; }
    }
    if (!ok) nextHidden[r] = true;
  }
  sheet.hiddenRows = { ...sheet.hiddenRows, ...nextHidden };
}

const HEX = {
  headerBand: "#9BC2E6",
  banner: "#D9E1F2",
  grey: "#D9D9D9",
  softYellow: "#FFF2CC",
  hardYellow: "#FFFF00",
  softOrange: "#FCE4D6",
  softRed: "#FFC7CE",
  hardRed: "#FF0000",
  softGreen: "#C6E0B4",
  medGreen: "#A9D08E",
  coolGrey: "#D0CECE",
  white: "#FFFFFF",
  darkRedText: "#9C0006",
  black: "#000000",
  whiteText: "#FFFFFF",
} as const;

function normalizeStatusText(value: string) {
  return String(value || "").trim().toUpperCase();
}

function pickStatusFormat(statusRaw: string): CellFormat | null {
  const status = normalizeStatusText(statusRaw);
  if (!status) return null;
  if (status.includes("AWARD") || status === "WON") return { bg: HEX.medGreen, color: HEX.black };
  if (status.includes("LOST") || status.includes("NO BID") || status.includes("CANCEL") || status.includes("REGRET")) {
    return { bg: HEX.softRed, color: HEX.darkRedText };
  }
  if (status.includes("SUBMIT")) return { bg: HEX.softOrange, color: HEX.black };
  if (status.includes("WORK") || status.includes("IN PROGRESS") || status.includes("ONGOING") || status.includes("PENDING") || status.includes("UNDER REVIEW")) {
    return { bg: HEX.softYellow, color: HEX.black };
  }
  if (status.includes("ARCHIV")) return { bg: HEX.coolGrey, color: HEX.black };
  return null;
}

export const useSpreadsheet = create<SpreadsheetState>((set, get) => ({
  workbook: { activeSheetId: "sheet-1", sheets: [emptySheet("sheet-1", "MASTER TENDER LIST AVENIR")] },
  selection: { anchor: { r: 0, c: 0 }, focus: { r: 0, c: 0 } },
  editing: null,
  clipboard: null,
  history: { undo: [], redo: [] },
  formatPainter: null,

  hydrateFromWorkbookPayload: (payload) => {
    const p = payload as unknown as { workbook?: { sheets?: unknown[] } } | null;
    const workbookObj = p && typeof p === "object" ? (p as any).workbook : null;
    const sheetsIn = Array.isArray(workbookObj?.sheets) ? workbookObj.sheets : [];
    if (!sheetsIn.length) return;
    const sheets: Sheet[] = sheetsIn.map((s: any, sheetIdx: number) => {
      const id = String(s.id || `sheet-${sheetIdx + 1}`);
      const name = String(s.name || id);
      const rowCount = Math.max(1, Number(s.rowCount || (Array.isArray(s.cells) ? s.cells.length : 200) || 200));
      const colCount = Math.max(1, Number(s.colCount || 40));
      const freezeRows = Math.max(1, Number(s.freezeRows || 1));
      const cellsMap: Record<string, Cell> = {};
      const matrix: unknown[][] = Array.isArray(s.cells) ? s.cells : [];
      for (let r = 0; r < matrix.length; r++) {
        const row = Array.isArray(matrix[r]) ? matrix[r] : [];
        for (let c = 0; c < row.length; c++) {
          const v = row[c];
          if (v === null || v === undefined) continue;
          const text = String(v);
          if (text === "") continue;
          cellsMap[cellKey(r, c)] = { value: text };
        }
      }

      // Default workbook color coding (hardcoded hex fills) to match tender workbook conventions.
      // - Row 4 (0-based index 3) header band
      // - Row 2 banner background (0-based index 1)
      const headerRowIdx = Math.max(0, freezeRows - 1);
      for (let c = 0; c < colCount; c++) {
        const k = cellKey(headerRowIdx, c);
        const cur = cellsMap[k] || { value: matrix?.[headerRowIdx]?.[c] == null ? "" : String(matrix[headerRowIdx][c]) };
        cellsMap[k] = { ...cur, format: { ...(cur.format || {}), bg: HEX.headerBand, color: HEX.black, bold: true, wrap: true } };
      }
      for (let c = 0; c < colCount; c++) {
        const k = cellKey(1, c);
        const existing = cellsMap[k];
        if (!existing) continue;
        cellsMap[k] = { ...existing, format: { ...(existing.format || {}), bg: HEX.banner, color: HEX.black, bold: true, align: "center", wrap: true } };
      }

      // Status column coding (MASTER sheet & other sheets when the header exists).
      const statusHeader = "AVENIR STATUS";
      let statusCol = -1;
      const headerRow = matrix?.[headerRowIdx] || [];
      for (let c = 0; c < headerRow.length; c++) {
        if (String(headerRow[c] ?? "").trim().toUpperCase() === statusHeader) { statusCol = c; break; }
      }
      if (statusCol >= 0) {
        for (let r = freezeRows; r < rowCount; r++) {
          const k = cellKey(r, statusCol);
          const cell = cellsMap[k];
          if (!cell) continue;
          const fmt = pickStatusFormat(cell.value);
          if (!fmt) continue;
          cellsMap[k] = { ...cell, format: { ...(cell.format || {}), ...fmt } };
        }
      }
      const merges: Merge[] = (Array.isArray(s.merges) ? s.merges : []).map((m: any) => {
        // Accept A1 ranges or numeric merges.
        if (m && typeof m === "object" && typeof m.r1 === "number") return { r1: m.r1, c1: m.c1, r2: m.r2, c2: m.c2 };
        const start = String(m?.start || "");
        const end = String(m?.end || "");
        const A = start ? a1ToAddr(start) : null;
        const B = end ? a1ToAddr(end) : null;
        if (A && B) return { r1: A.r, c1: A.c, r2: B.r, c2: B.c };
        return { r1: 0, c1: 0, r2: 0, c2: 0 };
      }).filter((m) => m.r2 >= m.r1 && m.c2 >= m.c1);

      const colWidths: Record<number, number> = {};
      const wIn = s.columnWidthsPx && typeof s.columnWidthsPx === "object" ? s.columnWidthsPx : {};
      Object.entries(wIn).forEach(([k, v]) => { const idx = Number(k); if (Number.isFinite(idx)) colWidths[idx] = Number(v) || DEFAULT_COL_WIDTH; });
      const rowHeights: Record<number, number> = {};
      const hIn = s.rowHeightsPx && typeof s.rowHeightsPx === "object" ? s.rowHeightsPx : {};
      Object.entries(hIn).forEach(([k, v]) => { const idx = Number(k); if (Number.isFinite(idx)) rowHeights[idx] = Number(v) || DEFAULT_ROW_HEIGHT; });

      return {
        id,
        name,
        rowCount,
        colCount,
        freezeRows,
        freezeCols: 0,
        cells: cellsMap,
        merges,
        colWidths,
        rowHeights,
        hiddenRows: {},
        hiddenCols: {},
        filters: [],
        sort: null,
      };
    });

    set({
      workbook: { activeSheetId: sheets[0].id, sheets },
      selection: { anchor: { r: 0, c: 0 }, focus: { r: 0, c: 0 } },
      editing: null,
      history: { undo: [], redo: [] },
    });
  },

  ensureTailRows: (minExtra = 50) => set((state) => {
    const wb = cloneWorkbook(state.workbook);
    const sheet = getActiveSheet(wb);
    const focusR = state.selection.focus.r;
    const tail = Math.max(10, Number(minExtra || 50));
    if (sheet.rowCount - focusR <= 5) {
      sheet.rowCount += tail;
      return { workbook: wb };
    }
    return {};
  }),

  setActiveSheet: (id) => set((state) => ({ workbook: { ...state.workbook, activeSheetId: id } })),
  addSheet: () => set((state) => {
    pushHistory(state);
    const id = `sheet-${Date.now()}`;
    const sheet = emptySheet(id, `Sheet${state.workbook.sheets.length + 1}`);
    return { workbook: { activeSheetId: id, sheets: [...state.workbook.sheets, sheet] } };
  }),
  removeSheet: (id) => set((state) => {
    if (state.workbook.sheets.length <= 1) return {};
    pushHistory(state);
    const next = state.workbook.sheets.filter((s) => s.id !== id);
    const active = state.workbook.activeSheetId === id ? next[0].id : state.workbook.activeSheetId;
    return { workbook: { activeSheetId: active, sheets: next } };
  }),
  renameSheet: (id, name) => set((state) => {
    pushHistory(state);
    const wb = cloneWorkbook(state.workbook);
    const s = wb.sheets.find((x) => x.id === id);
    if (s) s.name = String(name || s.name);
    return { workbook: wb };
  }),

  setSelection: (sel) => set(() => ({ selection: sel })),
  setActive: (r, c, extend) => set((state) => {
    const wb = state.workbook;
    const sheet = getActiveSheet(wb);
    const rr = clamp(r, 0, sheet.rowCount - 1);
    const cc = clamp(c, 0, sheet.colCount - 1);
    const anchor = extend ? state.selection.anchor : { r: rr, c: cc };
    return { selection: { anchor, focus: { r: rr, c: cc } } };
  }),
  moveActive: (dr, dc, extend) => set((state) => {
    const sheet = getActiveSheet(state.workbook);
    let r = state.selection.focus.r;
    let c = state.selection.focus.c;
    const step = (rr: number, cc: number) => {
      let nr = rr, nc = cc;
      // Skip hidden rows/cols for keyboard nav.
      while (sheet.hiddenRows[nr] && nr + Math.sign(dr) >= 0 && nr + Math.sign(dr) < sheet.rowCount) nr += Math.sign(dr);
      while (sheet.hiddenCols[nc] && nc + Math.sign(dc) >= 0 && nc + Math.sign(dc) < sheet.colCount) nc += Math.sign(dc);
      return { nr, nc };
    };
    r = clamp(r + dr, 0, sheet.rowCount - 1);
    c = clamp(c + dc, 0, sheet.colCount - 1);
    const { nr, nc } = step(r, c);
    const anchor = extend ? state.selection.anchor : { r: nr, c: nc };
    return { selection: { anchor, focus: { r: nr, c: nc } } };
  }),

  startEdit: (r, c, initial) => set((state) => {
    const sheet = getActiveSheet(state.workbook);
    const cell = sheet.cells[cellKey(r, c)];
    return { editing: { r, c, value: initial ?? (cell?.value || "") } };
  }),
  updateEdit: (value) => set(() => ({ editing: { ...(get().editing as any), value } })),
  commitEdit: (opts) => set((state) => {
    const ed = state.editing;
    if (!ed) return {};
    pushHistory(state);
    const wb = cloneWorkbook(state.workbook);
    const sheet = getActiveSheet(wb);
    ensureSize(sheet, ed.r, ed.c);
    const key = cellKey(ed.r, ed.c);
    const nextText = String(ed.value ?? "");
    if (nextText === "") delete sheet.cells[key];
    else sheet.cells[key] = { ...(sheet.cells[key] || { value: "" }), value: nextText };
    const dr = opts?.dr ?? 0;
    const dc = opts?.dc ?? 0;
    const nr = clamp(ed.r + dr, 0, sheet.rowCount - 1);
    const nc = clamp(ed.c + dc, 0, sheet.colCount - 1);
    if (sheet.rowCount - nr <= 3) sheet.rowCount += 50;
    return {
      workbook: wb,
      editing: null,
      selection: { anchor: { r: nr, c: nc }, focus: { r: nr, c: nc } },
    };
  }),
  cancelEdit: () => set(() => ({ editing: null })),

  setCell: (r, c, value, format) => set((state) => {
    pushHistory(state);
    const wb = cloneWorkbook(state.workbook);
    const sheet = getActiveSheet(wb);
    ensureSize(sheet, r, c);
    const key = cellKey(r, c);
    if (!value) delete sheet.cells[key];
    else sheet.cells[key] = { ...(sheet.cells[key] || { value: "" }), value: String(value), format: { ...(sheet.cells[key]?.format || {}), ...(format || {}) } };
    return { workbook: wb };
  }),

  applyFormatToSelection: (patch) => set((state) => {
    pushHistory(state);
    const wb = cloneWorkbook(state.workbook);
    const sheet = getActiveSheet(wb);
    const { r1, r2, c1, c2 } = normalizeRange(state.selection.anchor, state.selection.focus);
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) {
      const key = cellKey(r, c);
      const cur = sheet.cells[key] || { value: "" };
      sheet.cells[key] = { ...cur, format: { ...(cur.format || {}), ...patch } };
    }
    return { workbook: wb };
  }),

  setColWidth: (c, w) => set((state) => {
    const wb = cloneWorkbook(state.workbook);
    const sheet = getActiveSheet(wb);
    sheet.colWidths[c] = Math.max(24, Math.min(800, Math.round(w)));
    return { workbook: wb };
  }),
  setRowHeight: (r, h) => set((state) => {
    const wb = cloneWorkbook(state.workbook);
    const sheet = getActiveSheet(wb);
    sheet.rowHeights[r] = Math.max(18, Math.min(400, Math.round(h)));
    return { workbook: wb };
  }),

  copySelection: (cut) => set((state) => {
    const sheet = getActiveSheet(state.workbook);
    const { r1, r2, c1, c2 } = normalizeRange(state.selection.anchor, state.selection.focus);
    const lines: string[] = [];
    for (let r = r1; r <= r2; r++) {
      const cols: string[] = [];
      for (let c = c1; c <= c2; c++) cols.push(String(cellOrEmpty(sheet, r, c).value ?? ""));
      lines.push(cols.join("\t"));
    }
    const text = lines.join("\n");
    try { void navigator.clipboard.writeText(text); } catch { /* ignore */ }
    return { clipboard: { text, cut } };
  }),
  pastePlain: (r, c, text) => set((state) => {
    pushHistory(state);
    const wb = cloneWorkbook(state.workbook);
    const sheet = getActiveSheet(wb);
    const matrix = tsvToMatrix(text);
    for (let rr = 0; rr < matrix.length; rr++) {
      for (let cc = 0; cc < matrix[rr].length; cc++) {
        const v = matrix[rr][cc] ?? "";
        if (String(v) === "") continue;
        ensureSize(sheet, r + rr, c + cc);
        sheet.cells[cellKey(r + rr, c + cc)] = { ...(sheet.cells[cellKey(r + rr, c + cc)] || { value: "" }), value: String(v) };
      }
    }
    return { workbook: wb };
  }),
  clearSelection: () => set((state) => {
    pushHistory(state);
    const wb = cloneWorkbook(state.workbook);
    const sheet = getActiveSheet(wb);
    const { r1, r2, c1, c2 } = normalizeRange(state.selection.anchor, state.selection.focus);
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) delete sheet.cells[cellKey(r, c)];
    return { workbook: wb };
  }),

  undo: () => set((state) => {
    const prev = state.history.undo.pop();
    if (!prev) return {};
    state.history.redo.push({ workbook: cloneWorkbook(state.workbook), selection: state.selection });
    return { workbook: prev.workbook, selection: prev.selection, editing: null };
  }),
  redo: () => set((state) => {
    const next = state.history.redo.pop();
    if (!next) return {};
    state.history.undo.push({ workbook: cloneWorkbook(state.workbook), selection: state.selection });
    return { workbook: next.workbook, selection: next.selection, editing: null };
  }),

  sortByColumn: (col, dir) => set((state) => {
    pushHistory(state);
    const wb = cloneWorkbook(state.workbook);
    const sheet = getActiveSheet(wb);
    sheet.sort = { column: col, dir };
    const rows: number[] = [];
    for (let r = sheet.freezeRows; r < sheet.rowCount; r++) if (!sheet.hiddenRows[r]) rows.push(r);
    const keyAt = (r: number) => String(cellOrEmpty(sheet, r, col).value ?? "").toLowerCase();
    const numAt = (r: number) => {
      const n = Number(String(cellOrEmpty(sheet, r, col).value ?? "").replace(/,/g, "").trim());
      return Number.isFinite(n) ? n : null;
    };
    rows.sort((a, b) => {
      const na = numAt(a); const nb = numAt(b);
      let cmp = 0;
      if (na !== null && nb !== null) cmp = na - nb;
      else cmp = keyAt(a).localeCompare(keyAt(b));
      return dir === "asc" ? cmp : -cmp;
    });
    // Reorder cell rows by rewriting into new indices (simple, not stable for formulas).
    const newCells: Record<string, Cell> = { ...sheet.cells };
    rows.forEach((oldR, idx) => {
      const newR = sheet.freezeRows + idx;
      for (let c = 0; c < sheet.colCount; c++) {
        const fromKey = cellKey(oldR, c);
        const toKey = cellKey(newR, c);
        const from = sheet.cells[fromKey];
        if (!from) { delete newCells[toKey]; continue; }
        newCells[toKey] = { ...from };
      }
    });
    sheet.cells = newCells;
    return { workbook: wb };
  }),
  setFilter: (col, query) => set((state) => {
    pushHistory(state);
    const wb = cloneWorkbook(state.workbook);
    const sheet = getActiveSheet(wb);
    const q = String(query || "");
    sheet.filters = sheet.filters.filter((f) => f.column !== col);
    if (q.trim()) sheet.filters.push({ column: col, query: q });
    applyFiltersToSheet(sheet);
    return { workbook: wb };
  }),
  clearFilters: () => set((state) => {
    pushHistory(state);
    const wb = cloneWorkbook(state.workbook);
    const sheet = getActiveSheet(wb);
    sheet.filters = [];
    sheet.sort = null;
    sheet.hiddenRows = {};
    return { workbook: wb };
  }),

  freezeTopRow: () => set((state) => {
    const wb = cloneWorkbook(state.workbook);
    const sheet = getActiveSheet(wb);
    sheet.freezeRows = Math.max(sheet.freezeRows, 1);
    return { workbook: wb };
  }),
  freezeFirstCol: () => set((state) => {
    const wb = cloneWorkbook(state.workbook);
    const sheet = getActiveSheet(wb);
    sheet.freezeCols = Math.max(sheet.freezeCols, 1);
    return { workbook: wb };
  }),

  hideRows: (r1, r2) => set((state) => {
    const wb = cloneWorkbook(state.workbook);
    const sheet = getActiveSheet(wb);
    for (let r = r1; r <= r2; r++) sheet.hiddenRows[r] = true;
    return { workbook: wb };
  }),
  hideCols: (c1, c2) => set((state) => {
    const wb = cloneWorkbook(state.workbook);
    const sheet = getActiveSheet(wb);
    for (let c = c1; c <= c2; c++) sheet.hiddenCols[c] = true;
    return { workbook: wb };
  }),
  unhideAllRows: () => set((state) => {
    const wb = cloneWorkbook(state.workbook);
    const sheet = getActiveSheet(wb);
    sheet.hiddenRows = {};
    return { workbook: wb };
  }),
  unhideAllCols: () => set((state) => {
    const wb = cloneWorkbook(state.workbook);
    const sheet = getActiveSheet(wb);
    sheet.hiddenCols = {};
    return { workbook: wb };
  }),

  insertRow: (at, where) => set((state) => {
    pushHistory(state);
    const wb = cloneWorkbook(state.workbook);
    const sheet = getActiveSheet(wb);
    const insertAt = clamp(where === "above" ? at : at + 1, 0, sheet.rowCount);
    sheet.rowCount += 1;
    const nextCells: Record<string, Cell> = {};
    for (const [k, v] of Object.entries(sheet.cells)) {
      const [rs, cs] = k.split(",");
      const r = Number(rs); const c = Number(cs);
      const nr = r >= insertAt ? r + 1 : r;
      nextCells[cellKey(nr, c)] = v;
    }
    sheet.cells = nextCells;
    return { workbook: wb };
  }),
  insertCol: (at, where) => set((state) => {
    pushHistory(state);
    const wb = cloneWorkbook(state.workbook);
    const sheet = getActiveSheet(wb);
    const insertAt = clamp(where === "left" ? at : at + 1, 0, sheet.colCount);
    sheet.colCount += 1;
    const nextCells: Record<string, Cell> = {};
    for (const [k, v] of Object.entries(sheet.cells)) {
      const [rs, cs] = k.split(",");
      const r = Number(rs); const c = Number(cs);
      const nc = c >= insertAt ? c + 1 : c;
      nextCells[cellKey(r, nc)] = v;
    }
    sheet.cells = nextCells;
    return { workbook: wb };
  }),
  deleteRows: (r1, r2) => set((state) => {
    pushHistory(state);
    const wb = cloneWorkbook(state.workbook);
    const sheet = getActiveSheet(wb);
    const count = r2 - r1 + 1;
    sheet.rowCount = Math.max(1, sheet.rowCount - count);
    const nextCells: Record<string, Cell> = {};
    for (const [k, v] of Object.entries(sheet.cells)) {
      const [rs, cs] = k.split(",");
      const r = Number(rs); const c = Number(cs);
      if (r >= r1 && r <= r2) continue;
      const nr = r > r2 ? r - count : r;
      nextCells[cellKey(nr, c)] = v;
    }
    sheet.cells = nextCells;
    return { workbook: wb };
  }),
  deleteCols: (c1, c2) => set((state) => {
    pushHistory(state);
    const wb = cloneWorkbook(state.workbook);
    const sheet = getActiveSheet(wb);
    const count = c2 - c1 + 1;
    sheet.colCount = Math.max(1, sheet.colCount - count);
    const nextCells: Record<string, Cell> = {};
    for (const [k, v] of Object.entries(sheet.cells)) {
      const [rs, cs] = k.split(",");
      const r = Number(rs); const c = Number(cs);
      if (c >= c1 && c <= c2) continue;
      const nc = c > c2 ? c - count : c;
      nextCells[cellKey(r, nc)] = v;
    }
    sheet.cells = nextCells;
    return { workbook: wb };
  }),

  importCSV: (text) => set((state) => {
    pushHistory(state);
    const wb = cloneWorkbook(state.workbook);
    const sheet = getActiveSheet(wb);
    const m = tsvToMatrix(text);
    sheet.rowCount = Math.max(sheet.rowCount, m.length);
    sheet.colCount = Math.max(sheet.colCount, Math.max(...m.map((r) => r.length), 1));
    for (let r = 0; r < m.length; r++) for (let c = 0; c < m[r].length; c++) {
      const v = String(m[r][c] ?? "");
      if (v) sheet.cells[cellKey(r, c)] = { ...(sheet.cells[cellKey(r, c)] || { value: "" }), value: v };
    }
    return { workbook: wb };
  }),
  exportCSV: () => {
    const sheet = getActiveSheet(get().workbook);
    const { r1, r2, c1, c2 } = normalizeRange(get().selection.anchor, get().selection.focus);
    const lines: string[] = [];
    for (let r = r1; r <= r2; r++) {
      if (sheet.hiddenRows[r]) continue;
      const cols: string[] = [];
      for (let c = c1; c <= c2; c++) {
        if (sheet.hiddenCols[c]) continue;
        const raw = String(cellOrEmpty(sheet, r, c).value ?? "");
        cols.push(raw.includes(",") ? `"${raw.replace(/\"/g, '""')}"` : raw);
      }
      lines.push(cols.join(","));
    }
    return lines.join("\n");
  },

  startFormatPainter: (locked = false) => set((state) => {
    const sheet = getActiveSheet(state.workbook);
    const { r, c } = state.selection.focus;
    const cell = sheet.cells[cellKey(r, c)];
    const format: CellFormat = { ...(cell?.format || {}) };
    return { formatPainter: { format, locked: Boolean(locked) } };
  }),
  stopFormatPainter: () => set(() => ({ formatPainter: null })),
  applyFormatPainterCell: (r, c) => set((state) => {
    const painter = state.formatPainter;
    if (!painter) return {};
    pushHistory(state);
    const wb = cloneWorkbook(state.workbook);
    const sheet = getActiveSheet(wb);
    ensureSize(sheet, r, c);
    const k = cellKey(r, c);
    const cur = sheet.cells[k] || { value: "" };
    sheet.cells[k] = { ...cur, format: { ...(cur.format || {}), ...painter.format } };
    return { workbook: wb, formatPainter: painter.locked ? painter : null };
  }),
}));

function a1ToAddr(a1Text: string) {
  const m = String(a1Text || "").trim().toUpperCase().match(/^([A-Z]+)(\d+)$/);
  if (!m) return null;
  const colLetters = m[1];
  const rowNum = Number(m[2]);
  if (!Number.isFinite(rowNum)) return null;
  let col = 0;
  for (let i = 0; i < colLetters.length; i++) col = col * 26 + (colLetters.charCodeAt(i) - 64);
  return { r: rowNum - 1, c: col - 1 };
}
