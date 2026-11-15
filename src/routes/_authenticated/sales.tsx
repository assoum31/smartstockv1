import { useMemo, useState } from "react";
import { Link, createFileRoute, redirect } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { errorText } from "@/lib/messages";
import { Banknote, ChevronDown, Globe, Package, Printer, Receipt, Search, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader, StatCard } from "@/components/stat-card";
import { SalesStats } from "@/components/sales-stats";
import { useStoreSettings } from "@/lib/store-settings";
import { printTicket } from "@/lib/print-ticket";
import { documentNumber } from "@/lib/document-number";
import { a4DocHtml, openPrint } from "@/lib/store-settings";
import { money, storeSalesQuery, type SaleTicket } from "@/lib/pos-queries";

export const Route = createFileRoute("/_authenticated/sales")({
  beforeLoad: ({ context }) => {
    if (!context.me.canSell || !context.me.tenant) throw redirect({ to: context.me.homePath });
    return { tenant: context.me.tenant };
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(storeSalesQuery(context.tenant.id)),
  head: () => ({ meta: [{ title: "سجل المبيعات | SMART STOCK" }, { name: "description", content: "سجل وصول البيع والفواتير ذات الترقيم السنوي في SMART STOCK." }, { property: "og:title", content: "سجل المبيعات | SMART STOCK" }, { property: "og:description", content: "عرض وطباعة وصول البيع والفواتير." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
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
  const [onlineOnly, setOnlineOnly] = useState(false);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return tickets.filter(
      (t) =>
        (!day || t.created_at.slice(0, 10) === day) &&
        (!onlineOnly || !!t.online_order_id) &&
        (!s ||
          String(t.ticket_number).includes(s) ||
          documentNumber("sale", t, t.ticket_number).toLowerCase().includes(s) ||
          documentNumber("invoice", t, t.ticket_number).toLowerCase().includes(s) ||
          t.created_by_name.toLowerCase().includes(s) ||
          t.items.some((i) => i.product_name.toLowerCase().includes(s) || i.barcode.toLowerCase().includes(s))),
    );
  }, [tickets, day, q, onlineOnly]);
  const total = list.reduce((a, t) => a + Number(t.total_amount), 0);
  const onlineTotal = list.filter((t) => t.online_order_id).reduce((a, t) => a + Number(t.total_amount), 0);
  const articles = list.reduce((a, t) => a + t.items.reduce((b, i) => b + Number(i.quantity), 0), 0);

  return (
    <div className="space-y-5">
      <PageHeader title="سجل المبيعات" subtitle="كل البونات المسجلة في المتجر" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={Receipt} label="عدد البونات" value={list.length} />
        <StatCard icon={Package} label="القطع المباعة" value={articles} />
        <StatCard icon={Banknote} tone="neutral" label="المداخيل (دج)" value={money(total)} />
        <StatCard icon={Globe} tone="neutral" label="مداخيل أونلاين (دج)" value={money(onlineTotal)} />
      </div>
      {me.canSeeStats && <SalesStats tenantId={tenant.id} />}
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="رقم البون، البائع، المنتج..." className="h-11 ps-9" />
        </div>
        <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} className="h-11 w-44" />
        <Button variant="outline" className="h-11" onClick={() => setDay("")}>كل الأيام</Button>
        <Button variant={onlineOnly ? "default" : "outline"} className="h-11" onClick={() => setOnlineOnly(!onlineOnly)}><Globe />أونلاين فقط</Button>
      </div>
      <div className="space-y-2">
        {list.length === 0 && <p className="surface-card p-8 text-center text-muted-foreground">لا توجد مبيعات.</p>}
        {list.map((t) => (
          <div key={t.id} className="surface-card overflow-hidden">
            <button type="button" onClick={() => setOpen(open === t.id ? null : t.id)} className="flex w-full items-center gap-3 p-3 text-start">
              <span className="barcode-chip rounded-lg bg-muted px-2 py-1 text-xs font-bold">{documentNumber("sale", t, t.ticket_number)}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold">{t.created_by_name}{t.online_order_id && <span className="ms-2 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] text-primary">أونلاين</span>}</span>
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
                <Button size="sm" variant="outline" className="mt-3 ms-2" onClick={() => openPrint(a4DocHtml(storeSettings, tenant.name, {
                  title: "فاتورة", number: documentNumber("invoice", t, t.ticket_number),
                  date: new Date(t.created_at).toLocaleString("fr-FR"),
                  lines: t.items.map((i) => ({ barcode: i.barcode, product_name: i.product_name, quantity: Number(i.quantity), price: Number(i.unit_price) })),
                }))}><Printer /> {documentNumber("invoice", t, t.ticket_number)}</Button>
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
