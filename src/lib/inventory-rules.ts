// Pure inventory rules, kept free of any network code so they can be tested.

export interface SnapshotRow {
  barcode: string;
  product_name: string;
  system_quantity: number;
}

export interface CountRow {
  barcode: string;
  product_name: string;
  counted_quantity: number;
  location: string | null;
}

export interface VarianceRow {
  barcode: string;
  product_name: string;
  system_quantity: number;
  counted_quantity: number;
  /** Sold through sales tickets during the session (left the shelf after the snapshot). */
  sold_quantity: number;
  /** What should be on the shelf now: snapshot stock minus session sales. */
  expected_quantity: number;
  variance: number;
  entries: number;
  locations: string[];
  in_snapshot: boolean;
}

/**
 * Variance is per product, not per line: a product counted on three shelves
 * is the sum of its three counts minus the system stock frozen at session start.
 * Products in the snapshot that nobody counted show their full stock as missing.
 */
export interface SaleRow {
  barcode: string;
  product_name: string;
  quantity: number;
}

/** Sales are deducted from the expected stock: variance = counted - (system - sold). */
export function computeVariances(
  snapshot: SnapshotRow[],
  counts: CountRow[],
  sales: SaleRow[] = [],
): VarianceRow[] {
  const rows = new Map<string, VarianceRow>();

  for (const s of snapshot) {
    rows.set(s.barcode, {
      barcode: s.barcode,
      product_name: s.product_name,
      system_quantity: Number(s.system_quantity) || 0,
      counted_quantity: 0,
      sold_quantity: 0,
      expected_quantity: 0,
      variance: 0,
      entries: 0,
      locations: [],
      in_snapshot: true,
    });
  }

  for (const c of counts) {
    let row = rows.get(c.barcode);
    if (!row) {
      row = {
        barcode: c.barcode,
        product_name: c.product_name,
        system_quantity: 0,
        counted_quantity: 0,
        sold_quantity: 0,
        expected_quantity: 0,
        variance: 0,
        entries: 0,
        locations: [],
        in_snapshot: false,
      };
      rows.set(c.barcode, row);
    }
    row.counted_quantity += Number(c.counted_quantity) || 0;
    row.entries += 1;
    const loc = (c.location ?? "").trim();
    if (loc && !row.locations.includes(loc)) row.locations.push(loc);
  }

  for (const sale of sales) {
    let row = rows.get(sale.barcode);
    if (!row) {
      row = {
        barcode: sale.barcode,
        product_name: sale.product_name,
        system_quantity: 0,
        counted_quantity: 0,
        sold_quantity: 0,
        expected_quantity: 0,
        variance: 0,
        entries: 0,
        locations: [],
        in_snapshot: false,
      };
      rows.set(sale.barcode, row);
    }
    row.sold_quantity += Number(sale.quantity) || 0;
  }

  for (const row of rows.values()) {
    row.counted_quantity = round(row.counted_quantity);
    row.sold_quantity = round(row.sold_quantity);
    row.expected_quantity = round(row.system_quantity - row.sold_quantity);
    row.variance = round(row.counted_quantity - row.expected_quantity);
  }

  return Array.from(rows.values()).sort(
    (a, b) =>
      Math.abs(b.variance) - Math.abs(a.variance) || a.product_name.localeCompare(b.product_name),
  );
}

function round(n: number) {
  return Math.round(n * 1000) / 1000;
}

/**
 * Barcodes are text: "000123" must stay "000123". Numbers coming from a
 * spreadsheet are written out in full (never 1.23E+12).
 */
export function normalizeBarcode(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "";
    return Number.isInteger(value) ? BigInt(Math.round(value)).toString() : String(value);
  }
  return String(value).replace(/\s+/g, "").trim();
}

export interface ProductImportRow {
  barcode: string;
  name: string;
  default_location: string | null;
  system_quantity: number;
}

export interface ProductImportResult {
  rows: ProductImportRow[];
  errors: { line: number; message: string }[];
}

const HEADER_ALIASES: Record<keyof ProductImportRow, string[]> = {
  barcode: [
    "barcode",
    "code",
    "code barre",
    "code-barre",
    "codebarre",
    "ean",
    "الباركود",
    "باركود",
  ],
  name: [
    "name",
    "nom",
    "article",
    "designation",
    "désignation",
    "product",
    "produit",
    "اسم المنتج",
    "المنتج",
    "الاسم",
  ],
  default_location: ["location", "emplacement", "default_location", "الموقع", "موقع"],
  system_quantity: [
    "system_quantity",
    "quantity",
    "quantite",
    "quantité",
    "qte",
    "stock",
    "الكمية",
    "الكمية النظامية",
    "المخزون",
  ],
};

