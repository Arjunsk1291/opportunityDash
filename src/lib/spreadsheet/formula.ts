import { cellKey, parseA1 } from "./utils";
import type { Cell } from "./types";

type EvalResult = { value: unknown; error?: string };

function toNumber(v: unknown) {
  if (v === null || v === undefined) return NaN;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : NaN;
}

function asBool(v: unknown) {
  if (typeof v === "boolean") return v;
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return false;
  if (s === "true" || s === "yes") return true;
  if (s === "false" || s === "no") return false;
  const n = toNumber(v);
  return Number.isFinite(n) ? n !== 0 : Boolean(s);
}

function splitArgs(argText: string) {
  const out: string[] = [];
  let depth = 0;
  let buf = "";
  for (let i = 0; i < argText.length; i++) {
    const ch = argText[i];
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(buf.trim());
      buf = "";
    } else {
      buf += ch;
    }
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

function evalRef(ref: string, cells: Record<string, Cell>, stack: Set<string>): EvalResult {
  const addr = parseA1(ref);
  if (!addr) return { value: "" };
  return evaluateCell(addr.r, addr.c, cells, stack);
}

function evalRange(range: string, cells: Record<string, Cell>, stack: Set<string>): EvalResult[] {
  const [a, b] = range.split(":").map((s) => s.trim());
  const A = parseA1(a);
  const B = parseA1(b);
  if (!A || !B) return [];
  const r1 = Math.min(A.r, B.r);
  const r2 = Math.max(A.r, B.r);
  const c1 = Math.min(A.c, B.c);
  const c2 = Math.max(A.c, B.c);
  const out: EvalResult[] = [];
  for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) out.push(evaluateCell(r, c, cells, stack));
  return out;
}

function evalAtom(token: string, cells: Record<string, Cell>, stack: Set<string>): EvalResult {
  const t = token.trim();
  if (!t) return { value: "" };
  if (t.startsWith('"') && t.endsWith('"')) return { value: t.slice(1, -1) };
  if (/^[A-Z]+[0-9]+$/i.test(t)) return evalRef(t, cells, stack);
  if (/^[A-Z]+[0-9]+:[A-Z]+[0-9]+$/i.test(t)) {
    // Range in scalar context: return first cell.
    const vals = evalRange(t, cells, stack);
    return vals[0] || { value: "" };
  }
  const n = toNumber(t);
  if (Number.isFinite(n)) return { value: n };
  if (t.toUpperCase() === "TRUE") return { value: true };
  if (t.toUpperCase() === "FALSE") return { value: false };
  return { value: t };
}

