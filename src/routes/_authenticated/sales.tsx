import { useMemo, useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ChevronDown, Printer, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader, StatCard } from "@/components/stat-card";
import { money, storeSalesQuery, type SaleTicket } from "@/lib/pos-queries";

export const Route = createFileRoute("/_authenticated/sales")({
  beforeLoad: ({ context }) => {
    if (!context.me.canSell || !context.me.tenant) throw redirect({ to: context.me.homePath });
    return { tenant: context.me.tenant };
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(storeSalesQuery(context.tenant.id)),
  head: () => ({ meta: [{ title: "سجل المبيعات | SMART STOCK" }] }),
  component: SalesPage,
});

const today = () => new Date().toISOString().slice(0, 10);

function printTicket(storeName: string, t: SaleTicket) {
  const w = window.open("", "_blank", "width=380,height=600");
  if (!w) return;
  const rows = t.items
    .map((l) => `<tr><td>${l.product_name}<br/><small>${l.quantity} × ${money(Number(l.unit_price))}</small></td><td style="text-align:left">${money(Number(l.quantity) * Number(l.unit_price))}</td></tr>`)
    .join("");
  w.document.write(`<html dir="rtl"><head><meta charset="utf-8"/><title>Ticket</title><style>
    body{font-family:sans-serif;width:72mm;margin:0 auto;font-size:12px}table{width:100%;border-collapse:collapse}
    td{padding:3px 0;border-bottom:1px dashed #999}h2,p{text-align:center;margin:4px 0}</style></head><body>
    <h2>${storeName}</h2><p>بون رقم ${String(t.ticket_number).padStart(4, "0")} (نسخة)</p>
    <p>${new Date(t.created_at).toLocaleString("fr-FR")}</p><table>${rows}</table>
    <h2>المجموع: ${money(Number(t.total_amount))} دج</h2><p>شكراً لزيارتكم</p></body></html>`);
  w.document.close();
  w.focus();
  w.print();
}

function SalesPage() {
  const { tenant } = Route.useRouteContext();
  const { data: tickets } = useSuspenseQuery(storeSalesQuery(tenant.id));
  const [day, setDay] = useState(today());
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return tickets.filter(
      (t) =>
        (!day || t.created_at.slice(0, 10) === day) &&
        (!s ||
          String(t.ticket_number).includes(s) ||
          t.created_by_name.toLowerCase().includes(s) ||
          t.items.some((i) => i.product_name.toLowerCase().includes(s) || i.barcode.includes(s))),
    );
  }, [tickets, day, q]);
  const total = list.reduce((a, t) => a + Number(t.total_amount), 0);
  const articles = list.reduce((a, t) => a + t.items.reduce((b, i) => b + Number(i.quantity), 0), 0);

  return (
    <div className="space-y-5">
      <PageHeader title="سجل المبيعات" subtitle="كل البونات المسجلة في المتجر" />
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="عدد البونات" value={list.length} />
        <StatCard label="القطع المباعة" value={articles} />
        <StatCard label="المداخيل (دج)" value={money(total)} />
      </div>
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="رقم البون، البائع، المنتج..." className="h-11 ps-9" />
        </div>
        <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} className="h-11 w-44" />
        <Button variant="outline" className="h-11" onClick={() => setDay("")}>كل الأيام</Button>
      </div>
      <div className="space-y-2">
        {list.length === 0 && <p className="surface-card p-8 text-center text-muted-foreground">لا توجد مبيعات.</p>}
        {list.map((t) => (
          <div key={t.id} className="surface-card overflow-hidden">
            <button type="button" onClick={() => setOpen(open === t.id ? null : t.id)} className="flex w-full items-center gap-3 p-3 text-start">
              <span className="barcode-chip rounded-lg bg-muted px-2 py-1 text-xs font-bold">#{String(t.ticket_number).padStart(4, "0")}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold">{t.created_by_name}</span>
                <span className="block text-[11px] text-muted-foreground">
                  {new Date(t.created_at).toLocaleString("fr-FR")} · {t.items.length} منتج
                </span>
              </span>
              <span className="font-mono font-extrabold">{money(Number(t.total_amount))} دج</span>
              <ChevronDown className={`h-4 w-4 transition-transform ${open === t.id ? "rotate-180" : ""}`} />
            </button>
            {open === t.id && (
              <div className="border-t bg-muted/30 p-3">
                <table className="w-full text-sm">
                  <tbody>
                    {t.items.map((i) => (
                      <tr key={i.id} className="border-b last:border-0">
                        <td className="py-1.5">{i.product_name}<span className="block text-[10px] text-muted-foreground" dir="ltr">{i.barcode}</span></td>
                        <td className="py-1.5 text-end font-mono">{Number(i.quantity)} × {money(Number(i.unit_price))}</td>
                        <td className="py-1.5 text-end font-mono font-bold">{money(Number(i.quantity) * Number(i.unit_price))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <Button size="sm" variant="outline" className="mt-3" onClick={() => printTicket(tenant.name, t)}>
                  <Printer /> إعادة الطباعة
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
