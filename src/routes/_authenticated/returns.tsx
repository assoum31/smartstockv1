import { useMemo, useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Lock, Minus, Plus, Printer, Search, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/stat-card";
import { productsQuery } from "@/lib/queries";
import { money, returnsQuery, suppliersQuery, type StockReturn } from "@/lib/pos-queries";
import { findProductByBarcode } from "@/lib/inventory-rules";
import { errorText } from "@/lib/messages";

export const Route = createFileRoute("/_authenticated/returns")({
  beforeLoad: ({ context }) => {
    if (!context.me.canSell || !context.me.tenant) throw redirect({ to: context.me.homePath });
    return { tenant: context.me.tenant };
  },
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(productsQuery(context.tenant.id)),
      context.queryClient.ensureQueryData(suppliersQuery(context.tenant.id)),
      context.queryClient.ensureQueryData(returnsQuery(context.tenant.id)),
    ]),
  head: () => ({ meta: [{ title: "بونات الإرجاع | SMART STOCK" }] }),
  component: ReturnsPage,
});

type Kind = "customer" | "supplier";
interface Line { barcode: string; product_name: string; quantity: number; unit_price: number }

const REASONS = ["تالف", "انتهاء الصلاحية", "خطأ في الطلبية", "تغيير رأي الزبون", "أخرى"];

function printReturn(r: { kind: Kind; number: number; party: string; lines: Line[]; store: string; reason?: string | undefined }) {
  const w = window.open("", "_blank", "width=380,height=600");
  if (!w) return;
  const sum = r.lines.reduce((n, l) => n + l.quantity * l.unit_price, 0);
  const rows = r.lines
    .map((l) => `<tr><td>${l.product_name}<br><small>${l.quantity} × ${money(l.unit_price)}</small></td><td style="text-align:left">${money(l.quantity * l.unit_price)}</td></tr>`)
    .join("");
  w.document.write(`<html dir="rtl"><head><title>Bon de retour</title><style>@page{size:80mm auto;margin:3mm}body{font-family:sans-serif;font-size:12px;width:74mm}table{width:100%;border-collapse:collapse}td{padding:3px 0;border-bottom:1px dashed #999}h2,p{text-align:center;margin:4px 0}</style></head><body>
  <h2>${r.store}</h2><p><b>${r.kind === "customer" ? "BON DE RETOUR CLIENT" : "BON DE RETOUR FOURNISSEUR"}</b></p>
  <p>رقم ${String(r.number).padStart(4, "0")} · ${new Date().toLocaleString("fr-FR")}</p>
  ${r.party ? `<p>${r.party}</p>` : ""}${r.reason ? `<p>السبب: ${r.reason}</p>` : ""}
  <table>${rows}</table><h2>المبلغ المسترجع: ${money(sum)} دج</h2><p>SMART STOCK</p></body></html>`);
  w.document.close(); w.focus(); w.print();
}

