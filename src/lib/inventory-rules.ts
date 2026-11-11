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
  counted_at?: string | null;
}

export interface VarianceRow {
  barcode: string;
  product_name: string;
  system_quantity: number;
  counted_quantity: number;
  /** Sold through sales tickets during the session (left the shelf after the snapshot). */
  sold_quantity: number;
  /** Part of the sales taken off the count: only products already counted, sold after their count. */
  deducted_quantity: number;
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
  /** When the ticket was made. Missing = treated as sold after counting. */
  sold_at?: string | null;
}

/** Variance = counted − sales made after the product was counted; uncounted products deduct nothing. */
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
      deducted_quantity: 0,
      expected_quantity: 0,
      variance: 0,
      entries: 0,
      locations: [],
      in_snapshot: true,
    });
  }

  const firstCount = new Map<string, number>();
  for (const c of counts) {
    const t = c.counted_at ? new Date(c.counted_at).getTime() : NaN;
    if (Number.isFinite(t)) {
      const prev = firstCount.get(c.barcode);
      if (prev === undefined || t < prev) firstCount.set(c.barcode, t);
    }
    let row = rows.get(c.barcode);
    if (!row) {
      row = {
        barcode: c.barcode,
        product_name: c.product_name,
        system_quantity: 0,
        counted_quantity: 0,
        sold_quantity: 0,
        deducted_quantity: 0,
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
        deducted_quantity: 0,
        expected_quantity: 0,
        variance: 0,
        entries: 0,
        locations: [],
        in_snapshot: false,
      };
      rows.set(sale.barcode, row);
    }
    // Sales may be stored as -10 or 10: always treat them as a positive amount sold.
    const qty = Math.abs(Number(sale.quantity) || 0);
    row.sold_quantity += qty;
    // Uncounted product: nothing to deduct. Counted: deduct only what left the shelf after the count.
    if (row.entries === 0) continue;
    const countedAt = firstCount.get(sale.barcode);
    const soldAt = sale.sold_at ? new Date(sale.sold_at).getTime() : NaN;
    if (countedAt === undefined || !Number.isFinite(soldAt) || soldAt >= countedAt)
      row.deducted_quantity += qty;
  }

  for (const row of rows.values()) {
    row.counted_quantity = round(row.counted_quantity);
    row.sold_quantity = round(row.sold_quantity);
    row.deducted_quantity = round(row.deducted_quantity);
    row.expected_quantity = round(row.system_quantity - row.sold_quantity);
    // Variance = counted − sales made after the count (e.g. counted 90, sold 20 later → 70).
    row.variance = round(row.counted_quantity - row.deducted_quantity);
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
  purchase_price: number;
  selling_price: number;
  carton_size: number;
  alt_barcodes: string[];
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
  purchase_price: ["purchase_price", "prix achat", "prix_achat", "prix d'achat", "cost", "سعر الشراء"],
  selling_price: ["selling_price", "prix vente", "prix_vente", "prix de vente", "price", "prix", "سعر البيع"],
  carton_size: ["carton_size", "colisage", "carton", "pack", "سعة الكرتون", "الكرتون"],
  alt_barcodes: ["alt_barcodes", "codes alternatifs", "barcodes", "باركودات بديلة", "باركود بديل"],
};

/** Split "a, b; c" into clean alternate barcodes, without the main one. */
export function parseAltBarcodes(value: unknown, main = ""): string[] {
  const out = String(value ?? "")
    .split(/[,;|\s]+/)
    .map((b) => b.trim())
    .filter((b) => b && b !== main);
  return Array.from(new Set(out));
}

/** Find a product by its main or any alternate barcode. */
export function findProductByBarcode<
  T extends { barcode: string; alt_barcodes?: string[] | null },
>(products: T[], code: string): T | undefined {
  const c = code.trim();
  if (!c) return undefined;
  return products.find((p) => p.barcode === c) ?? products.find((p) => p.alt_barcodes?.includes(c));
}

/** Money value of variances at purchase price: shortage (negative rows) and surplus. */
export function varianceValue(
  rows: { barcode: string; variance: number; entries: number }[],
  purchasePrice: Map<string, number>,
) {
  let shortage = 0;
  let surplus = 0;
  for (const r of rows) {
    if (r.entries === 0) continue;
    const v = r.variance * (purchasePrice.get(r.barcode) ?? 0);
    if (v < 0) shortage += -v;
    else surplus += v;
  }
  return { shortage: Math.round(shortage * 100) / 100, surplus: Math.round(surplus * 100) / 100 };
}

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
  const kBuy = findKey(headers, "purchase_price");
  const kSell = findKey(headers, "selling_price");
  const kCarton = findKey(headers, "carton_size");
  const kAlt = findKey(headers, "alt_barcodes");
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
    const price = (k: string | undefined) => {
      if (!k) return 0;
      const v = String(r[k] ?? "").replace(/\s/g, "").replace(",", ".");
      return v === "" ? 0 : Number(v);
    };
    const purchase_price = price(kBuy);
    const selling_price = price(kSell);
    if (!Number.isFinite(purchase_price) || purchase_price < 0 || !Number.isFinite(selling_price) || selling_price < 0)
      return void errors.push({ line, message: `سعر غير صالح (${barcode})` });
    const loc = kLoc ? String(r[kLoc] ?? "").trim() : "";
    byBarcode.set(barcode, {
      barcode,
      name,
      default_location: loc || null,
      system_quantity: qty,
      purchase_price,
      selling_price,
      carton_size: kCarton && price(kCarton) > 0 ? price(kCarton) : 1,
      alt_barcodes: kAlt ? parseAltBarcodes(r[kAlt], barcode) : [],
    });
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

