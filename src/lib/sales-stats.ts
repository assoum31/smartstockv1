type Ticket = { created_at: string; total_amount: number | string; items: { barcode: string; quantity: number | string }[] };
type Prod = { barcode: string; purchase_price: number | string };

/** Revenue = ticket totals (after discount); cost = qty × current purchase price; profit = revenue − cost. */
export function salesSummary(tickets: Ticket[], products: Prod[], from: string, to: string) {
  const cost = new Map(products.map((p) => [p.barcode, Number(p.purchase_price) || 0]));
  let revenue = 0, c = 0, units = 0, n = 0;
  for (const t of tickets) {
    const d = t.created_at.slice(0, 10);
    if ((from && d < from) || (to && d > to)) continue;
    n++;
    revenue += Number(t.total_amount) || 0;
    for (const i of t.items) {
      const q = Number(i.quantity) || 0;
      units += q;
      c += q * (cost.get(i.barcode) ?? 0);
    }
  }
  return { revenue, cost: c, profit: revenue - c, tickets: n, units, average: n ? revenue / n : 0 };
}
