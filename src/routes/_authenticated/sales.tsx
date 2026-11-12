import { useMemo, useState } from "react";
import { Link, createFileRoute, redirect } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { errorText } from "@/lib/messages";
import { Banknote, ChevronDown, Package, Printer, Receipt, Search, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader, StatCard } from "@/components/stat-card";
import { useStoreSettings } from "@/lib/store-settings";
import { printTicket } from "@/lib/print-ticket";
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

function SalesPage() {
  const { tenant, me } = Route.useRouteContext();
  const isManager = me.isManager;
  const qc = useQueryClient();
  const storeSettings = useStoreSettings(tenant.id);
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
        <StatCard icon={Receipt} label="عدد البونات" value={list.length} />
        <StatCard icon={Package} label="القطع المباعة" value={articles} />
        <StatCard icon={Banknote} tone="neutral" label="المداخيل (دج)" value={money(total)} />
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
                <Button size="sm" variant="outline" className="mt-3" onClick={() => printTicket(tenant.name, t, storeSettings)}>
                  <Printer /> إعادة الطباعة
                </Button>
                <Button size="sm" variant="outline" className="mt-3 ms-2" asChild>
                  <Link to="/returns" search={{ ticket: t.ticket_number }}><Undo2 /> إرجاع الوصل</Link>
                </Button>
                {isManager && (
                  <Button size="sm" variant="outline" className="mt-3 ms-2 text-destructive" onClick={async () => {
                    if (!window.confirm("حذف هذا البون؟ ستعود كمياته إلى المخزون.")) return;
                    const { error } = await supabase.rpc("delete_sales_ticket", { _ticket_id: t.id });
                    if (error) return void toast.error(errorText(error));
                    toast.success("تم حذف البون");
                    void qc.invalidateQueries();
                  }}><Trash2 /> حذف</Button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
