import { openPrint, ticketHtml, useStoreSettings } from "@/lib/store-settings";
import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { AlertTriangle, Camera, CameraOff, Minus, PauseCircle, Plus, Printer, Search, Trash2, Undo2, Wallet } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { myCashSessionQuery } from "@/lib/pos-queries";
import { isFromPreviousDay } from "@/lib/cash-day";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/stat-card";
import { BarcodeScanner } from "@/components/barcode-scanner";
import { ticketCode } from "@/lib/receipt-code";
import { documentNumber } from "@/lib/document-number";
import { activeSessionQuery, productsQuery, type Product } from "@/lib/queries";
import { findProductByBarcode } from "@/lib/inventory-rules";
import { errorText } from "@/lib/messages";
import { ProductFormDialog } from "@/components/product-form";
import { OnlineOrdersAlert } from "@/components/online-orders-alert";
import { pendingStock, saveDeviceSale, syncDeviceSales, useDeviceSales, retryDeviceSale } from '@/lib/offline-sales';
import { newClientId, useSyncState, withOfflineCopy } from "@/lib/offline";

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
  head: () => ({ meta: [{ title: "نقطة البيع | SMART STOCK" }, { name: 'description', content: 'بيع المنتجات وحفظ الوصولات ومزامنة المبيعات في SMART STOCK.' }, { property: 'og:title', content: 'نقطة البيع | SMART STOCK' }, { property: 'og:description', content: 'إدارة البيع والصندوق ووصولات المتجر.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }] }),
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
  const { online, queue } = useSyncState();
  const { sales: allDeviceSales, lastSyncedAt } = useDeviceSales();
  const deviceSales = allDeviceSales.filter(sale => sale.tenant_id === tenant.id && sale.user_id === userId);
  const { data: cash } = useSuspenseQuery(myCashSessionQuery(tenant.id, userId));
  const [today, setToday] = useState(() => new Date().toDateString());
  useEffect(() => {
    const tick = () => {
      const d = new Date().toDateString();
      setToday((prev) => (prev === d ? prev : d));
      void queryClient.invalidateQueries({ queryKey: ["cash-session"] });
    };
    const id = window.setInterval(() => setToday(new Date().toDateString()), 60_000);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    return () => { window.clearInterval(id); window.removeEventListener("focus", tick); document.removeEventListener("visibilitychange", tick); };
  }, []);
  const staleCash = !!cash && isFromPreviousDay(cash.opened_at) && today.length > 0;
  const [discount, setDiscount] = useState("");
  const [discountPct, setDiscountPct] = useState(false);
  const [payment, setPayment] = useState<"cash" | "card" | "credit">("cash");
  const [customerId, setCustomerId] = useState("");
  const { data: customers = [] } = useQuery({
    queryKey: ["customers", tenant.id],
    networkMode: "always",
    queryFn: () => withOfflineCopy(`customers:${tenant.id}`, async () => {
      const { data, error } = await supabase.from("customers").select("*").eq("tenant_id", tenant.id).order("name");
      if (error) throw error;
      return data;
    }),
  });
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
  useEffect(() => {
    if (!lastSyncedAt) return;
    void queryClient.invalidateQueries({ queryKey: ['products', tenant.id] });
    void queryClient.invalidateQueries({ queryKey: ['sales-tickets'] });
  }, [lastSyncedAt, tenant.id, queryClient]);

  const q = code.trim().toLowerCase();
  const [family, setFamily] = useState<string | null>(null);
  // Local, offline search over the cached catalogue: name, every barcode, family and model, ranked.
  const suggestions = useMemo(() => {
    if (q.length < 1) return [];
    const scored: { p: Product; s: number }[] = [];
    for (const p of products) {
      const name = p.name.toLowerCase();
      const codes = [p.barcode, ...(p.alt_barcodes ?? [])].map((b) => String(b).toLowerCase());
      let s = 0;
      if (codes.includes(q)) s = 100;
      else if (codes.some((b) => b.startsWith(q))) s = 60;
      else if (name.startsWith(q)) s = 50;
      else if (q.length >= 2 && name.includes(q)) s = 40;
      else if (q.length >= 2 && codes.some((b) => b.includes(q))) s = 30;
      else if (q.length >= 2 && [p.famille, (p as { model?: string | null }).model].some((v) => v?.toLowerCase().includes(q))) s = 10;
      if (s) scored.push({ p, s });
    }
    return scored.sort((a, b) => b.s - a.s || a.p.name.localeCompare(b.p.name)).slice(0, 12).map((x) => x.p);
  }, [products, q]);
  const quickProducts = useMemo(
    () => (family ? products.filter((p) => p.famille === family) : products).slice().sort((a, b) => a.name.localeCompare(b.name)).slice(0, 48),
    [products, family],
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

  const [newCode, setNewCode] = useState<string | null>(null);
  const familles = useMemo(() => [...new Set(products.map((p) => p.famille).filter(Boolean) as string[])].sort(), [products]);
  const addCode = (raw: string) => {
    const p = findProductByBarcode(products, raw);
    if (p) return addProduct(p);
    if (suggestions.length === 1 && suggestions[0]) return addProduct(suggestions[0]);
    const code = raw.trim();
    toast.error("منتج غير موجود في الكتالوج", code ? { action: { label: "إضافة كمنتج جديد", onClick: () => setNewCode(code) } } : undefined);
    if (code && /^\S+$/.test(code)) setNewCode(code);
  };

  const setLine = (barcode: string, patch: Partial<CartLine>) =>
    setCart((c) =>
      c.map((l) => (l.barcode === barcode ? { ...l, ...patch } : l)).filter((l) => l.quantity > 0),
    );

  const subtotal = cart.reduce((n, l) => n + l.quantity * l.unit_price, 0);
  const discNum = Number(discount.replace(",", ".")) || 0;
  const discAmount = Math.min(subtotal, Math.max(0, discountPct ? (subtotal * discNum) / 100 : discNum));
  const total = subtotal - discAmount;
  const stockOf = (b: string) => Number(products.find((p) => p.barcode === b)?.system_quantity ?? 0) - pendingStock(deviceSales, b);
  const paidNum = Number(paid.replace(",", ".")) || 0;
  const change = paidNum - total;

  const printReceipt = (lines: CartLine[], number: string) => {
    const sum = lines.reduce((n, l) => n + l.quantity * l.unit_price, 0) - discAmount;
    const pay = { cash: "نقداً", card: "بطاقة / BaridiMob", credit: `بالدين${customerId ? ` — ${customers.find((c) => c.id === customerId)?.name ?? ""}` : ""}` }[payment];
    openPrint(
      ticketHtml(storeSettings, tenant.name, {
        title: `بون رقم ${number}`,
        date: new Date().toLocaleString("fr-FR"),
        lines,
        total: sum,
        code: number ? number.startsWith('LOCAL-') || number.startsWith('BV ') ? number : ticketCode(number) : undefined,
        extra: `${discAmount ? `<p>خصم: -${money(discAmount)}</p>` : ""}<p>الدفع: ${pay}</p>${paidNum ? `<p>المدفوع: ${money(paidNum)} · الباقي: ${money(paidNum - sum)}</p>` : ""}`,
      }),
      "width=380,height=600",
    );
  };

  const checkout = async (print: boolean) => {
    if (cart.length === 0 || saving) return;
    if (!cash) return void toast.error('افتح الصندوق بالإنترنت أولاً.');
    if (staleCash) return void toast.error('كاسة يوم سابق مازالت مفتوحة. أغلقها وافتح كاسة اليوم أولاً.');
    if (payment === 'credit' && !customerId) return void toast.error('اختر الزبون لتسجيل البيع بالدين.');
    setSaving(true);
    try {
    const clientId = newClientId();
    await saveDeviceSale({ client_id: clientId, tenant_id: tenant.id, user_id: userId, session_id: session?.id ?? null, cash_id: cash.id, items: cart, payment, customer_id: payment === 'credit' ? customerId : null, discount: discAmount, sold_at: new Date().toISOString(), status: 'pending' });
    let number = `LOCAL-${clientId}`;
    if (online) {
      try {
      await syncDeviceSales();
      const { data: synced } = await supabase.from('offline_sales_sync').select('ticket_id').eq('client_id', clientId).maybeSingle();
      if (synced) {
        const { data: ticket } = await supabase.from('sales_tickets').select('ticket_number, document_year, document_sequence').eq('id', synced.ticket_id).maybeSingle();
        if (ticket) number = documentNumber("sale", ticket, ticket.ticket_number);
      }
      } catch { /* The committed device sale remains queued; never keep the sold cart on screen. */ }
    }
    if (print) printReceipt(cart, number);
    toast.success('تم حفظ البيع على الجهاز');
    setCart([]);
    setPaid("");
    setDiscount("");
    setPayment("cash");
    setCustomerId("");
    void queryClient.invalidateQueries({ queryKey: ["products", tenant.id] });
    void queryClient.invalidateQueries({ queryKey: ["sales-tickets"] });
    inputRef.current?.focus();
    void syncDeviceSales().catch(console.error);
    } catch (error) { toast.error(errorText(error)); }
    finally { setSaving(false); }
  };
  const checkoutRef = useRef(checkout);
  checkoutRef.current = checkout;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F2") { e.preventDefault(); inputRef.current?.focus(); inputRef.current?.select(); }
      else if (e.key === "F4") { e.preventDefault(); void checkoutRef.current(true); }
      else if (e.key === "F9") { e.preventDefault(); void checkoutRef.current(false); }
      else if (e.key === "Escape") { setCode(""); inputRef.current?.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="space-y-5">
      {(!online || deviceSales.length > 0) && <div className="space-y-2 border border-warning bg-warning/10 p-3 text-sm">
        <p className="font-bold">المبيعات المحفوظة على الجهاز</p>
        <p>{deviceSales.length}</p>
        {deviceSales.map(sale => <div key={sale.client_id} className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs">LOCAL-{sale.client_id.slice(0, 8)}</span>
          <span>{money(sale.items.reduce((sum,item) => sum + item.quantity * item.unit_price, 0) - sale.discount)} دج</span>
          <span className={sale.status === 'failed' ? 'text-destructive' : 'text-muted-foreground'}>{sale.status === 'failed' ? errorText({ message: sale.error ?? '' }) : 'في الانتظار'}</span>
          {sale.status === 'failed' && <Button size="sm" variant="outline" onClick={() => void retryDeviceSale(sale)}>إعادة الإرسال</Button>}
        </div>)}
      </div>}
      <OnlineOrdersAlert tenantId={tenant.id} />
      <ProductFormDialog
        product={null}
        open={newCode !== null}
        initialBarcode={newCode ?? ""}
        familles={familles}
        tenantId={tenant.id}
        onOpenChange={(o) => !o && setNewCode(null)}
        onSaved={(saved) => {
          setNewCode(null);
          void queryClient.invalidateQueries({ queryKey: ["products", tenant.id] });
          if (saved) addProduct(saved);
        }}
      />
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
        {cash && staleCash ? (
          <>
            <span className="flex flex-1 items-center gap-2 font-medium text-destructive"><AlertTriangle className="h-4 w-4" />كاسة يوم {new Date(cash.opened_at).toLocaleDateString("fr-FR")} مازالت مفتوحة. أغلقها وافتح كاسة اليوم.</span>
            <CloseCash rollover cashId={cash.id} opening={Number(cash.opening_amount)} value={closing ?? ""} setValue={setClosing} onDone={() => { setClosing(null); void queryClient.invalidateQueries({ queryKey: ["cash-session"] }); }} />
          </>
        ) : cash ? (
          <>
            <span className="flex-1">الصندوق مفتوح منذ {new Date(cash.opened_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} · رصيد البداية <b className="font-mono">{money(Number(cash.opening_amount))}</b> دج</span>
            {closing === null ? (
              <Button size="sm" variant="outline" disabled={!online || deviceSales.length > 0 || queue.length > 0} onClick={() => setClosing("")}>إغلاق الصندوق</Button>
            ) : (
              <CloseCash cashId={cash.id} opening={Number(cash.opening_amount)} value={closing} setValue={setClosing} onDone={() => { setClosing(null); void queryClient.invalidateQueries({ queryKey: ["cash-session"] }); }} />
            )}
          </>
        ) : (
          <>
            <span className="flex-1">الصندوق مغلق. أدخل رصيد البداية (Fond de caisse):</span>
            <Input inputMode="decimal" className="h-9 w-28 text-center font-mono" value={opening} onChange={(e) => setOpening(e.target.value)} />
            <Button size="sm" disabled={!online} onClick={async () => {
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
      <div className="grid gap-4 md:grid-cols-[1fr_19rem] lg:grid-cols-[1fr_22rem] xl:grid-cols-[1fr_26rem]">
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
          <p className="hidden flex-wrap gap-3 text-xs text-muted-foreground md:flex">
            <span><kbd className="rounded border px-1 font-mono">F2</kbd> البحث</span>
            <span><kbd className="rounded border px-1 font-mono">F4</kbd> بيع وطباعة</span>
            <span><kbd className="rounded border px-1 font-mono">F9</kbd> بيع دون طباعة</span>
            <span><kbd className="rounded border px-1 font-mono">Esc</kbd> مسح البحث</span>
          </p>
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

          {!q && (
            <div className="space-y-2">
              <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
                <Button size="sm" variant={family === null ? "default" : "outline"} className="shrink-0" onClick={() => setFamily(null)}>الكل</Button>
                {familles.map((f) => (
                  <Button key={f} size="sm" variant={family === f ? "default" : "outline"} className="shrink-0" onClick={() => setFamily(f)}>{f}</Button>
                ))}
              </div>
              <div className="grid max-h-72 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
                {quickProducts.map((p) => (
                  <button key={p.id} type="button" onClick={() => addProduct(p)} className="surface-card flex min-h-16 flex-col justify-between p-2.5 text-start transition-colors hover:bg-muted/40 active:scale-[0.98]">
                    <span className="line-clamp-2 text-sm font-bold">{p.name}</span>
                    <span className="font-mono text-xs text-primary">{money(Number(p.selling_price))}</span>
                  </button>
                ))}
              </div>
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

        <div className="surface-card h-fit space-y-4 p-5 md:sticky md:top-20">
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
            {payment === "credit" && (
              <select aria-label="الزبون" value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="h-10 w-full rounded-md border bg-background px-2 text-sm">
                <option value="">— اختر الزبون —</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ""}</option>)}
              </select>
            )}
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

function CloseCash({ cashId, opening, value, setValue, onDone, rollover = false }: { rollover?: boolean; cashId: string; opening: number; value: string; setValue: (v: string) => void; onDone: () => void }) {
  const [summary, setSummary] = useState<{ cash: number; card: number; credit: number; returns: number; debt: number; out: number } | null>(null);
  const load = async () => {
    const [{ data: t }, { data: cs }] = await Promise.all([
      supabase.from("sales_tickets").select("total_amount, payment_method").eq("cash_session_id", cashId),
      supabase.from("cash_sessions").select("opened_at").eq("id", cashId).maybeSingle(),
    ]);
    const { data: r } = await supabase.from("stock_returns").select("total_amount").eq("kind", "customer").gte("created_at", cs?.opened_at ?? new Date().toISOString());
    const { data: dp } = await supabase.from("customer_payments").select("amount").eq("cash_session_id", cashId);
    const [{ data: sp }, { data: ex }] = await Promise.all([
      supabase.from("supplier_payments").select("amount").eq("cash_session_id", cashId),
      supabase.from("expenses").select("amount").eq("cash_session_id", cashId),
    ]);
    const out = [...(sp ?? []), ...(ex ?? [])].reduce((n, x) => n + Number(x.amount), 0);
    const by = (m: string) => (t ?? []).filter((x) => x.payment_method === m).reduce((n, x) => n + Number(x.total_amount), 0);
    setSummary({ cash: by("cash"), card: by("card"), credit: by("credit"), returns: (r ?? []).reduce((n, x) => n + Number(x.total_amount), 0), debt: (dp ?? []).reduce((n, x) => n + Number(x.amount), 0), out });
  };
  useEffect(() => { void load(); }, [cashId]);
  const expected = summary ? opening + summary.cash + summary.debt - summary.returns - summary.out : 0;
  return (
    <div className="w-full space-y-2 rounded-xl bg-muted/50 p-3">
      {summary && (
        <p className="text-xs leading-relaxed">
          نقداً: <b>{money(summary.cash)}</b> · بطاقة: <b>{money(summary.card)}</b> · كريدي: <b>{money(summary.credit)}</b> · تسديد ديون: <b>+{money(summary.debt)}</b> · إرجاعات: <b>−{money(summary.returns)}</b> · مصاريف ومورّدون: <b>−{money(summary.out)}</b>
          <br />المبلغ المتوقع في الصندوق: <b className="font-mono">{money(expected)}</b> دج
        </p>
      )}
      <div className="flex gap-2">
        <Input inputMode="decimal" placeholder="المبلغ الفعلي في الصندوق" value={value} onChange={(e) => setValue(e.target.value)} className="h-9 font-mono" />
        <Button size="sm" onClick={async () => {
          const n = value.trim() === "" && rollover ? expected : Number(value.replace(",", ".")) || 0;
          const { error } = await supabase.rpc("close_cash_session", { _id: cashId, _closing: n });
          if (error) return void toast.error(errorText(error));
          if (rollover) {
            const { error: e2 } = await supabase.rpc("open_cash_session", { _opening: n });
            if (e2) { toast.error(errorText(e2)); return onDone(); }
            toast.success(`تم إغلاق كاسة البارح وفتح كاسة اليوم برصيد ${money(n)} دج`);
          } else toast.success(`تم إغلاق الصندوق · الفرق ${money(n - expected)} دج`);
          onDone();
        }}>{rollover ? "إغلاق وفتح كاسة اليوم" : "تأكيد الإغلاق"}</Button>
      </div>
    </div>
  );
}