function ReturnsPage() {
  const { tenant } = Route.useRouteContext();
  const qc = useQueryClient();
  const { data: products } = useSuspenseQuery(productsQuery(tenant.id));
  const { data: suppliers } = useSuspenseQuery(suppliersQuery(tenant.id));
  const { data: history } = useSuspenseQuery(returnsQuery(tenant.id));
  const [kind, setKind] = useState<Kind>("customer");
  const [code, setCode] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [ticketRef, setTicketRef] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<"all" | Kind>("all");

  const q = code.trim().toLowerCase();
  const suggestions = useMemo(
    () => (q.length < 2 ? [] : products.filter((p) => p.name.toLowerCase().includes(q) || p.barcode.includes(q) || (p.alt_barcodes ?? []).some((b) => b.includes(q))).slice(0, 6)),
    [products, q],
  );

  const add = (p: { barcode: string; name: string; selling_price: number; purchase_price: number }) => {
    const price = Number(kind === "customer" ? p.selling_price : p.purchase_price) || 0;
    setLines((c) => {
      const i = c.findIndex((l) => l.barcode === p.barcode);
      if (i >= 0) return c.map((l, j) => (j === i ? { ...l, quantity: l.quantity + 1 } : l));
      return [...c, { barcode: p.barcode, product_name: p.name, quantity: 1, unit_price: price }];
    });
    setCode("");
  };
  const setLine = (b: string, patch: Partial<Line>) =>
    setLines((c) => c.map((l) => (l.barcode === b ? { ...l, ...patch } : l)).filter((l) => l.quantity > 0));
  const total = lines.reduce((n, l) => n + l.quantity * l.unit_price, 0);

  const submit = async () => {
    if (!lines.length) return;
    if (kind === "supplier" && !supplierId) return void toast.error("اختر المورد");
    setSaving(true);
    const { data: id, error } = await supabase.rpc("create_stock_return", {
      _kind: kind,
      _items: lines as never,
      _supplier_id: (kind === "supplier" ? supplierId : null) as never,
      _ticket_ref: ticketRef,
      _reason: reason,
    });
    setSaving(false);
    if (error) return void toast.error(errorText(error));
    const { data } = await supabase.from("stock_returns").select("return_number").eq("id", id as string).maybeSingle();
    const party = kind === "supplier" ? suppliers.find((s) => s.id === supplierId)?.name ?? "" : ticketRef ? `بون البيع: ${ticketRef}` : "";
    printReturn({ kind, number: data?.return_number ?? 0, party, lines, store: tenant.name, reason });
    toast.success("تم تسجيل الإرجاع وتحديث المخزون");
    setLines([]); setTicketRef(""); setReason("");
    void qc.invalidateQueries({ queryKey: ["stock-returns"] });
    void qc.invalidateQueries({ queryKey: ["products", tenant.id] });
  };

  const shown = history.filter((r) => filter === "all" || r.kind === filter);

  return (
    <div className="space-y-6">
      <PageHeader title="بونات الإرجاع" subtitle="إرجاع زبون يعيد السلعة للمخزون · إرجاع مورد يخصمها منه" />
      <div className="grid grid-cols-2 gap-2">
        {(["customer", "supplier"] as Kind[]).map((k) => (
          <Button key={k} variant={kind === k ? "default" : "outline"} className="h-12" onClick={() => { setKind(k); setLines([]); }}>
            <Undo2 />
            {k === "customer" ? "Retour client" : "Retour fournisseur"}
          </Button>
        ))}
      </div>

      <div className="surface-card space-y-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {kind === "supplier" ? (
            <div className="space-y-1.5">
              <Label>المورد</Label>
              <select className="h-11 w-full rounded-md border bg-background px-3" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="">— اختر —</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>رقم بون البيع الأصلي (اختياري)</Label>
              <Input className="h-11" value={ticketRef} onChange={(e) => setTicketRef(e.target.value)} />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>السبب</Label>
            <select className="h-11 w-full rounded-md border bg-background px-3" value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="">—</option>
              {REASONS.map((r) => <option key={r}>{r}</option>)}
            </select>
          </div>
        </div>
        <form className="relative" onSubmit={(e) => { e.preventDefault(); const p = findProductByBarcode(products, code) ?? (suggestions.length === 1 ? suggestions[0] : undefined); if (p) add(p); else toast.error("منتج غير موجود"); }}>
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-12 ps-9" placeholder="امسح الباركود أو ابحث بالاسم..." value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" />
        </form>
        {suggestions.length > 0 && (
          <div className="divide-y rounded-xl border">
            {suggestions.map((p) => (
              <button key={p.id} type="button" onClick={() => add(p)} className="flex w-full justify-between px-3 py-2 text-start hover:bg-muted/40">
                <span className="font-bold">{p.name}</span><span className="barcode-chip text-xs">{p.barcode}</span>
              </button>
            ))}
          </div>
        )}
        {lines.length > 0 && (
          <ul className="divide-y rounded-xl border">
            {lines.map((l) => (
              <li key={l.barcode} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <span className="flex-1 basis-32 font-bold">{l.product_name}</span>
                <Button size="icon" variant="secondary" onClick={() => setLine(l.barcode, { quantity: l.quantity - 1 })}><Minus /></Button>
                <Input inputMode="decimal" className="h-9 w-16 text-center" value={l.quantity} onChange={(e) => setLine(l.barcode, { quantity: Number(e.target.value.replace(",", ".")) || 0 })} />
                <Button size="icon" variant="secondary" onClick={() => setLine(l.barcode, { quantity: l.quantity + 1 })}><Plus /></Button>
                <Input inputMode="decimal" aria-label="السعر" className="h-9 w-24 text-center" value={l.unit_price} onChange={(e) => setLine(l.barcode, { unit_price: Number(e.target.value.replace(",", ".")) || 0 })} />
                <Button size="icon" variant="ghost" onClick={() => setLine(l.barcode, { quantity: 0 })}><Trash2 /></Button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center justify-between gap-3">
          <p className="font-mono text-2xl font-extrabold">{money(total)} دج</p>
          <Button className="h-12" disabled={!lines.length || saving} onClick={() => void submit()}><Printer />تأكيد وطباعة</Button>
        </div>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Lock className="h-3.5 w-3.5" />بون الإرجاع نهائي: لا يمكن حذفه ولا تعديله بعد التأكيد.</p>
      </div>

      <div className="space-y-3">
        <div className="flex gap-2">
          {(["all", "customer", "supplier"] as const).map((f) => (
            <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>
              {f === "all" ? "الكل" : f === "customer" ? "زبائن" : "موردون"}
            </Button>
          ))}
        </div>
        <div className="surface-card divide-y">
          {shown.length === 0 && <p className="p-8 text-center text-muted-foreground">لا توجد بونات إرجاع بعد.</p>}
          {shown.map((r: StockReturn) => (
            <div key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
              <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${r.kind === "customer" ? "bg-success/15 text-success" : "bg-destructive/10 text-destructive"}`}>
                {r.kind === "customer" ? "Client" : "Fournisseur"} #{String(r.return_number).padStart(4, "0")}
              </span>
              <span className="flex-1">{r.supplier_name ?? (r.ticket_ref ? `بون ${r.ticket_ref}` : "—")} · {r.items.length} سطر{r.reason ? ` · ${r.reason}` : ""}</span>
              <span className="text-xs text-muted-foreground">{r.created_by_name} · {new Date(r.created_at).toLocaleString("fr-FR")}</span>
              <span className="font-mono font-bold">{money(Number(r.total_amount))}</span>
              <Button size="icon" variant="ghost" aria-label="طباعة" onClick={() => printReturn({ kind: r.kind as Kind, number: r.return_number, party: r.supplier_name ?? r.ticket_ref ?? "", lines: r.items.map((i) => ({ ...i, quantity: Number(i.quantity), unit_price: Number(i.unit_price) })), store: tenant.name, reason: r.reason ?? undefined })}>
                <Printer className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
