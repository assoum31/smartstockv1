import { filterByQuery } from "@/lib/store-rules";

/** Minimal shape a stock row needs: name, barcodes and the quantity on the shelf. */
export type StockRow = {
  barcode: string;
  name: string;
  famille: string | null;
  system_quantity: number;
  selling_price: number;
  alt_barcodes?: string[] | null;
};

export type StockSort = "qty" | "value" | "name";

/**
 * The items physically present in the store: quantity above zero, unless the
 * caller explicitly asks to see the out-of-stock ones too. Search covers the
 * name, the main barcode, alternate barcodes and the family.
 */
export function currentStockRows<T extends StockRow>(
  all: T[],
  opts: { q?: string; famille?: string; showZero?: boolean; sort?: StockSort } = {},
): T[] {
  const { q = "", famille = "", showZero = false, sort = "qty" } = opts;
  const rows = all.filter((p) => showZero || Number(p.system_quantity) > 0);
  const found = filterByQuery(rows, q).filter((p) => !famille || p.famille === famille);
  return found.sort((a, b) =>
    sort === "name"
      ? a.name.localeCompare(b.name, ["ar", "fr"])
      : sort === "value"
        ? Number(b.system_quantity) * Number(b.selling_price) - Number(a.system_quantity) * Number(a.selling_price)
        : Number(b.system_quantity) - Number(a.system_quantity),
  );
}
