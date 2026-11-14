import { useEffect, useMemo, useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Copy, MessageCircle, Phone } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader } from "@/components/stat-card";
import { money } from "@/lib/pos-queries";
import { onlineOrdersQuery, ORDER_STATUS, waLink, type OnlineOrder } from "@/lib/online-orders";
import { errorText, formatDateTime } from "@/lib/messages";

export const Route = createFileRoute("/_authenticated/orders")({
  beforeLoad: ({ context }) => {
    if (!context.me.canSell || !context.me.tenant) throw redirect({ to: context.me.homePath });
    return { tenant: context.me.tenant, me: context.me };
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(onlineOrdersQuery(context.tenant.id)),
  head: () => ({ meta: [{ title: "طلبيات أونلاين | SMART STOCK" }, { name: "description", content: "طلبيات زبائن متجري أونلاين مع معلومات الاتصال والتأكيد." }] }),
  component: OrdersPage,
});

function OrdersPage() {
  const { tenant, me } = Route.useRouteContext();
  const qc = useQueryClient();
  const { data: orders } = useSuspenseQuery(onlineOrdersQuery(tenant.id));
  const [status, setStatus] = useState("new");
  const [link, setLink] = useState("");
  useEffect(() => setLink(`${window.location.origin}/store/${tenant.code}`), [tenant.code]);
  const list = useMemo(() => orders.filter((o) => status === "all" || o.status === status), [orders, status]);
  const setSt = async (o: OnlineOrder, s: string) => {
    const { error } = await supabase.from("online_orders").update({ status: s, handled_by_name: me.fullName, updated_at: new Date().toISOString() }).eq("id", o.id);
    if (error) toast.error(errorText(error));
    else void qc.invalidateQueries({ queryKey: ["online-orders", tenant.id] });
  };
  const [delivering, setDelivering] = useState<OnlineOrder | null>(null);
  const [pay, setPay] = useState("cash");
  const deliver = async () => {
    if (!delivering) return;
    const { error } = await supabase.rpc("deliver_online_order", { _order_id: delivering.id, _payment: pay });
    if (error) return void toast.error(errorText(error));
    toast.success("تم التسليم وتسجيل البيع في الكاسة");
    setDelivering(null);
    for (const k of [["online-orders", tenant.id], ["sales-tickets"], ["products", tenant.id]]) void qc.invalidateQueries({ queryKey: k });
  };
  return (
    <div className="space-y-5">
      <Dialog open={!!delivering} onOpenChange={(o) => !o && setDelivering(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>تأكيد التسليم #{delivering?.order_number}</DialogTitle></DialogHeader>
          <p className="text-sm">المبلغ: <b>{money(Number(delivering?.total_amount ?? 0))} دج</b> — سيُسجَّل كبون بيع ويُنقص من المخزون ويدخل الكاسة المفتوحة.</p>
          <div className="grid grid-cols-3 gap-2">
            {[["cash", "نقداً"], ["card", "بطاقة"], ["credit", "آجل"]].map(([v, l]) => (
              <Button key={v} variant={pay === v ? "default" : "outline"} onClick={() => setPay(v)}>{l}</Button>
            ))}
          </div>
          <DialogFooter><Button onClick={() => void deliver()}>تأكيد التسليم</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <PageHeader title="طلبيات أونلاين" subtitle="اتصل بالزبون ثم أكّد الطلبية" />
      <div className="surface-card flex flex-wrap items-center gap-2 p-3 text-sm">
        <span className="font-bold">رابط متجري أونلاين:</span>
        <span className="barcode-chip truncate" dir="ltr">{link}</span>
        <Button size="sm" variant="outline" onClick={() => { void navigator.clipboard.writeText(link); toast.success("تم النسخ"); }}><Copy />نسخ</Button>
      </div>
      <div className="no-scrollbar flex gap-2 overflow-x-auto">
        {["new", "confirmed", "done", "cancelled", "all"].map((s) => (
          <Button key={s} size="sm" variant={status === s ? "default" : "outline"} onClick={() => setStatus(s)}>
            {s === "all" ? "الكل" : ORDER_STATUS[s]} ({s === "all" ? orders.length : orders.filter((o) => o.status === s).length})
          </Button>
        ))}
      </div>
      <ul className="space-y-3">
        {list.map((o) => (
          <li key={o.id} className="surface-card space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-extrabold">#{o.order_number} · {o.customer_name}</p>
              <span className="rounded-full bg-secondary px-3 py-1 text-xs font-bold">{ORDER_STATUS[o.status] ?? o.status}</span>
            </div>
            <p className="text-xs text-muted-foreground">{formatDateTime(o.created_at)}{o.handled_by_name && ` · ${o.handled_by_name}`}{o.email && ` · ${o.email}`}</p>
            <ul className="divide-y rounded-lg border text-sm">
              {o.items.map((i) => (
                <li key={i.id} className="flex justify-between gap-2 px-3 py-2">
                  <span className="truncate">{i.product_name} × {Number(i.quantity)}</span>
                  <span className="whitespace-nowrap">{money(Number(i.quantity) * Number(i.unit_price))}</span>
                </li>
              ))}
            </ul>
            {o.notes && <p className="text-sm">ملاحظة: {o.notes}</p>}
            <div className="flex flex-wrap items-center gap-2">
              <span className="me-auto font-extrabold">{money(Number(o.total_amount))}</span>
              <Button size="sm" variant="outline" asChild><a href={`tel:${o.phone}`}><Phone />{o.phone}</a></Button>
              <Button size="sm" variant="outline" asChild><a href={waLink(o.whatsapp || o.phone)} target="_blank" rel="noreferrer"><MessageCircle />واتساب</a></Button>
              {o.status === "new" && <Button size="sm" onClick={() => void setSt(o, "confirmed")}>تأكيد</Button>}
              {o.status === "confirmed" && <Button size="sm" onClick={() => { setPay("cash"); setDelivering(o); }}>تم التسليم</Button>}
              {(o.status === "new" || o.status === "confirmed") && <Button size="sm" variant="ghost" onClick={() => void setSt(o, "cancelled")}>إلغاء</Button>}
            </div>
          </li>
        ))}
        {!list.length && <li className="surface-card p-8 text-center text-sm text-muted-foreground">لا توجد طلبيات</li>}
      </ul>
    </div>
  );
}
