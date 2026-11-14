import { useMemo, useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { queryOptions, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, Boxes, Search, Warehouse } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { money } from "@/lib/pos-queries";
import { formatQty } from "@/lib/messages";
import { filterByQuery } from "@/lib/store-rules";

type P = { barcode: string; name: string; famille: string | null; system_quantity: number; purchase_price: number; selling_price: number; min_stock: number; alt_barcodes: string[] | null };
const KIND: Record<string, string> = { receipt: "وصل سلع", sale: "بيع", customer_return: "إرجاع زبون", supplier_return: "إرجاع مورد" };
const PER_PAGE = 50;

const productsQuery = (t: string) => queryOptions({
  queryKey: ["stock-products", t],
  queryFn: async () => {
    const all: P[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from("products").select("barcode,name,famille,system_quantity,purchase_price,selling_price,min_stock,alt_barcodes").eq("tenant_id", t).order("name").range(from, from + 999);
      if (error) throw error;
      all.push(...(data as P[]));
      if (data.length < 1000) break;
    }
    return all;
  },
});
const movesQuery = (t: string, barcode?: string) => queryOptions({
  queryKey: ["stock-moves", t, barcode ?? ""],
  queryFn: async () => {
    let q = supabase.from("stock_movements").select("*").eq("tenant_id", t).order("created_at", { ascending: false }).limit(barcode ? 1000 : 300);
    if (barcode) q = q.eq("barcode", barcode);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  },
});

export const Route = createFileRoute("/_authenticated/stock")({
  beforeLoad: ({ context }) => {
    if (!context.me.canSeeProducts || !context.me.tenant) throw redirect({ to: context.me.homePath });
    return { tenant: context.me.tenant };
  },
  loader: ({ context }) => Promise.all([context.queryClient.ensureQueryData(productsQuery(context.tenant.id)), context.queryClient.ensureQueryData(movesQuery(context.tenant.id))]),
  head: () => ({ meta: [{ title: "المخزون وحركة السلع | SMART STOCK" }, { name: "description", content: "قيمة المخزون، تنبيهات النفاد وسجل حركة السلع." }] }),
  component: StockPage,
});

function StockPage() {
  const { tenant } = Route.useRouteContext();
  const { data: products } = useSuspenseQuery(productsQuery(tenant.id));
  const { data: moves } = useSuspenseQuery(movesQuery(tenant.id));
  const [tab, setTab] = useState<"moves" | "alerts" | "stock">("moves");
  const [kind, setKind] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<P | null>(null);
  const [fam, setFam] = useState("");
  const [showZero, setShowZero] = useState(false);
  const [sort, setSort] = useState<"qty" | "value" | "name">("qty");
  const [page, setPage] = useState(1);

  const kpi = useMemo(() => {
    let buy = 0, sell = 0, out = 0, low = 0, units = 0, refs = 0;
    for (const p of products) {
      const n = Math.max(0, Number(p.system_quantity));
      buy += n * Number(p.purchase_price); sell += n * Number(p.selling_price); units += n;
      if (n > 0) refs++;
      if (Number(p.system_quantity) <= 0) out++; else if (Number(p.min_stock) > 0 && Number(p.system_quantity) <= Number(p.min_stock)) low++;
    }
    return { buy, sell, margin: sell - buy, out, low, units, refs };
  }, [products]);
  const alerts = useMemo(() => products.filter((p) => Number(p.system_quantity) <= 0 || (Number(p.min_stock) > 0 && Number(p.system_quantity) <= Number(p.min_stock))), [products]);
  const s = q.trim().toLowerCase();
  const shownMoves = moves.filter((m) => (!kind || m.kind === kind) && (!s || `${m.product_name} ${m.barcode}`.toLowerCase().includes(s)));
  const shownAlerts = alerts.filter((p) => !s || `${p.name} ${p.barcode}`.toLowerCase().includes(s));
  const byBarcode = (b: string | null) => products.find((p) => p.barcode === b) ?? null;
  const familles = useMemo(() => [...new Set(products.map((p) => p.famille).filter((f): f is string => !!f))].sort((a, b) => a.localeCompare(b, ["ar", "fr"])), [products]);
  const stockRows = useMemo(() => {
    const rows = products.filter((p) => showZero || Number(p.system_quantity) > 0);
    const found = filterByQuery(rows, q).filter((p) => !fam || p.famille === fam);
    return found.sort((a, b) => sort === "name"
      ? a.name.localeCompare(b.name, ["ar", "fr"])
      : sort === "value"
        ? Number(b.system_quantity) * Number(b.selling_price) - Number(a.system_quantity) * Number(a.selling_price)
        : Number(b.system_quantity) - Number(a.system_quantity));
  }, [products, q, fam, showZero, sort]);
  const pageCount = Math.max(1, Math.ceil(stockRows.length / PER_PAGE));
  const curPage = Math.min(page, pageCount);
  const pageRows = stockRows.slice((curPage - 1) * PER_PAGE, curPage * PER_PAGE);

  return (
    <div className="space-y-4">
      <PageHeader title="المخزون" subtitle="قيمة السلع وحركة المخزون" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label="قيمة المخزون (شراء)" value={money(kpi.buy)} />
        <Kpi label="قيمة المخزون (بيع)" value={money(kpi.sell)} />
        <Kpi label="الربح المتوقع" value={money(kpi.margin)} />
        <Kpi label="سلع نافدة" value={String(kpi.out)} danger />
        <Kpi label="قريبة من النفاد" value={String(kpi.low)} danger />
      </div>
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setTab("moves")} className={`rounded-full px-4 py-2 text-sm font-semibold ${tab === "moves" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>حركة المخزون</button>
        <button onClick={() => setTab("alerts")} className={`rounded-full px-4 py-2 text-sm font-semibold ${tab === "alerts" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>تنبيهات النفاد ({alerts.length})</button>
      </div>
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-0 flex-1"><Search className="absolute start-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="ps-9" placeholder="ابحث بالاسم أو الباركود" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        {tab === "moves" && (
          <select className="h-10 rounded-md border bg-background px-3 text-sm" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">كل الحركات</option>
            {Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        )}
      </div>
      {tab === "moves" ? (
        <div className="divide-y rounded-xl border bg-card">
          {shownMoves.length === 0 && <p className="p-6 text-center text-muted-foreground">لا توجد حركات.</p>}
          {shownMoves.map((m) => {
            const inn = Number(m.qty) > 0;
            return (
              <button key={`${m.kind}-${m.id}`} onClick={() => setOpen(byBarcode(m.barcode))} className="flex w-full items-center gap-3 p-3 text-start hover:bg-muted/50">
                <span className={`rounded-full p-2 ${inn ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"}`}>{inn ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{m.product_name}</p>
                  <p className="truncate text-xs text-muted-foreground">{KIND[m.kind ?? ""]} {m.ref} · {m.actor} · {new Date(m.created_at ?? "").toLocaleString()}</p>
                </div>
                <span className={`font-mono font-bold ${inn ? "text-primary" : "text-destructive"}`}>{inn ? "+" : ""}{formatQty(Number(m.qty))}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="divide-y rounded-xl border bg-card">
          {shownAlerts.length === 0 && <p className="p-6 text-center text-muted-foreground">لا توجد تنبيهات.</p>}
          {shownAlerts.map((p) => (
            <button key={p.barcode} onClick={() => setOpen(p)} className="flex w-full items-center gap-3 p-3 text-start hover:bg-muted/50">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <div className="min-w-0 flex-1"><p className="truncate font-semibold">{p.name}</p><p className="truncate text-xs text-muted-foreground">{p.barcode} · الحد الأدنى {formatQty(Number(p.min_stock))}</p></div>
              <Badge variant={Number(p.system_quantity) <= 0 ? "destructive" : "secondary"}>{Number(p.system_quantity) <= 0 ? "نافد" : "منخفض"} · {formatQty(Number(p.system_quantity))}</Badge>
            </button>
          ))}
        </div>
      )}
      <ProductCard tenantId={tenant.id} product={open} onClose={() => setOpen(null)} />
    </div>
  );
}

function Kpi({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="rounded-xl border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 truncate text-lg font-bold ${danger ? "text-destructive" : ""}`}>{value}</p>
    </div>
  );
}

function ProductCard({ tenantId, product, onClose }: { tenantId: string; product: P | null; onClose: () => void }) {
  const { data = [] } = useQuery({ ...movesQuery(tenantId, product?.barcode), enabled: !!product });
  const inn = data.filter((m) => Number(m.qty) > 0).reduce((a, m) => a + Number(m.qty), 0);
  const out = data.filter((m) => Number(m.qty) < 0).reduce((a, m) => a - Number(m.qty), 0);
  return (
    <Dialog open={!!product} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Boxes className="h-5 w-5" />بطاقة حركة المنتج</DialogTitle></DialogHeader>
        {product && (
          <div className="space-y-3">
            <div><p className="font-bold">{product.name}</p><p className="text-xs text-muted-foreground">{product.barcode} · {product.famille ?? "—"}</p></div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-muted p-2"><p className="text-xs">المخزون الحالي</p><p className="font-bold"><Warehouse className="inline h-3 w-3" /> {formatQty(Number(product.system_quantity))}</p></div>
              <div className="rounded-lg bg-muted p-2"><p className="text-xs">إجمالي الدخول</p><p className="font-bold text-primary">+{formatQty(inn)}</p></div>
              <div className="rounded-lg bg-muted p-2"><p className="text-xs">إجمالي الخروج</p><p className="font-bold text-destructive">-{formatQty(out)}</p></div>
            </div>
            <div className="divide-y rounded-lg border">
              {data.length === 0 && <p className="p-4 text-center text-sm text-muted-foreground">لا توجد حركات.</p>}
              {data.map((m) => (
                <div key={`${m.kind}-${m.id}`} className="flex items-center justify-between gap-2 p-2 text-sm">
                  <div className="min-w-0"><p className="font-medium">{KIND[m.kind ?? ""]} {m.ref}</p><p className="truncate text-xs text-muted-foreground">{m.actor} · {new Date(m.created_at ?? "").toLocaleString()}</p></div>
                  <span className={`font-mono font-bold ${Number(m.qty) > 0 ? "text-primary" : "text-destructive"}`}>{Number(m.qty) > 0 ? "+" : ""}{formatQty(Number(m.qty))}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
