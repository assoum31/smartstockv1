import { describe, expect, it } from "vitest";
import { salesSummary } from "@/lib/sales-stats";

describe("salesSummary", () => {
  it("profit is revenue minus purchase cost, within dates", () => {
    const s = salesSummary(
      [
        { created_at: "2026-11-10T10:00:00Z", total_amount: 1000, items: [{ barcode: "A", quantity: 2 }] },
        { created_at: "2026-10-01T10:00:00Z", total_amount: 500, items: [{ barcode: "A", quantity: 1 }] },
      ],
      [{ barcode: "A", purchase_price: 300 }],
      "2026-11-01",
      "2026-11-30",
    );
    expect(s.revenue).toBe(1000);
    expect(s.cost).toBe(600);
    expect(s.profit).toBe(400);
    expect(s.tickets).toBe(1);
  });
});
