export const HEADER_HEIGHT = 28;
export const HEADER_WIDTH = 48;
export const DEFAULT_ROW_HEIGHT = 24;
export const DEFAULT_COL_WIDTH = 100;

export type Align = "left" | "center" | "right";

export type CellFormat = {
  bg?: string;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  align?: Align;
  wrap?: boolean;
};

export type Cell = {
  value: string;
  format?: CellFormat;
};

export type CellAddr = { r: number; c: number };

export type Merge = { r1: number; c1: number; r2: number; c2: number };

export type SheetFilter = { column: number; query: string };
export type SheetSort = { column: number; dir: "asc" | "desc" } | null;

export type Sheet = {
  id: string;
  name: string;
  rowCount: number;
  colCount: number;
  freezeRows: number;
  freezeCols: number;
  cells: Record<string, Cell>;
  merges: Merge[];
  colWidths: Record<number, number>;
  rowHeights: Record<number, number>;
  hiddenRows: Record<number, boolean>;
  hiddenCols: Record<number, boolean>;
  filters: SheetFilter[];
  sort: SheetSort;
};

export type Workbook = {
  activeSheetId: string;
  sheets: Sheet[];
};

