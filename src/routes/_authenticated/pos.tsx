import { useMemo, useRef, useState } from "react";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Camera, CameraOff, Minus, Plus, Printer, Search, ShoppingCart, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/stat-card";
import { BarcodeScanner } from "@/components/barcode-scanner";
import { activeSessionQuery, productsQuery, type Product } from "@/lib/queries";
import { findProductByBarcode } from "@/lib/inventory-rules";
import { errorText } from "@/lib/messages";

export const Route = createFileRoute("/_authenticated/pos")({
  beforeLoad: ({ context }) => {
    if (!context.me.canSell || !context.me.tenant) throw redirect({ to: context.me.homePath });
    return { tenant: context.me.tenant };
  },
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(activeSessionQuery(context.tenant.id)),
      context.queryClient.ensureQueryData(productsQuery(context.tenant.id)),
    ]),
  head: () => ({ meta: [{ title: "نقطة البيع | SMART STOCK" }] }),
  component: PosPage,
});

const money = (n: number) =>
  new Intl.NumberFormat("fr-DZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

interface CartLine {
  barcode: string;
  product_name: string;
  quantity: number;
  unit_price: number;
}

function PosPage() {
  const { tenant } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const { data: session } = useSuspenseQuery(activeSessionQuery(tenant.id));
  const { data: products } = useSuspenseQuery(productsQuery(tenant.id));
  const [code, setCode] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [paid, setPaid] = useState("");
  const [camera, setCamera] = useState(false);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const q = code.trim().toLowerCase();
  const suggestions = useMemo(
    () =>
      q.length < 2
        ? []
        : products
            .filter(
              (p) =>
                p.name.toLowerCase().includes(q) ||
                p.barcode.includes(q) ||
                (p.alt_barcodes ?? []).some((b) => b.includes(q)),
            )
            .slice(0, 8),
    [products, q],
  );

  const addProduct = (p: Pick<Product, "barcode" | "name" | "selling_price">) => {
    setCart((c) => {
      const i = c.findIndex((l) => l.barcode === p.barcode);
      if (i >= 0) return c.map((l, j) => (j === i ? { ...l, quantity: l.quantity + 1 } : l));
      return [
        ...c,
        { barcode: p.barcode, product_name: p.name, quantity: 1, unit_price: Number(p.selling_price) || 0 },
      ];
    });
    setCode("");
    inputRef.current?.focus();
  };

  const addCode = (raw: string) => {
    const p = findProductByBarcode(products, raw);
    if (p) return addProduct(p);
    if (suggestions.length === 1 && suggestions[0]) return addProduct(suggestions[0]);
    toast.error("منتج غير موجود في الكتالوج");
  };

  const setLine = (barcode: string, patch: Partial<CartLine>) =>
    setCart((c) =>
      c.map((l) => (l.barcode === barcode ? { ...l, ...patch } : l)).filter((l) => l.quantity > 0),
    );

  const total = cart.reduce((n, l) => n + l.quantity * l.unit_price, 0);
  const paidNum = Number(paid.replace(",", ".")) || 0;
  const change = paidNum - total;

  const printReceipt = (lines: CartLine[], number: string) => {
    const w = window.open("", "_blank", "width=380,height=600");
    if (!w) return;
    const rows = lines
      .map(
        (l) =>
          `<tr><td>${l.product_name}<br><small>${l.quantity} × ${money(l.unit_price)}</small></td><td style="text-align:left">${money(l.quantity * l.unit_price)}</td></tr>`,
      )
      .join("");
    const sum = lines.reduce((n, l) => n + l.quantity * l.unit_price, 0);
    w.document.write(`<html dir="rtl"><head><title>بون ${number}</title><style>
      @page{size:80mm auto;margin:3mm}body{font-family:sans-serif;font-size:12px;width:74mm}
      table{width:100%;border-collapse:collapse}td{padding:3px 0;border-bottom:1px dashed #999}
      h2,p{text-align:center;margin:4px 0}</style></head><body>
      <h2>${tenant.name}</h2><p>بون رقم ${number}</p><p>${new Date().toLocaleString("fr-FR")}</p>
      <table>${rows}</table><h2>المجموع: ${money(sum)} دج</h2>
      ${paidNum ? `<p>المدفوع: ${money(paidNum)} · الباقي: ${money(paidNum - sum)}</p>` : ""}
      <p>شكراً لزيارتكم</p></body></html>`);
    w.document.close();
    w.focus();
    w.print();
  };

  const checkout = async (print: boolean) => {
    if (cart.length === 0) return;
    setSaving(true);
    const { data: id, error } = await supabase.rpc("create_sales_ticket", {
      _session_id: (session?.id ?? null) as never,
      _items: cart as never,
      _notes: "نقطة البيع",
    });
    setSaving(false);
    if (error) return void toast.error(errorText(error));
    let number = "";
    if (id) {
      const { data } = await supabase.from("sales_tickets").select("ticket_number").eq("id", id).maybeSingle();
      number = data ? String(data.ticket_number).padStart(4, "0") : "";
    }
    if (print) printReceipt(cart, number);
    toast.success(`تم البيع ${number ? `· بون ${number}` : ""}`);
    setCart([]);
    setPaid("");
    void queryClient.invalidateQueries({ queryKey: ["sales-tickets"] });
    inputRef.current?.focus();
  };

  return (
    <div className="space-y-5">
      <PageHeader title="نقطة البيع" subtitle={session ? `الجلسة: ${session.name}` : "بيع مباشر · المخزون يُحدَّث تلقائياً"} />
      <div className="grid gap-5 lg:grid-cols-[1fr_24rem]">
        <div className="space-y-3">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (code.trim()) addCode(code);
            }}
          >
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={inputRef}
                autoFocus
                autoComplete="off"
                placeholder="امسح الباركود أو ابحث بالاسم..."
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="h-12 bg-card ps-9 text-lg"
              />
            </div>
            <Button type="button" variant="outline" className="h-12" onClick={() => setCamera((c) => !c)}>
              {camera ? <CameraOff /> : <Camera />}
            </Button>
          </form>
          {camera && <BarcodeScanner onDetected={(c) => addCode(c)} />}
          {suggestions.length > 0 && (
            <div className="surface-card divide-y">
              {suggestions.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => addProduct(p)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-start hover:bg-muted/40"
                >
                  <span className="flex-1 font-bold">{p.name}</span>
                  <span className="barcode-chip text-xs text-muted-foreground">{p.barcode}</span>
                  <span className="font-mono font-bold">{money(Number(p.selling_price))}</span>
                </button>
              ))}
            </div>
          )}

          <div className="surface-card overflow-hidden">
            {cart.length === 0 ? (
              <p className="p-12 text-center text-muted-foreground">السلة فارغة. امسح منتجاً للبدء.</p>
            ) : (
              <ul className="divide-y">
                {cart.map((l) => (
                  <li key={l.barcode} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1 basis-40">
                      <p className="font-bold">{l.product_name}</p>
                      <p className="barcode-chip text-xs text-muted-foreground">{l.barcode}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="secondary" onClick={() => setLine(l.barcode, { quantity: l.quantity + 1 })}>
                        <Plus />
                      </Button>
                      <Input
                        inputMode="decimal"
                        value={l.quantity}
                        onChange={(e) => setLine(l.barcode, { quantity: Number(e.target.value.replace(",", ".")) || 0 })}
                        className="h-9 w-16 text-center font-mono font-bold"
                      />
                      <Button size="icon" variant="secondary" onClick={() => setLine(l.barcode, { quantity: l.quantity - 1 })}>
                        <Minus />
                      </Button>
                    </div>
                    <Input
                      inputMode="decimal"
                      aria-label="السعر"
                      value={l.unit_price}
                      onChange={(e) => setLine(l.barcode, { unit_price: Number(e.target.value.replace(",", ".")) || 0 })}
                      className="h-9 w-24 text-center font-mono"
                    />
                    <span className="w-28 text-end font-mono font-bold">{money(l.quantity * l.unit_price)}</span>
                    <Button size="icon" variant="ghost" aria-label="حذف" onClick={() => setLine(l.barcode, { quantity: 0 })}>
                      <Trash2 />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="surface-card h-fit space-y-4 p-5 lg:sticky lg:top-20">
          <div className="rounded-2xl bg-ink p-5 text-ink-foreground">
            <p className="text-xs opacity-80">المجموع ({cart.reduce((n, l) => n + l.quantity, 0)} قطعة)</p>
            <p className="font-mono text-4xl font-extrabold">{money(total)}</p>
            <p className="text-xs opacity-80">دج</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="paid">المبلغ المستلم</Label>
            <Input
              id="paid"
              inputMode="decimal"
              value={paid}
              onChange={(e) => setPaid(e.target.value)}
              className="h-12 text-center font-mono text-xl font-bold"
            />
          </div>
          {paidNum > 0 && (
            <div className={`rounded-xl p-3 text-center font-bold ${change < 0 ? "bg-destructive/10 text-destructive" : "bg-success/15 text-success"}`}>
              {change < 0 ? "ناقص" : "الباقي للزبون"}: <span className="font-mono">{money(Math.abs(change))}</span> دج
            </div>
          )}
          <Button className="h-14 w-full text-lg" disabled={cart.length === 0 || saving} onClick={() => void checkout(true)}>
            <Printer />
            بيع وطباعة
          </Button>
          <Button variant="outline" className="w-full" disabled={cart.length === 0 || saving} onClick={() => void checkout(false)}>
            بيع بدون طباعة
          </Button>
          {cart.length > 0 && (
            <Button variant="ghost" className="w-full text-destructive" onClick={() => setCart([])}>
              إفراغ السلة
            </Button>
          )}
          <p className="text-xs text-muted-foreground">
            البيع يُسجَّل في الجلسة الجارية ويُخصم من المحسوب للمنتجات التي عُدّت قبل البيع.
          </p>
        </div>
      </div>
    </div>
  );
}
