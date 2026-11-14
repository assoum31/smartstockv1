import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { storeSalesQuery, money } from "@/lib/pos-queries";
import { productsQuery } from "@/lib/queries";
import { salesSummary } from "@/lib/sales-stats";
import { Input } from "@/components/ui/input";

/** Revenue (chiffre d'affaires), cost and profit for a date range. */
export function SalesStats({ tenantId }: { tenantId: string }) {
  const { data: tickets = [] } = useQuery(storeSalesQuery(tenantId));
  const { data: products = [] } = useQuery(productsQuery(tenantId));
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(today.slice(0, 8) + "01");
  const [to, setTo] = useState(today);
  const s = useMemo(() => salesSummary(tickets, products, from, to), [tickets, products, from, to]);
  const cards = [
    { label: "رقم الأعمال", value: money(s.revenue) },
    { label: "تكلفة الشراء", value: money(s.cost) },
    { label: "الفائدة", value: money(s.profit) },
    { label: "هامش الربح", value: `${s.margin.toFixed(1)}%` },
    { label: "متوسط فائدة الوصل", value: money(s.avgProfit) },
    { label: "عدد الوصولات", value: String(s.tickets) },
    { label: "متوسط الوصل", value: money(s.average) },
    { label: "القطع المباعة", value: String(s.units) },
  ];
  return (
    <div className="space-y-3">
      <div className="surface-card flex flex-wrap items-center gap-2 p-3">
        <span className="text-sm font-bold">إحصائيات المبيعات</span>
        <Input type="date" className="h-9 w-auto" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="من تاريخ" />
        <Input type="date" className="h-9 w-auto" value={to} onChange={(e) => setTo(e.target.value)} aria-label="إلى تاريخ" />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="surface-card p-3">
            <p className="text-xs text-muted-foreground">{c.label}</p>
            <p className="truncate text-lg font-extrabold">{c.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
