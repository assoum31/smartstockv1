// Groups an Excel sheet of goods-receipt lines into one receipt per (supplier, invoice number).

export interface ImportedReceipt {
  supplier: string;
  reference: string;
  items: { barcode: string; product_name: string; quantity: number; purchase_price: number; selling_price: number }[];
}

export const RECEIPT_TEMPLATE_HEADERS = ["المورد", "رقم الفاتورة", "الباركود", "اسم المنتج", "الكمية", "سعر الشراء", "سعر البيع"];

const norm = (k: string) => k.toLowerCase().replace(/[\s_\-\u064B-\u0652]/g, "");
const ALIASES: Record<keyof ImportedReceipt["items"][number] | "supplier" | "reference", string[]> = {
  supplier: ["المورد", "fournisseur", "supplier"],
  reference: ["رقمالفاتورة", "رقمالوصل", "facture", "nfacture", "reference", "ref", "invoice", "bon"],
  barcode: ["الباركود", "barcode", "codebarre", "code"],
  product_name: ["اسمالمنتج", "المنتج", "designation", "produit", "name", "nom"],
  quantity: ["الكمية", "quantite", "qte", "quantity", "qty"],
  purchase_price: ["سعرالشراء", "prixachat", "purchaseprice", "achat"],
  selling_price: ["سعرالبيع", "prixvente", "sellingprice", "vente"],
};

const num = (v: unknown) => {
  const n = Number(String(v ?? "").replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};

export function parseReceiptRows(rows: Record<string, unknown>[]): { receipts: ImportedReceipt[]; errors: string[] } {
  const errors: string[] = [];
  const map = new Map<string, ImportedReceipt>();
  rows.forEach((row, i) => {
    const get = (f: keyof typeof ALIASES) => {
      for (const [k, v] of Object.entries(row)) if (ALIASES[f].includes(norm(k))) return String(v ?? "").trim();
      return "";
    };
    const barcode = get("barcode");
    if (!barcode) return;
    const quantity = num(get("quantity"));
    if (!(quantity > 0)) return void errors.push(`السطر ${i + 2}: كمية غير صحيحة`);
    const supplier = get("supplier");
    const reference = get("reference");
    const key = `${supplier}\u0000${reference}`;
    const r = map.get(key) ?? { supplier, reference, items: [] };
    const pp = num(get("purchase_price"));
    const sp = num(get("selling_price"));
    const existing = r.items.find((x) => x.barcode === barcode);
    if (existing) existing.quantity += quantity;
    else r.items.push({ barcode, product_name: get("product_name"), quantity, purchase_price: pp >= 0 ? pp : 0, selling_price: sp >= 0 ? sp : 0 });
    map.set(key, r);
  });
  return { receipts: [...map.values()], errors };
}