export interface SalesImportTicket {
  ref: string;
  sold_at: string | null;
  notes: string | null;
  items: { barcode: string; product_name: string; quantity: number; unit_price: number }[];
}

const SALES_ALIASES = {
  ticket: ["ticket", "bon", "n bon", "numero", "ticket_no", "رقم البون", "البون"],
  barcode: HEADER_ALIASES.barcode,
  name: HEADER_ALIASES.name,
  quantity: ["quantity", "quantite", "quantité", "qte", "الكمية", "الكمية المباعة"],
  unit_price: ["unit_price", "prix", "price", "prix unitaire", "سعر الوحدة", "سعر البيع", "السعر"],
  date: ["date", "sold_at", "datetime", "التاريخ", "الوقت", "وقت البيع"],
  notes: ["note", "notes", "remarque", "ملاحظة"],
};

/** Parse a detailed sales sheet: rows sharing a ticket number become one multi-product ticket. */
export function parseSalesRows(
  raw: Record<string, unknown>[],
  prices: Map<string, { name: string; price: number }> = new Map(),
): { tickets: SalesImportTicket[]; errors: { line: number; message: string }[] } {
  const errors: { line: number; message: string }[] = [];
  if (raw.length === 0) return { tickets: [], errors: [{ line: 0, message: "الملف فارغ" }] };
  const headers = Object.keys(raw[0] ?? {});
  const key = (f: keyof typeof SALES_ALIASES) =>
    headers.find((h) => SALES_ALIASES[f].includes(h.trim().toLowerCase()));
  const k = {
    ticket: key("ticket"),
    barcode: key("barcode"),
    name: key("name"),
    quantity: key("quantity"),
    unit_price: key("unit_price"),
    date: key("date"),
    notes: key("notes"),
  };
  if (!k.barcode || !k.quantity)
    return { tickets: [], errors: [{ line: 1, message: "يجب أن يحتوي الملف على عمودي الباركود والكمية" }] };
  const tickets = new Map<string, SalesImportTicket>();
  const num = (v: unknown) => Number(String(v ?? "").replace(/\s/g, "").replace(",", "."));
  raw.forEach((r, i) => {
    const line = i + 2;
    const barcode = normalizeBarcode(r[k.barcode!]);
    const qtyText = String(r[k.quantity!] ?? "").trim();
    if (!barcode && !qtyText) return;
    if (!barcode) return void errors.push({ line, message: "باركود فارغ" });
    const quantity = Math.abs(num(qtyText));
    if (!Number.isFinite(quantity) || quantity <= 0)
      return void errors.push({ line, message: `كمية غير صالحة (${barcode})` });
    const known = prices.get(barcode);
    const priceText = k.unit_price ? String(r[k.unit_price] ?? "").trim() : "";
    const unit_price = priceText === "" ? (known?.price ?? 0) : num(priceText);
    if (!Number.isFinite(unit_price) || unit_price < 0)
      return void errors.push({ line, message: `سعر غير صالح (${barcode})` });
    let sold_at: string | null = null;
    const dateText = k.date ? String(r[k.date] ?? "").trim() : "";
    if (dateText) {
      const d = new Date(dateText.replace(" ", "T"));
      if (Number.isNaN(d.getTime())) return void errors.push({ line, message: `تاريخ غير صالح (${dateText})` });
      sold_at = d.toISOString();
    }
    const ref = (k.ticket ? String(r[k.ticket] ?? "").trim() : "") || `__line${line}`;
    let t = tickets.get(ref);
    if (!t) {
      t = { ref, sold_at, notes: null, items: [] };
      tickets.set(ref, t);
    }
    if (!t.sold_at && sold_at) t.sold_at = sold_at;
    const note = k.notes ? String(r[k.notes] ?? "").trim() : "";
    if (note && !t.notes) t.notes = note;
    const name = (k.name ? String(r[k.name] ?? "").trim() : "") || known?.name || barcode;
    t.items.push({ barcode, product_name: name, quantity, unit_price });
  });
  return { tickets: Array.from(tickets.values()), errors };
}
