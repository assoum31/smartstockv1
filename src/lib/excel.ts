// Excel helpers. The spreadsheet library is loaded only when needed.

export const MAX_EXCEL_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_EXCEL_ROWS = 20_000;

export function assertExcelLimits(fileSize: number, rowCount = 0) {
  if (fileSize > MAX_EXCEL_FILE_BYTES)
    throw new Error("حجم الملف أكبر من 5 ميغابايت. اختر ملفاً أصغر.");
  if (rowCount > MAX_EXCEL_ROWS)
    throw new Error("الملف يحتوي على أكثر من 20000 سطر. قسّمه إلى ملفات أصغر.");
}

/** Read the first sheet as rows of text, so barcodes keep their leading zeros. */
export async function readSheetAsText(file: File): Promise<Record<string, unknown>[]> {
  assertExcelLimits(file.size);
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", raw: false, cellText: true, cellDates: false });
  const sheet = wb.Sheets[wb.SheetNames[0]!];
  if (!sheet) return [];
  // raw:false returns the formatted text of each cell ("000123", not 123)
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { raw: false, defval: "" });
  assertExcelLimits(file.size, rows.length);
  return rows;
}

export interface SheetSpec {
  name: string;
  headers: string[];
  rows: (string | number | null)[][];
  /** indexes of columns that must be written as text (barcodes) */
  textColumns?: number[];
}

export async function downloadWorkbook(filename: string, sheets: SheetSpec[]) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  for (const spec of sheets) {
    const ws = XLSX.utils.aoa_to_sheet([spec.headers, ...spec.rows]);
    for (const col of spec.textColumns ?? []) {
      for (let r = 1; r <= spec.rows.length; r++) {
        const ref = XLSX.utils.encode_cell({ r, c: col });
        const cell = ws[ref];
        if (cell) {
          cell.t = "s";
          cell.v = String(cell.v ?? "");
          cell.z = "@";
        }
      }
    }
    ws["!cols"] = spec.headers.map((h, i) => ({ wch: Math.max(h.length + 4, i === 0 ? 18 : 12) }));
    XLSX.utils.book_append_sheet(wb, ws, spec.name.slice(0, 31));
  }
  XLSX.writeFile(wb, filename);
}
