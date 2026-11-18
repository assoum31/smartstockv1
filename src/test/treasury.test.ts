import { describe, expect, it } from "vitest";
import { cashSessionSummary, treasuryBalance } from "@/lib/treasury";

describe("treasury", () => {
  it("versement and deposit add to the safe, alimentation and withdrawal subtract", () => {
    expect(treasuryBalance([{ kind: "versement", amount: 5000 }, { kind: "deposit", amount: 1000 }, { kind: "alimentation", amount: 2000 }, { kind: "withdrawal", amount: 500 }])).toBe(3500);
  });
  it("register difference = declared − (opening + cash sales − versement + alimentation)", () => {
    const r = cashSessionSummary({ id: "c", opening_amount: 1000, closing_amount: 2400 }, {
      tickets: [{ total_amount: 3000, payment_method: "cash", cash_session_id: "c" }, { total_amount: 900, payment_method: "card", cash_session_id: "c" }],
      customerPayments: [], supplierPayments: [], expenses: [],
      treasury: [{ kind: "versement", amount: 2000, cash_session_id: "c" }, { kind: "alimentation", amount: 500, cash_session_id: "c" }],
    });
    expect(r.expected).toBe(2500);
    expect(r.diff).toBe(-100);
    expect(r.sales).toBe(3900);
  });
});
