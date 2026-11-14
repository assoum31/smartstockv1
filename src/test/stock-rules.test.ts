import { describe, expect, it } from "vitest";
import { currentStockRows } from "@/lib/stock-rules";

const rows = [
  { barcode: "111", name: "VIS 4*50", famille: "Visserie", system_quantity: 48, selling_price: 5, alt_barcodes: ["111B"] },
  { barcode: "222", name: "SUPPORT 3 POSITION", famille: "Support", system_quantity: 0, selling_price: 450, alt_barcodes: [] },
  { barcode: "333", name: "PC3212", famille: "Support", system_quantity: 4, selling_price: 90, alt_barcodes: null },
];

describe("current stock list", () => {
  it("lists only the items that are actually on the shelf", () => {
    expect(currentStockRows(rows).map((r) => r.barcode)).toEqual(["111", "333"]);
  });
  it("sorts by quantity descending by default", () => {
    expect(currentStockRows(rows).map((r) => Number(r.system_quantity))).toEqual([48, 4]);
  });
  it("includes out-of-stock items only when asked", () => {
    expect(currentStockRows(rows, { showZero: true }).map((r) => r.barcode)).toEqual(["111", "333", "222"]);
  });
  it("sorts by stock value at selling price when asked", () => {
    expect(currentStockRows(rows, { sort: "value" }).map((r) => r.barcode)).toEqual(["333", "111"]);
  });
  it("sorts by name when asked", () => {
    expect(currentStockRows(rows, { sort: "name" }).map((r) => r.barcode)).toEqual(["333", "111"]);
  });
  it("searches by name, main barcode and alternate barcode", () => {
    expect(currentStockRows(rows, { q: "111B" }).map((r) => r.barcode)).toEqual(["111"]);
    expect(currentStockRows(rows, { q: "vis" }).map((r) => r.barcode)).toEqual(["111"]);
    expect(currentStockRows(rows, { q: "333" }).map((r) => r.barcode)).toEqual(["333"]);
  });
  it("drops the out-of-stock item even when the search matches it", () => {
    expect(currentStockRows(rows, { q: "support" }).map((r) => r.barcode)).toEqual(["333"]);
  });
  it("filters by family", () => {
    expect(currentStockRows(rows, { famille: "Support" }).map((r) => r.barcode)).toEqual(["333"]);
  });
});
