import ExcelJS from 'exceljs';

const DANGEROUS_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

const normalizeHeader = (value: unknown) => String(value ?? '').trim();

const safeAssign = (target: Record<string, unknown>, key: string, value: unknown) => {
  const normalizedKey = String(key || '').trim();
  if (!normalizedKey || DANGEROUS_KEYS.has(normalizedKey)) return;
  target[normalizedKey] = value ?? '';
};

export const loadWorkbookFromArrayBuffer = async (buffer: ArrayBuffer) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  return workbook;
};

export const getFirstWorksheet = (workbook: ExcelJS.Workbook) => workbook.worksheets[0] || null;

export const worksheetToObjects = (
  worksheet: ExcelJS.Worksheet,
  options?: { headerRow?: number; maxRows?: number }
) => {
  const headerRowNumber = Math.max(1, Number(options?.headerRow || 1));
  const maxRows = Math.max(1, Number(options?.maxRows || 10000));
  const headerRow = worksheet.getRow(headerRowNumber);
  const maxColumns = Math.max(worksheet.actualColumnCount, headerRow.cellCount || 0);
  const headers: string[] = [];

  for (let col = 1; col <= maxColumns; col += 1) {
    headers[col] = normalizeHeader(headerRow.getCell(col).value);
  }

  const rows: Record<string, unknown>[] = [];
  const lastRow = Math.min(worksheet.rowCount, headerRowNumber + maxRows);
  for (let rowNo = headerRowNumber + 1; rowNo <= lastRow; rowNo += 1) {
    const row = worksheet.getRow(rowNo);
    const output: Record<string, unknown> = Object.create(null);
    let hasData = false;

    for (let col = 1; col <= maxColumns; col += 1) {
      const header = headers[col];
      if (!header) continue;
      const cellValue = row.getCell(col).value as unknown;
      const normalizedValue = cellValue ?? '';
      if (String(normalizedValue).trim() !== '') hasData = true;
      safeAssign(output, header, normalizedValue);
    }

    if (hasData) rows.push(output);
  }

  if (worksheet.rowCount > headerRowNumber + maxRows) {
    throw new Error(`Too many rows (${worksheet.rowCount - headerRowNumber}). Limit is ${maxRows}.`);
  }

  return rows;
};

export const worksheetToMatrix = (
  worksheet: ExcelJS.Worksheet,
  options?: { maxRows?: number; maxColumns?: number }
) => {
  const maxRows = Math.max(1, Number(options?.maxRows || 10000));
  const maxColumns = Math.max(1, Number(options?.maxColumns || Math.max(worksheet.actualColumnCount || 1, 1)));
  if (worksheet.rowCount > maxRows) {
    throw new Error(`Too many rows (${worksheet.rowCount}). Limit is ${maxRows}.`);
  }

  const matrix: unknown[][] = [];
  for (let rowNo = 1; rowNo <= worksheet.rowCount; rowNo += 1) {
    const row = worksheet.getRow(rowNo);
    const values: unknown[] = [];
    for (let col = 1; col <= maxColumns; col += 1) {
      values.push((row.getCell(col).value as unknown) ?? '');
    }
    matrix.push(values);
  }
  return matrix;
};

export const downloadWorkbook = async (workbook: ExcelJS.Workbook, filename: string) => {
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

