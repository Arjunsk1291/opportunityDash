import type { CellAddr } from "./types";

export function cellKey(r: number, c: number) {
  return `${r},${c}`;
}

export function colLetter(c: number) {
  let n = c + 1;
  let s = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export function a1(r: number, c: number) {
  return `${colLetter(c)}${r + 1}`;
}

export function parseA1(addr: string): CellAddr | null {
  const m = String(addr || "").trim().toUpperCase().match(/^([A-Z]+)(\d+)$/);
  if (!m) return null;
  const letters = m[1];
  const row = Number(m[2]);
  if (!Number.isFinite(row) || row < 1) return null;
  let col = 0;
  for (let i = 0; i < letters.length; i++) col = col * 26 + (letters.charCodeAt(i) - 64);
  return { r: row - 1, c: col - 1 };
}

export function normalizeRange(a: CellAddr, b: CellAddr) {
  const r1 = Math.min(a.r, b.r);
  const r2 = Math.max(a.r, b.r);
  const c1 = Math.min(a.c, b.c);
  const c2 = Math.max(a.c, b.c);
  return { r1, r2, c1, c2 };
}

export function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

export function tsvToMatrix(text: string) {
  const rows = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  // Trim trailing empty rows.
  while (rows.length && rows[rows.length - 1] === "") rows.pop();
  return rows.map((line) => line.split(/\t|,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((v) => v.replace(/^"|"$/g, "")));
}