function evalFunction(fn: string, args: string[], cells: Record<string, Cell>, stack: Set<string>): EvalResult {
  const name = fn.toUpperCase();
  const evalArgs = () => args.map((a) => evalExpr(a, cells, stack));
  const flatNums = (items: EvalResult[]) => items.map((x) => toNumber(x.value)).filter((n) => Number.isFinite(n));
  const flatVals = (items: EvalResult[]) => items.map((x) => x.value);

  if (name === "SUM") {
    const items: EvalResult[] = [];
    for (const a of args) {
      if (/^[A-Z]+[0-9]+:[A-Z]+[0-9]+$/i.test(a.trim())) items.push(...evalRange(a, cells, stack));
      else items.push(evalExpr(a, cells, stack));
    }
    return { value: flatNums(items).reduce((p, n) => p + n, 0) };
  }
  if (name === "AVERAGE") {
    const items: EvalResult[] = [];
    for (const a of args) {
      if (/^[A-Z]+[0-9]+:[A-Z]+[0-9]+$/i.test(a.trim())) items.push(...evalRange(a, cells, stack));
      else items.push(evalExpr(a, cells, stack));
    }
    const nums = flatNums(items);
    return { value: nums.length ? nums.reduce((p, n) => p + n, 0) / nums.length : 0 };
  }
  if (name === "COUNT") return { value: flatNums(evalArgs()).length };
  if (name === "COUNTA") return { value: flatVals(evalArgs()).filter((v) => String(v ?? "").trim() !== "").length };
  if (name === "MIN") {
    const nums = flatNums(evalArgs());
    return { value: nums.length ? Math.min(...nums) : 0 };
  }
  if (name === "MAX") {
    const nums = flatNums(evalArgs());
    return { value: nums.length ? Math.max(...nums) : 0 };
  }
  if (name === "IF") {
    const [cond, a, b] = args;
    const c = evalExpr(cond ?? "", cells, stack);
    return asBool(c.value) ? evalExpr(a ?? "", cells, stack) : evalExpr(b ?? "", cells, stack);
  }
  if (name === "AND") return { value: evalArgs().every((x) => asBool(x.value)) };
  if (name === "OR") return { value: evalArgs().some((x) => asBool(x.value)) };
  if (name === "CONCAT") return { value: evalArgs().map((x) => String(x.value ?? "")).join("") };
  if (name === "ROUND") {
    const v = evalExpr(args[0] ?? "", cells, stack);
    const d = evalExpr(args[1] ?? "0", cells, stack);
    const n = toNumber(v.value);
    const dp = Math.max(0, Math.min(10, Math.trunc(toNumber(d.value) || 0)));
    if (!Number.isFinite(n)) return { value: 0 };
    const m = 10 ** dp;
    return { value: Math.round(n * m) / m };
  }
  if (name === "ABS") {
    const n = toNumber(evalExpr(args[0] ?? "", cells, stack).value);
    return { value: Number.isFinite(n) ? Math.abs(n) : 0 };
  }
  if (name === "LEN") return { value: String(evalExpr(args[0] ?? "", cells, stack).value ?? "").length };
  if (name === "LOWER") return { value: String(evalExpr(args[0] ?? "", cells, stack).value ?? "").toLowerCase() };
  if (name === "UPPER") return { value: String(evalExpr(args[0] ?? "", cells, stack).value ?? "").toUpperCase() };
  if (name === "TRIM") return { value: String(evalExpr(args[0] ?? "", cells, stack).value ?? "").trim() };
  if (name === "NOW") return { value: new Date().toISOString() };
  if (name === "TODAY") return { value: new Date().toISOString().slice(0, 10) };
  return { value: "#NAME?" };
}

function evalExpr(expr: string, cells: Record<string, Cell>, stack: Set<string>): EvalResult {
  const text = String(expr ?? "").trim();
  if (!text) return { value: "" };

  // Function call: NAME(...)
  const fnMatch = text.match(/^([A-Z_][A-Z0-9_]*)\((.*)\)$/i);
  if (fnMatch) {
    const [, fn, inner] = fnMatch;
    return evalFunction(fn, splitArgs(inner), cells, stack);
  }

  // Simple binary operators: + - * / (no precedence beyond left-to-right for now).
  const opMatch = text.match(/^(.+?)([+\-*/])(.+)$/);
  if (opMatch) {
    const left = evalExpr(opMatch[1], cells, stack);
    const right = evalExpr(opMatch[3], cells, stack);
    const a = toNumber(left.value);
    const b = toNumber(right.value);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return { value: "#VALUE!" };
    switch (opMatch[2]) {
      case "+": return { value: a + b };
      case "-": return { value: a - b };
      case "*": return { value: a * b };
      case "/": return { value: b === 0 ? "#DIV/0!" : a / b };
    }
  }

  return evalAtom(text, cells, stack);
}

export function evaluateCell(r: number, c: number, cells: Record<string, Cell>, stack = new Set<string>()): EvalResult {
  const key = cellKey(r, c);
  if (stack.has(key)) return { value: "#CYCLE!" };
  const cell = cells[key];
  if (!cell) return { value: "" };
  const raw = String(cell.value ?? "");
  if (!raw.startsWith("=")) return { value: raw };
  stack.add(key);
  try {
    return evalExpr(raw.slice(1), cells, stack);
  } catch {
    return { value: "#ERROR" };
  } finally {
    stack.delete(key);
  }
}

