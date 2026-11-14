export const STORE_COLORS = [
  { label: "زمردي", value: "#047857" },
  { label: "أزرق", value: "#1d4ed8" },
  { label: "أحمر", value: "#b91c1c" },
  { label: "برتقالي", value: "#c2410c" },
  { label: "بنفسجي", value: "#6d28d9" },
  { label: "أسود", value: "#111827" },
];

/** Parse "a, b;c" into unique barcodes, excluding the product itself. Max 12. */
export function parseRelated(text: string, self: string): string[] {
  return [...new Set(text.split(/[,;\s]+/).map((s) => s.trim()).filter((s) => s && s !== self))].slice(0, 12);
}

type Sug = { barcode: string; famille: string | null; related?: string[] | null };
/** Manual picks first, then same-family items, never the item itself or ones already in the cart. */
export function suggestFor<T extends Sug>(item: T, all: T[], exclude: Set<string>, limit = 6): T[] {
  const by = new Map(all.map((x) => [x.barcode, x]));
  const out: T[] = [];
  const add = (x: T | undefined) => { if (x && x.barcode !== item.barcode && !exclude.has(x.barcode) && !out.includes(x)) out.push(x); };
  for (const b of item.related ?? []) add(by.get(b));
  if (item.famille) for (const x of all) { if (out.length >= limit) break; if (x.famille === item.famille) add(x); }
  return out.slice(0, limit);
}

/** Alphabetical (Arabic/French aware) name matches for the search dropdown. */
export function searchByName<T extends { name: string }>(all: T[], q: string, limit = 10): T[] {
  const s = q.trim().toLowerCase();
  if (!s) return [];
  return all.filter((x) => x.name.toLowerCase().includes(s)).sort((a, b) => a.name.localeCompare(b.name, ["ar", "fr"])).slice(0, limit);
}
