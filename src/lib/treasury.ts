export type TreasuryKind = "versement" | "alimentation" | "deposit" | "withdrawal";

/** Safe balance: register→safe and deposits add, safe→register and withdrawals subtract. */
export function treasuryBalance(rows: { kind: string; amount: number | string }[]): number {
  return rows.reduce((n, r) => n + (r.kind === "versement" || r.kind === "deposit" ? 1 : r.kind === "alimentation" || r.kind === "withdrawal" ? -1 : 0) * Number(r.amount), 0);
}

type Amt = { amount: number | string; cash_session_id?: string | null };
export function cashSessionSummary(
  s: { id: string; opening_amount: number | string; closing_amount: number | string | null },
  d: {
    tickets: { total_amount: number | string; payment_method: string; cash_session_id: string | null }[];
    customerPayments: Amt[]; supplierPayments: Amt[]; expenses: Amt[];
    treasury: (Amt & { kind: string })[];
  },
) {
  const mine = <T extends { cash_session_id?: string | null }>(rows: T[]) => rows.filter((r) => r.cash_session_id === s.id);
  const sum = (rows: Amt[]) => rows.reduce((n, r) => n + Number(r.amount), 0);
  const t = mine(d.tickets);
  const sales = t.reduce((n, x) => n + Number(x.total_amount), 0);
  const cash = t.filter((x) => x.payment_method === "cash").reduce((n, x) => n + Number(x.total_amount), 0);
  const tr = mine(d.treasury);
  const expected = Number(s.opening_amount) + cash + sum(mine(d.customerPayments)) - sum(mine(d.supplierPayments)) - sum(mine(d.expenses))
    - sum(tr.filter((x) => x.kind === "versement")) + sum(tr.filter((x) => x.kind === "alimentation"));
  return { sales, cash, expected, diff: s.closing_amount == null ? null : Number(s.closing_amount) - expected };
}
