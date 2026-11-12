import { describe, expect, it } from "vitest";
import { parseReceiptRows } from "@/lib/receipt-import";

describe("parseReceiptRows", () => {
  it("groups lines into one receipt per supplier + invoice number", () => {
    const { receipts } = parseReceiptRows([
      { "المورد": "A", "رقم الفاتورة": "F1", "الباركود": "1", "الكمية": "2", "سعر الشراء": "10" },
      { "المورد": "A", "رقم الفاتورة": "F1", "الباركود": "2", "الكمية": "3" },
      { "المورد": "B", "رقم الفاتورة": "F9", "الباركود": "1", "الكمية": "1" },
    ]);
    expect(receipts).toHaveLength(2);
    expect(receipts[0]!.items).toHaveLength(2);
    expect(receipts[0]!.items[0]!.purchase_price).toBe(10);
  });
  it("rejects lines with zero quantity", () => {
    const r = parseReceiptRows([{ barcode: "1", qty: "0" }]);
    expect(r.receipts).toHaveLength(0);
    expect(r.errors).toHaveLength(1);
  });
});
