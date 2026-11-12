import { openPrint, ticketHtml, useStoreSettings } from "@/lib/store-settings";
import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { AlertTriangle, Camera, CameraOff, Minus, PauseCircle, Plus, Printer, Search, Trash2, Undo2, Wallet } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { myCashSessionQuery } from "@/lib/pos-queries";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/stat-card";
import { BarcodeScanner } from "@/components/barcode-scanner";
import { ticketCode } from "@/lib/receipt-code";
import { activeSessionQuery, productsQuery, type Product } from "@/lib/queries";
import { findProductByBarcode } from "@/lib/inventory-rules";
import { errorText } from "@/lib/messages";

export const Route = createFileRoute("/_authenticated/pos")({
  beforeLoad: ({ context }) => {
    if (!context.me.canSell || !context.me.tenant) throw redirect({ to: context.me.homePath });
    return { tenant: context.me.tenant, userId: context.me.userId };
  },
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(activeSessionQuery(context.tenant.id)),
      context.queryClient.ensureQueryData(productsQuery(context.tenant.id)),
      context.queryClient.ensureQueryData(myCashSessionQuery(context.tenant.id, context.userId)),
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
  const { tenant, userId } = Route.useRouteContext();
  const storeSettings = useStoreSettings(tenant.id);
  const { data: cash } = useSuspenseQuery(myCashSessionQuery(tenant.id, userId));
  const [discount, setDiscount] = useState("");
  const [discountPct, setDiscountPct] = useState(false);
  const [payment, setPayment] = useState<"cash" | "card" | "credit">("cash");
  const HOLD_KEY = `smartstock:held:${tenant.id}`;
  const [held, setHeld] = useState<{ at: string; cart: CartLine[] }[]>(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(localStorage.getItem(HOLD_KEY) ?? "[]"); } catch { return []; }
  });
  const saveHeld = (h: typeof held) => { setHeld(h); localStorage.setItem(HOLD_KEY, JSON.stringify(h)); };
  const [opening, setOpening] = useState("");
  const [closing, setClosing] = useState<string | null>(null);
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

  const subtotal = cart.reduce((n, l) => n + l.quantity * l.unit_price, 0);
  const discNum = Number(discount.replace(",", ".")) || 0;
  const discAmount = Math.min(subtotal, Math.max(0, discountPct ? (subtotal * discNum) / 100 : discNum));
  const total = subtotal - discAmount;
  const stockOf = (b: string) => Number(products.find((p) => p.barcode === b)?.system_quantity ?? 0);
  const paidNum = Number(paid.replace(",", ".")) || 0;
  const change = paidNum - total;

  const printReceipt = (lines: CartLine[], number: string) => {
    const sum = lines.reduce((n, l) => n + l.quantity * l.unit_price, 0) - discAmount;
    const pay = { cash: "نقداً", card: "بطاقة / BaridiMob", credit: "على الحساب" }[payment];
    openPrint(
      ticketHtml(storeSettings, tenant.name, {
        title: `بون رقم ${number}`,
        date: new Date().toLocaleString("fr-FR"),
        lines,
        total: sum,
        code: number ? ticketCode(number) : undefined,
        extra: `${discAmount ? `<p>خصم: -${money(discAmount)}</p>` : ""}<p>الدفع: ${pay}</p>${paidNum ? `<p>المدفوع: ${money(paidNum)} · الباقي: ${money(paidNum - sum)}</p>` : ""}`,
      }),
      "width=380,height=600",
    );
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
      await supabase.rpc("set_ticket_payment", { _ticket_id: id as string, _payment: payment, _discount: discAmount });
      const { data } = await supabase.from("sales_tickets").select("ticket_number").eq("id", id).maybeSingle();
      number = data ? String(data.ticket_number).padStart(4, "0") : "";
    }
    if (print) printReceipt(cart, number);
    toast.success(`تم البيع ${number ? `· بون ${number}` : ""}`);
    setCart([]);
    setPaid("");
    setDiscount("");
    setPayment("cash");
    void queryClient.invalidateQueries({ queryKey: ["products", tenant.id] });
    void queryClient.invalidateQueries({ queryKey: ["sales-tickets"] });
    inputRef.current?.focus();
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="نقطة البيع"
        subtitle={session ? `الجلسة: ${session.name}` : "بيع مباشر · المخزون يُحدَّث تلقائياً"}
        actions={
          <Button variant="outline" asChild>
            <Link to="/returns"><Undo2 />بون إرجاع</Link>
          </Button>
        }
      />
      <div className="surface-card flex flex-wrap items-center gap-3 p-3 text-sm">
        <Wallet className="h-5 w-5 text-primary" />
        {cash ? (
          <>
            <span className="flex-1">الصندوق مفتوح منذ {new Date(cash.opened_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} · رصيد البداية <b className="font-mono">{money(Number(cash.opening_amount))}</b> دج</span>
            {closing === null ? (
              <Button size="sm" variant="outline" onClick={() => setClosing("")}>إغلاق الصندوق</Button>
            ) : (
              <CloseCash cashId={cash.id} opening={Number(cash.opening_amount)} value={closing} setValue={setClosing} onDone={() => { setClosing(null); void queryClient.invalidateQueries({ queryKey: ["cash-session"] }); }} />
            )}
          </>
        ) : (
          <>
            <span className="flex-1">الصندوق مغلق. أدخل رصيد البداية (Fond de caisse):</span>
            <Input inputMode="decimal" className="h-9 w-28 text-center font-mono" value={opening} onChange={(e) => setOpening(e.target.value)} />
            <Button size="sm" onClick={async () => {
              const { error } = await supabase.rpc("open_cash_session", { _opening: Number(opening.replace(",", ".")) || 0 });
              if (error) return void toast.error(errorText(error));
              setOpening("");
              void queryClient.invalidateQueries({ queryKey: ["cash-session"] });
            }}>فتح الصندوق</Button>
          </>
        )}
      </div>
      {held.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {held.map((h, i) => (
            <Button key={h.at} size="sm" variant="secondary" onClick={() => {
              if (cart.length) return void toast.error("أفرغ السلة الحالية أو علّقها أولاً");
              setCart(h.cart); saveHeld(held.filter((_, j) => j !== i));
            }}>
              <PauseCircle /> سلة معلّقة {new Date(h.at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} ({h.cart.length})
            </Button>
          ))}
        </div>
      )}
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
                      {l.quantity > stockOf(l.barcode) && (
                        <p className="mt-0.5 flex items-center gap-1 text-xs font-bold text-destructive">
                          <AlertTriangle className="h-3.5 w-3.5" /> المخزون المتوفر: {stockOf(l.barcode)}
                        </p>
                      )}
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
            {discAmount > 0 && <p className="text-xs opacity-80">قبل الخصم {money(subtotal)} · خصم −{money(discAmount)}</p>}
            <p className="text-xs opacity-80">دج</p>
          </div>
          <div className="space-y-1.5">
            <Label>الخصم (Remise)</Label>
            <div className="flex gap-2">
              <Input inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} className="h-10 text-center font-mono" />
              <Button type="button" variant="outline" className="h-10 w-16" onClick={() => setDiscountPct((v) => !v)}>{discountPct ? "%" : "دج"}</Button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>طريقة الدفع</Label>
            <div className="grid grid-cols-3 gap-1.5">
              {([["cash", "نقداً"], ["card", "بطاقة"], ["credit", "كريدي"]] as const).map(([k, l]) => (
                <Button key={k} type="button" size="sm" variant={payment === k ? "default" : "outline"} onClick={() => setPayment(k)}>{l}</Button>
              ))}
            </div>
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
            <Button variant="secondary" className="w-full" onClick={() => { saveHeld([...held, { at: new Date().toISOString(), cart }]); setCart([]); toast.success("تم تعليق السلة"); }}>
              <PauseCircle />
              تعليق السلة
            </Button>
          )}
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