function findKey(headers: string[], field: keyof ProductImportRow) {
  const aliases = HEADER_ALIASES[field];
  return headers.find((h) => aliases.includes(h.trim().toLowerCase()));
}

/** Validate spreadsheet rows (already read as text) before sending anything. */
export function parseProductRows(raw: Record<string, unknown>[]): ProductImportResult {
  const errors: ProductImportResult["errors"] = [];
  const byBarcode = new Map<string, ProductImportRow>();
  if (raw.length === 0) return { rows: [], errors: [{ line: 0, message: "الملف فارغ" }] };

  const headers = Object.keys(raw[0] ?? {});
  const kBarcode = findKey(headers, "barcode");
  const kName = findKey(headers, "name");
  const kLoc = findKey(headers, "default_location");
  const kQty = findKey(headers, "system_quantity");
  if (!kBarcode || !kName) {
    return {
      rows: [],
      errors: [{ line: 1, message: "يجب أن يحتوي الملف على عمودي الباركود واسم المنتج" }],
    };
  }

  raw.forEach((r, i) => {
    const line = i + 2; // header is line 1
    const barcode = normalizeBarcode(r[kBarcode]);
    const name = String(r[kName] ?? "").trim();
    if (!barcode && !name) return; // blank line
    if (!barcode) return void errors.push({ line, message: "باركود فارغ" });
    if (!name) return void errors.push({ line, message: `اسم المنتج فارغ (${barcode})` });
    let qty = 0;
    if (kQty) {
      const rawQty = String(r[kQty] ?? "")
        .replace(",", ".")
        .trim();
      if (rawQty !== "") {
        qty = Number(rawQty);
        if (!Number.isFinite(qty))
          return void errors.push({ line, message: `كمية غير صالحة (${barcode})` });
      }
    }
    const loc = kLoc ? String(r[kLoc] ?? "").trim() : "";
    byBarcode.set(barcode, { barcode, name, default_location: loc || null, system_quantity: qty });
  });

  return { rows: Array.from(byBarcode.values()), errors };
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export interface ProgressCount {
  barcode: string;
  counted_quantity: number;
  counted_by: string | null;
  counted_by_name: string;
  counted_at: string;
}

export interface ProgressMember {
  id: string;
  full_name: string;
  username: string;
}

export interface WorkerProgressRow {
  id: string;
  name: string;
  username: string | null;
  lines: number;
  quantity: number;
  products: number;
  lastScanAt: string | null;
  /** Scanned within the last ACTIVE_WINDOW_MINUTES. */
  active: boolean;
}

export const ACTIVE_WINDOW_MINUTES = 10;

/**
 * Per-person progress in one session. Every store member appears, even with no
 * scans yet, so the manager sees who hasn't started. Busiest first.
 */
export function workerProgress(
  counts: ProgressCount[],
  members: ProgressMember[],
  now: number = Date.now(),
): WorkerProgressRow[] {
  const rows = new Map<string, WorkerProgressRow & { barcodes: Set<string> }>();
  for (const m of members) {
    rows.set(m.id, {
      id: m.id,
      name: m.full_name,
      username: m.username,
      lines: 0,
      quantity: 0,
      products: 0,
      lastScanAt: null,
      active: false,
      barcodes: new Set(),
    });
  }
  for (const c of counts) {
    const key = c.counted_by ?? `name:${c.counted_by_name}`;
    let row = rows.get(key);
    if (!row) {
      row = {
        id: key,
        name: c.counted_by_name,
        username: null,
        lines: 0,
        quantity: 0,
        products: 0,
        lastScanAt: null,
        active: false,
        barcodes: new Set(),
      };
      rows.set(key, row);
    }
    row.lines += 1;
    row.quantity += Number(c.counted_quantity) || 0;
    row.barcodes.add(c.barcode);
    if (!row.lastScanAt || c.counted_at > row.lastScanAt) row.lastScanAt = c.counted_at;
  }
  const windowMs = ACTIVE_WINDOW_MINUTES * 60 * 1000;
  return Array.from(rows.values())
    .map(({ barcodes, ...r }) => ({
      ...r,
      products: barcodes.size,
      active: r.lastScanAt !== null && now - new Date(r.lastScanAt).getTime() <= windowMs,
    }))
    .sort((a, b) => b.lines - a.lines || a.name.localeCompare(b.name));
}
