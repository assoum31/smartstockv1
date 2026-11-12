import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { storeSalesQuery, money } from "@/lib/pos-queries";

const config: ChartConfig = {
  total: { label: "المداخيل", color: "var(--primary)" },
  qty: { label: "الكمية", color: "var(--primary)" },
};

export function SalesCharts({ tenantId }: { tenantId: string }) {
  const { data = [] } = useQuery(storeSalesQuery(tenantId));

  const daily = useMemo(() => {
    const days: { day: string; total: number }[] = [];
    const map = new Map<string, number>();
    for (const t of data) {
      const k = t.created_at.slice(0, 10);
      map.set(k, (map.get(k) ?? 0) + Number(t.total_amount ?? 0));
    }
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      days.push({ day: d.slice(5), total: map.get(d) ?? 0 });
    }
    return days;
  }, [data]);

  const top = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of data) for (const it of t.items ?? []) map.set(it.product_name, (map.get(it.product_name) ?? 0) + Math.abs(it.quantity));
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, qty]) => ({ name: name.length > 14 ? name.slice(0, 14) + "…" : name, qty }));
  }, [data]);

  const sum = daily.reduce((s, d) => s + d.total, 0);

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <div className="surface-card min-w-0 p-4 lg:col-span-3">
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <p className="text-sm font-extrabold">المداخيل — آخر 14 يوم</p>
          <p className="whitespace-nowrap font-mono text-sm font-bold text-primary">{money(sum)} دج</p>
        </div>
        <ChartContainer config={config} className="h-56 w-full">
          <AreaChart data={daily} margin={{ left: 0, right: 8 }}>
            <defs>
              <linearGradient id="fillTotal" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-total)" stopOpacity={0.45} />
                <stop offset="95%" stopColor="var(--color-total)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={11} />
            <YAxis width={44} tickLine={false} axisLine={false} fontSize={11} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Area dataKey="total" type="monotone" stroke="var(--color-total)" strokeWidth={2.5} fill="url(#fillTotal)" />
          </AreaChart>
        </ChartContainer>
      </div>
      <div className="surface-card min-w-0 p-4 lg:col-span-2">
        <p className="mb-3 text-sm font-extrabold">الأكثر مبيعاً</p>
        {top.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">لا توجد مبيعات بعد</p>
        ) : (
          <ChartContainer config={config} className="h-56 w-full">
            <BarChart data={top} layout="vertical" margin={{ left: 4, right: 12 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" width={96} tickLine={false} axisLine={false} fontSize={11} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="qty" fill="var(--color-qty)" radius={6} />
            </BarChart>
          </ChartContainer>
        )}
      </div>
    </div>
  );
}
