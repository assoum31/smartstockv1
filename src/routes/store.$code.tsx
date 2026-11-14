import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Minus, Plus, Search, ShoppingBag, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { suggestFor, searchByName } from "@/lib/store-rules";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export const Route = createFileRoute("/store/$code")({
  head: () => ({
    meta: [
      { title: "متجري أونلاين | SMART STOCK" },
      { name: "description", content: "تصفح السلع المتوفرة واطلب مباشرة من المتجر." },
      { property: "og:title", content: "متجري أونلاين | SMART STOCK" },
      { property: "og:description", content: "تصفح السلع المتوفرة واطلب مباشرة من المتجر." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StorePage,
});

type Item = { barcode: string; name: string; famille: string | null; selling_price: number; available: number; image_url: string | null; description: string | null; related: string[] | null };
type Info = { title: string; tagline: string | null; color: string | null; banner: string | null; logo: string | null; phone: string | null; address: string | null; enabled: boolean };
const money = (n: number) => `${n.toLocaleString("fr-DZ", { maximumFractionDigits: 2 })}\u00A0DA`;

function StorePage() {
  const { code } = Route.useParams();
  const { data = [], isLoading } = useQuery({
    queryKey: ["public-store", code],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("public_store_catalog_v2", { _code: code });
      if (error) throw new Error(error.message);
      return data as Item[];
    },
  });
  const { data: info } = useQuery({
    queryKey: ["public-store-info", code],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("public_store_info", { _code: code });
      if (error) throw new Error(error.message);
      return (data?.[0] ?? null) as Info | null;
    },
  });
  const [picked, setPicked] = useState<Item | null>(null);
  const [focus, setFocus] = useState(false);
  const cartKey = `smartstock_cart_${code}`;
  const [cart, setCart] = useState<Record<string, number>>({});
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try { setCart(JSON.parse(localStorage.getItem(cartKey) ?? "{}")); } catch { /* empty */ }
    setReady(true);
  }, [cartKey]);
  useEffect(() => { if (ready) localStorage.setItem(cartKey, JSON.stringify(cart)); }, [cart, ready, cartKey]);

  const [q, setQ] = useState("");
  const [fam, setFam] = useState("all");
  const [open, setOpen] = useState(false);
  const familles = useMemo(() => [...new Set(data.map((d) => d.famille).filter(Boolean) as string[])].sort(), [data]);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return data.filter((d) => (fam === "all" || d.famille === fam) && (!s || d.name.toLowerCase().includes(s) || d.barcode.includes(s))).slice(0, 300);
  }, [data, q, fam]);
  const byCode = useMemo(() => new Map(data.map((d) => [d.barcode, d])), [data]);
  const lines = Object.entries(cart).map(([b, n]) => ({ item: byCode.get(b), n })).filter((l) => l.item) as { item: Item; n: number }[];
  const total = lines.reduce((a, l) => a + l.n * Number(l.item.selling_price), 0);
  const count = lines.reduce((a, l) => a + l.n, 0);
  const setQty = (b: string, n: number) => setCart((c) => { const x = { ...c }; if (n <= 0) delete x[b]; else x[b] = n; return x; });
  const storeName = info?.title ?? "متجري أونلاين";
  const accent = info?.color || undefined;
  const hits = useMemo(() => searchByName(data, q), [data, q]);
  const sugg = useMemo(() => (picked ? suggestFor(picked, data, new Set(Object.keys(cart))) : []), [picked, data, cart]);
  const add = (d: Item) => { setQty(d.barcode, (cart[d.barcode] ?? 0) + 1); setPicked(d); };

  return (
    <div className="min-h-screen bg-background" style={accent ? ({ "--primary": accent } as React.CSSProperties) : undefined}>
      <header className="sticky top-0 z-20 border-b bg-card/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
          {info?.logo && <img src={info.logo} alt="" className="h-9 w-9 rounded object-contain" />}
          <h1 className="flex-1 truncate text-lg font-extrabold">{storeName}</h1>
          <Button onClick={() => setOpen(true)} className="relative">
            <ShoppingBag />السلة
            {count > 0 && <span className="rounded-full bg-background px-2 text-xs font-bold text-foreground">{count}</span>}
          </Button>
        </div>
      </header>
      {(info?.banner || info?.tagline) && (
        <div className="relative mx-auto max-w-6xl overflow-hidden px-4 pt-4">
          {info?.banner && <img src={info.banner} alt="" className="h-40 w-full rounded-xl object-cover sm:h-56" />}
          {info?.tagline && <p className="mt-3 text-center text-lg font-bold">{info.tagline}</p>}
        </div>
      )}
      {info && !info.enabled && <p className="p-8 text-center text-muted-foreground">المتجر مغلق حاليا</p>}
      <main className="mx-auto max-w-6xl space-y-4 p-4">
        {familles.length > 0 && (
          <div className="no-scrollbar flex gap-2 overflow-x-auto">
            {["all", ...familles].map((f) => (
              <button key={f} type="button" onClick={() => setFam(f)} className={`shrink-0 rounded-full border px-4 py-1.5 text-sm font-bold ${fam === f ? "bg-primary text-primary-foreground" : "bg-card"}`}>{f === "all" ? "الكل" : f}</button>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute start-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input className="ps-9" value={q} onFocus={() => setFocus(true)} onBlur={() => setTimeout(() => setFocus(false), 200)} onChange={(e) => setQ(e.target.value)} placeholder="ابحث عن سلعة بالاسم" />
            {focus && hits.length > 0 && (
              <ul className="absolute inset-x-0 top-11 z-30 max-h-80 overflow-y-auto rounded-lg border bg-popover shadow-lg">
                {hits.map((h) => (
                  <li key={h.barcode}><button type="button" className="flex w-full items-center gap-2 p-2 text-start text-sm hover:bg-muted" onMouseDown={(e) => e.preventDefault()} onClick={() => { add(h); setQ(""); setFocus(false); }}>
                    {h.image_url ? <img src={h.image_url} alt="" className="h-8 w-8 rounded object-cover" /> : <span className="h-8 w-8 rounded bg-muted" />}
                    <span className="min-w-0 flex-1 truncate">{h.name}</span><span className="font-bold text-primary">{money(Number(h.selling_price))}</span>
                  </button></li>
                ))}
              </ul>
            )}
          </div>
          {false && (
            <select value={fam} onChange={(e) => setFam(e.target.value)} className="h-10 rounded-md border bg-background px-3 text-sm" aria-label="الفئة">
              <option value="all">كل الفئات</option>
              {familles.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          )}
        </div>
        {isLoading && <p className="p-8 text-center text-muted-foreground">جاري التحميل…</p>}
        {!isLoading && !data.length && <p className="p-8 text-center text-muted-foreground">لا توجد سلع متوفرة حاليا</p>}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {list.map((d) => {
            const n = cart[d.barcode] ?? 0;
            return (
              <div key={d.barcode} className="surface-card flex flex-col gap-2 p-3">
                {d.image_url ? <img src={d.image_url} alt={d.name} loading="lazy" className="aspect-square w-full rounded-lg bg-muted object-cover" /> : <div className="flex aspect-square items-center justify-center rounded-lg bg-muted text-3xl font-extrabold text-primary">{d.name.slice(0, 2)}</div>}
                <p className="line-clamp-2 min-h-10 text-sm font-bold">{d.name}</p>
                {d.famille && <p className="text-xs text-muted-foreground">{d.famille}</p>}
                <p className="font-extrabold text-primary">{money(Number(d.selling_price))}</p>
                {n === 0 ? (
                  <Button size="sm" onClick={() => add(d)}><Plus />أضف للسلة</Button>
                ) : (
                  <div className="flex items-center justify-between gap-1">
                    <Button size="icon" variant="outline" aria-label="إنقاص" onClick={() => setQty(d.barcode, n - 1)}><Minus /></Button>
                    <span className="font-bold">{n}</span>
                    <Button size="icon" variant="outline" aria-label="زيادة" disabled={n >= Number(d.available)} onClick={() => setQty(d.barcode, n + 1)}><Plus /></Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </main>
      {picked && sugg.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 p-3 shadow-lg backdrop-blur">
          <div className="mx-auto max-w-6xl">
            <div className="mb-2 flex items-center justify-between text-sm"><span className="font-bold">قد يعجبك أيضا مع «{picked.name}»</span><button type="button" className="text-muted-foreground" onClick={() => setPicked(null)}>✕</button></div>
            <div className="no-scrollbar flex gap-2 overflow-x-auto">
              {sugg.map((x) => (
                <button key={x.barcode} type="button" onClick={() => add(x)} className="flex w-32 shrink-0 flex-col gap-1 rounded-lg border bg-background p-2 text-start text-xs">
                  {x.image_url ? <img src={x.image_url} alt="" className="h-16 w-full rounded object-cover" /> : <span className="flex h-16 items-center justify-center rounded bg-muted font-bold">{x.name.slice(0, 2)}</span>}
                  <span className="line-clamp-2 font-bold">{x.name}</span><span className="text-primary">{money(Number(x.selling_price))} +</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader><SheetTitle>السلة</SheetTitle></SheetHeader>
          <Checkout code={code} lines={lines} total={total} setQty={setQty} onDone={() => { setCart({}); setOpen(false); }} />
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Checkout({ code, lines, total, setQty, onDone }: { code: string; lines: { item: Item; n: number }[]; total: number; setQty: (b: string, n: number) => void; onDone: () => void }) {
  const [f, setF] = useState({ name: "", phone: "", whatsapp: "", email: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (f.name.trim().length < 2) { toast.error("أدخل اسمك"); return; }
    if (!/^[0-9+ ]{8,20}$/.test(f.phone.trim())) { toast.error("رقم الهاتف غير صالح"); return; }
    setBusy(true);
    const { data, error } = await supabase.rpc("place_online_order", {
      _code: code, _name: f.name, _phone: f.phone, _whatsapp: f.whatsapp, _email: f.email, _notes: f.notes,
      _items: lines.map((l) => ({ barcode: l.item.barcode, quantity: l.n })),
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`تم إرسال طلبيتك رقم ${data}، سنتصل بك للتأكيد`);
    onDone();
  };
  if (!lines.length) return <p className="p-6 text-center text-sm text-muted-foreground">السلة فارغة</p>;
  const field = (id: keyof typeof f, label: string, ltr = false) => (
    <div className="space-y-1">
      <Label htmlFor={`o-${id}`}>{label}</Label>
      <Input id={`o-${id}`} dir={ltr ? "ltr" : undefined} inputMode={ltr && id !== "email" ? "tel" : undefined} value={f[id]} onChange={(e) => setF({ ...f, [id]: e.target.value })} />
    </div>
  );
  return (
    <div className="space-y-4 p-4">
      <ul className="divide-y rounded-lg border">
        {lines.map(({ item, n }) => (
          <li key={item.barcode} className="flex items-center gap-2 p-2 text-sm">
            <span className="min-w-0 flex-1 truncate">{item.name} × {n}</span>
            <span className="whitespace-nowrap font-bold">{money(n * Number(item.selling_price))}</span>
            <Button size="icon" variant="ghost" aria-label="حذف" onClick={() => setQty(item.barcode, 0)}><Trash2 /></Button>
          </li>
        ))}
      </ul>
      <p className="flex justify-between text-lg font-extrabold"><span>المجموع</span><span>{money(total)}</span></p>
      {field("name", "الاسم الكامل")}
      {field("phone", "رقم الهاتف", true)}
      {field("whatsapp", "رقم الواتساب", true)}
      {field("email", "البريد الإلكتروني (اختياري)", true)}
      {field("notes", "ملاحظة (العنوان، الوقت…)")}
      <Button className="w-full" disabled={busy} onClick={() => void send()}>تأكيد الطلبية</Button>
    </div>
  );
}
