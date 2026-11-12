import { useMemo, useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { ChevronDown, PackagePlus, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/stat-card";
import { productsQuery } from "@/lib/queries";
import { findProductByBarcode } from "@/lib/inventory-rules";
import { money, receiptsQuery, suppliersQuery } from "@/lib/pos-queries";
import { errorText } from "@/lib/messages";

export const Route = createFileRoute("/_authenticated/receipts")({
  beforeLoad: ({ context }) => {
    if (!context.me.canSell || !context.me.tenant) throw redirect({ to: context.me.homePath });
    return { tenant: context.me.tenant };
  },
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(receiptsQuery(context.tenant.id)),
      context.queryClient.ensureQueryData(suppliersQuery(context.tenant.id)),
      context.queryClient.ensureQueryData(productsQuery(context.tenant.id)),
    ]),
  head: () => ({ meta: [{ title: "وصول السلع | SMART STOCK" }] }),
  component: ReceiptsPage,
});

interface Line {
  barcode: string;
  product_name: string;
  quantity: string;
  purchase_price: string;
  selling_price: string;
  isNew: boolean;
}

function ReceiptsPage() {
  const { tenant } = Route.useRouteContext();
  const qc = useQueryClient();
  const { data: receipts } = useSuspenseQuery(receiptsQuery(tenant.id));
  const { data: suppliers } = useSuspenseQuery(suppliersQuery(tenant.id));
  const { data: products } = useSuspenseQuery(productsQuery(tenant.id));
  const [creating, setCreating] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [code, setCode] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const q = code.trim().toLowerCase();
  const suggestions = useMemo(
    () =>
      q.length < 2
        ? []
        : products.filter((p) => p.name.toLowerCase().includes(q) || p.barcode.includes(q) || (p.alt_barcodes ?? []).some((b) => b.includes(q))).slice(0, 6),
    [products, q],
  );

  const addLine = (barcode: string) => {
    const b = barcode.trim();
    if (!b) return;
    const p = findProductByBarcode(products, b);
    const main = p?.barcode ?? b;
    setLines((ls) => {
      if (ls.some((l) => l.barcode === main)) return ls.map((l) => (l.barcode === main ? { ...l, quantity: String(Number(l.quantity || 0) + 1) } : l));
      return [
        ...ls,
        {
          barcode: main,
          product_name: p?.name ?? "",
          quantity: "1",
          purchase_price: p ? String(Number(p.purchase_price)) : "",
          selling_price: p ? String(Number(p.selling_price)) : "",
          isNew: !p,
        },
      ];
    });
    setCode("");
  };

  const set = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const total = lines.reduce((a, l) => a + Number(l.quantity || 0) * Number(l.purchase_price || 0), 0);

  const save = async () => {
    if (lines.length === 0) return;
    if (lines.some((l) => !(Number(l.quantity) > 0))) return void toast.error("أدخل كمية صحيحة لكل منتج");
    if (lines.some((l) => l.isNew && !l.product_name.trim())) return void toast.error("أدخل اسم كل منتج جديد");
    setSaving(true);
    const { error } = await supabase.rpc("create_goods_receipt", {
      _supplier_id: (supplierId || null) as never,
      _items: lines.map((l) => ({
        barcode: l.barcode,
        product_name: l.product_name,
        quantity: Number(l.quantity),
        purchase_price: Number(l.purchase_price || 0),
        selling_price: Number(l.selling_price || 0),
      })) as never,
      _reference: reference,
      _notes: notes,
    });
    setSaving(false);
    if (error) return void toast.error(errorText(error));
    toast.success("تم حفظ وصل الاستلام وتحديث المخزون");
    setLines([]);
    setReference("");
    setNotes("");
    setCreating(false);
    void qc.invalidateQueries({ queryKey: ["goods-receipts", tenant.id] });
    void qc.invalidateQueries({ queryKey: ["products", tenant.id] });
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="وصول السلع"
        subtitle="إدخال البضاعة القادمة من الموردين"
        actions={!creating && <Button onClick={() => setCreating(true)}><Plus /> وصل استلام جديد</Button>}
      />

      {creating && (
        <div className="surface-card space-y-4 p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="rc-sup">المورد</Label>
              <select id="rc-sup" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="h-11 w-full rounded-md border bg-background px-3 text-sm">
                <option value="">— بدون مورد —</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rc-ref">رقم فاتورة المورد</Label>
              <Input id="rc-ref" value={reference} onChange={(e) => setReference(e.target.value)} className="h-11" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rc-notes">ملاحظات</Label>
              <Input id="rc-notes" value={notes} onChange={(e) => setNotes(e.target.value)} className="h-11" />
            </div>
          </div>

          <form className="relative" onSubmit={(e) => { e.preventDefault(); addLine(code); }}>
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input autoFocus autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} placeholder="امسح الباركود أو ابحث بالاسم ثم Enter" className="h-12 ps-9" />
            {suggestions.length > 0 && (
              <div className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-xl border bg-popover shadow-lift">
                {suggestions.map((p) => (
                  <button key={p.id} type="button" onClick={() => addLine(p.barcode)} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-start text-sm hover:bg-muted">
                    <span className="font-bold">{p.name}</span>
                    <span className="barcode-chip text-xs text-muted-foreground" dir="ltr">{p.barcode}</span>
                  </button>
                ))}
              </div>
            )}
          </form>

          {lines.length > 0 && (
            <div className="space-y-2">
              {lines.map((l, i) => (
                <div key={l.barcode} className="grid grid-cols-2 gap-2 rounded-xl border p-3 sm:grid-cols-[2fr_1fr_1fr_1fr_auto]">
                  <div className="col-span-2 sm:col-span-1">
                    {l.isNew ? (
                      <Input placeholder="اسم المنتج الجديد" value={l.product_name} onChange={(e) => set(i, { product_name: e.target.value })} className="h-10" />
                    ) : (
                      <p className="text-sm font-bold">{l.product_name}</p>
                    )}
                    <p className="barcode-chip mt-1 text-[11px] text-muted-foreground" dir="ltr">{l.barcode}{l.isNew && " · جديد"}</p>
                  </div>
                  <label className="text-[11px] text-muted-foreground">الكمية
                    <Input inputMode="decimal" value={l.quantity} onChange={(e) => set(i, { quantity: e.target.value })} className="h-10" /></label>
                  <label className="text-[11px] text-muted-foreground">سعر الشراء
                    <Input inputMode="decimal" value={l.purchase_price} onChange={(e) => set(i, { purchase_price: e.target.value })} className="h-10" /></label>
                  <label className="text-[11px] text-muted-foreground">سعر البيع
                    <Input inputMode="decimal" value={l.selling_price} onChange={(e) => set(i, { selling_price: e.target.value })} className="h-10" /></label>
                  <Button size="icon" variant="ghost" aria-label="حذف" className="self-end" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <p className="flex-1 font-extrabold">المجموع: <span className="font-mono">{money(total)}</span> دج</p>
            <Button variant="outline" onClick={() => { setCreating(false); setLines([]); }}>إلغاء</Button>
            <Button disabled={saving || lines.length === 0} onClick={() => void save()}>
              <PackagePlus /> {saving ? "جاري الحفظ..." : "حفظ وصل الاستلام"}
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {receipts.length === 0 && !creating && <p className="surface-card p-8 text-center text-muted-foreground">لا توجد وصولات بعد.</p>}
        {receipts.map((r) => (
          <div key={r.id} className="surface-card overflow-hidden">
            <button type="button" onClick={() => setOpen(open === r.id ? null : r.id)} className="flex w-full items-center gap-3 p-3 text-start">
              <span className="barcode-chip rounded-lg bg-muted px-2 py-1 text-xs font-bold">BR-{String(r.receipt_number).padStart(4, "0")}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold">{r.supplier_name ?? "بدون مورد"}{r.reference && ` · ${r.reference}`}</span>
                <span className="block text-[11px] text-muted-foreground">{new Date(r.created_at).toLocaleString("fr-FR")} · {r.created_by_name} · {r.items.length} منتج</span>
              </span>
              <span className="font-mono font-extrabold">{money(Number(r.total_amount))} دج</span>
              <ChevronDown className={`h-4 w-4 transition-transform ${open === r.id ? "rotate-180" : ""}`} />
            </button>
            {open === r.id && (
              <div className="border-t bg-muted/30 p-3 text-sm">
                {r.notes && <p className="mb-2 text-muted-foreground">{r.notes}</p>}
                {r.items.map((i) => (
                  <div key={i.id} className="flex justify-between gap-2 border-b py-1.5 last:border-0">
                    <span>{i.product_name}</span>
                    <span className="font-mono">{Number(i.quantity)} × {money(Number(i.purchase_price))}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
