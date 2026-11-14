import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Minus, Plus, Search, ShoppingBag, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

type Item = { barcode: string; name: string; famille: string | null; selling_price: number; available: number; store_name: string };
const money = (n: number) => `${n.toLocaleString("fr-DZ", { maximumFractionDigits: 2 })}\u00A0DA`;

function StorePage() {
  const { code } = Route.useParams();
  const { data = [], isLoading } = useQuery({
    queryKey: ["public-store", code],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("public_store_catalog", { _code: code });
      if (error) throw new Error(error.message);
      return data as Item[];
    },
  });
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
  const storeName = data[0]?.store_name ?? "متجري أونلاين";

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b bg-card/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
          <h1 className="flex-1 truncate text-lg font-extrabold">{storeName}</h1>
          <Button onClick={() => setOpen(true)} className="relative">
            <ShoppingBag />السلة
            {count > 0 && <span className="rounded-full bg-background px-2 text-xs font-bold text-foreground">{count}</span>}
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl space-y-4 p-4">
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute start-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input className="ps-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث عن سلعة" />
          </div>
          {familles.length > 0 && (
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
                <div className="flex aspect-square items-center justify-center rounded-lg bg-muted text-3xl font-extrabold text-primary">{d.name.slice(0, 2)}</div>
                <p className="line-clamp-2 min-h-10 text-sm font-bold">{d.name}</p>
                {d.famille && <p className="text-xs text-muted-foreground">{d.famille}</p>}
                <p className="font-extrabold text-primary">{money(Number(d.selling_price))}</p>
                {n === 0 ? (
                  <Button size="sm" onClick={() => setQty(d.barcode, 1)}><Plus />أضف للسلة</Button>
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
