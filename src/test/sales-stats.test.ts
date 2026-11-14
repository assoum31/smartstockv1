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

import { salesSummary as ss } from "@/lib/sales-stats";
import { it as it2, expect as ex2 } from "vitest";
it2("profit margin = profit / revenue × 100 and avg profit per ticket", () => {
  const r = ss([{ created_at: "2026-11-01", total_amount: 200, items: [{ barcode: "a", quantity: 2 }] }, { created_at: "2026-11-01", total_amount: 100, items: [{ barcode: "a", quantity: 1 }] }], [{ barcode: "a", purchase_price: 50 }], "", "");
  ex2(r.margin).toBe(50);
  ex2(r.avgProfit).toBe(75);
});