function CloseCash({ cashId, opening, value, setValue, onDone }: { cashId: string; opening: number; value: string; setValue: (v: string) => void; onDone: () => void }) {
  const [summary, setSummary] = useState<{ cash: number; card: number; credit: number; returns: number } | null>(null);
  const load = async () => {
    const [{ data: t }, { data: cs }] = await Promise.all([
      supabase.from("sales_tickets").select("total_amount, payment_method").eq("cash_session_id", cashId),
      supabase.from("cash_sessions").select("opened_at").eq("id", cashId).maybeSingle(),
    ]);
    const { data: r } = await supabase.from("stock_returns").select("total_amount").eq("kind", "customer").gte("created_at", cs?.opened_at ?? new Date().toISOString());
    const by = (m: string) => (t ?? []).filter((x) => x.payment_method === m).reduce((n, x) => n + Number(x.total_amount), 0);
    setSummary({ cash: by("cash"), card: by("card"), credit: by("credit"), returns: (r ?? []).reduce((n, x) => n + Number(x.total_amount), 0) });
  };
  useEffect(() => { void load(); }, [cashId]);
  const expected = summary ? opening + summary.cash - summary.returns : 0;
  return (
    <div className="w-full space-y-2 rounded-xl bg-muted/50 p-3">
      {summary && (
        <p className="text-xs leading-relaxed">
          نقداً: <b>{money(summary.cash)}</b> · بطاقة: <b>{money(summary.card)}</b> · كريدي: <b>{money(summary.credit)}</b> · إرجاعات: <b>−{money(summary.returns)}</b>
          <br />المبلغ المتوقع في الصندوق: <b className="font-mono">{money(expected)}</b> دج
        </p>
      )}
      <div className="flex gap-2">
        <Input inputMode="decimal" placeholder="المبلغ الفعلي في الصندوق" value={value} onChange={(e) => setValue(e.target.value)} className="h-9 font-mono" />
        <Button size="sm" onClick={async () => {
          const n = Number(value.replace(",", ".")) || 0;
          const { error } = await supabase.rpc("close_cash_session", { _id: cashId, _closing: n });
          if (error) return void toast.error(errorText(error));
          toast.success(`تم إغلاق الصندوق · الفرق ${money(n - expected)} دج`);
          onDone();
        }}>تأكيد الإغلاق</Button>
      </div>
    </div>
  );
}
