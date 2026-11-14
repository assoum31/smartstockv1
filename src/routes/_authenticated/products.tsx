import { useMemo, useRef, useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Package,
  Printer,
  Search,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/stat-card";
import { ProductFormDialog } from "@/components/product-form";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useStoreSettings } from "@/lib/store-settings";
import { PriceCell } from "@/components/price-cell";
import { LabelPrintDialog, type LabelProduct } from "@/components/label-print-dialog";
import { downloadWorkbook, readSheetAsText } from "@/lib/excel";
import { chunk, parseProductRows, type ProductImportResult } from "@/lib/inventory-rules";
import { productsQuery } from "@/lib/queries";
import { formatQty } from "@/lib/messages";

export const Route = createFileRoute("/_authenticated/products")({
  beforeLoad: ({ context }) => {
    if (!context.me.canSeeProducts || !context.me.tenant) throw redirect({ to: context.me.homePath });
    return { tenant: context.me.tenant, isManager: context.me.isManager, canSell: context.me.canSell };
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(productsQuery(context.tenant.id)),
  head: () => ({ meta: [{ title: "المنتجات | SMART STOCK" }] }),
  component: ProductsPage,
});

const IMPORT_CHUNK = 500;

function ProductsPage() {
  const { tenant, isManager, canSell } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const storeSettings = useStoreSettings(tenant.id);
  const { data: products } = useSuspenseQuery(productsQuery(tenant.id));
  const [search, setSearch] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<(ProductImportResult & { fileName: string }) | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [labelItems, setLabelItems] = useState<LabelProduct[] | null>(null);
  const [editing, setEditing] = useState<import("@/lib/queries").Product | "new" | null>(null);
  const [fam, setFam] = useState("");
  const familles = useMemo(() => [...new Set(products.map((p) => p.famille).filter(Boolean) as string[])].sort(), [products]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = fam ? products.filter((p) => p.famille === fam) : products;
    const list = q
      ? base.filter(
          (p) =>
            p.barcode.toLowerCase().includes(q) ||
            (p.alt_barcodes ?? []).some((b) => b.toLowerCase().includes(q)) ||
            p.name.toLowerCase().includes(q) ||
            (p.model ?? "").toLowerCase().includes(q),
        )
      : base;
    return list;
  }, [products, search, fam]);
  const PER_PAGE = 50;
  const [page, setPage] = useState(1);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const setOnline = async (ids: string[], v: boolean) => {
    if (!ids.length) return;
    setBusy(true);
    for (let i = 0; i < ids.length; i += 200) {
      const { error } = await supabase.from("products").update({ online_visible: v }).in("id", ids.slice(i, i + 200));
      if (error) { setBusy(false); return void toast.error(error.message); }
    }
    setBusy(false); setSel(new Set());
    toast.success(v ? `تم عرض ${ids.length} منتج في المتجر` : `تم إخفاء ${ids.length} منتج من المتجر`);
    void queryClient.invalidateQueries({ queryKey: ["products", tenant.id] });
  };
  const pageCount = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const curPage = Math.min(page, pageCount);
  const pageItems = filtered.slice((curPage - 1) * PER_PAGE, curPage * PER_PAGE);

  const onFile = async (file: File) => {
    try {
      const raw = await readSheetAsText(file);
      setParsed({ ...parseProductRows(raw), fileName: file.name });
    } catch {
      toast.error("تعذرت قراءة الملف. استعمل ملف Excel أو CSV.");
    }
  };

  const runImport = async () => {
    if (!parsed) return;
    const parts = chunk(parsed.rows, IMPORT_CHUNK);
    setProgress(0);
    let done = 0;
    for (const part of parts) {
      const { error } = await supabase.from("products").upsert(
        part.map((r) => ({ ...r, tenant_id: tenant.id, updated_at: new Date().toISOString() })),
        { onConflict: "tenant_id,barcode" },
      );
      if (error) {
        toast.error(`توقف الاستيراد بعد ${done} منتج.`);
        setProgress(null);
        void queryClient.invalidateQueries({ queryKey: ["products", tenant.id] });
        return;
      }
      done += part.length;
      setProgress(Math.round((done / parsed.rows.length) * 100));
    }
    toast.success(`تم استيراد ${done} منتج`);
    setParsed(null);
    setProgress(null);
    void queryClient.invalidateQueries({ queryKey: ["products", tenant.id] });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="المنتجات"
        subtitle={`${products.length} منتج في كتالوج ${tenant.name}`}
        actions={
          <>
            <Button
              variant="outline"
              onClick={() =>
                downloadWorkbook("smartstock-modele-produits.xlsx", [
                  {
                    name: "produits",
                    headers: ["barcode", "name", "location", "system_quantity", "purchase_price", "selling_price", "carton_size", "alt_barcodes", "famille", "model", "min_stock"],
                    rows: [["0061112457800", "زيت زيتون 1L", "Rayon B2", 24, 850, 1000, 12, "0061112457817, 0061112457824", "Alimentation", "Huile", 5]],
                    textColumns: [0],
                  },
                ])
              }
            >
              <Download />
              نموذج Excel
            </Button>
            <Button
              variant="outline"
              disabled={products.length === 0}
              onClick={() =>
                downloadWorkbook("smartstock-produits.xlsx", [
                  {
                    name: "produits",
                    headers: ["barcode", "name", "location", "system_quantity", "purchase_price", "selling_price", "carton_size", "alt_barcodes", "famille", "model", "min_stock"],
                    rows: products.map((p) => [
                      p.barcode,
                      p.name,
                      p.default_location ?? "",
                      Number(p.system_quantity),
                      Number(p.purchase_price),
                      Number(p.selling_price),
                      Number(p.carton_size),
                      (p.alt_barcodes ?? []).join(", "),
                      p.famille ?? "",
                      p.model ?? "",
                      Number(p.min_stock),
                    ]),
                    textColumns: [0],
                  },
                ])
              }
            >
              <Download />
              تصدير Excel
            </Button>
            <Button
              variant="outline"
              disabled={filtered.length === 0}
              onClick={() => setLabelItems(filtered)}
            >
              <Printer />
              ملصقات الباركود
            </Button>
            {canSell && (
              <Button onClick={() => setEditing("new")}>
                <Plus />
                منتج جديد
              </Button>
            )}
            {isManager && (
              <Button variant="outline" onClick={() => fileRef.current?.click()}>
                <Upload />
                استيراد Excel
              </Button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onFile(f);
                e.target.value = "";
              }}
            />
          </>
        }
      />

      <p className="rounded-xl bg-accent p-3 text-xs leading-relaxed text-accent-foreground">
        الكمية النظامية تُنسخ عند بداية كل جلسة جرد. تغييرها هنا بعد بداية الجلسة لا يغير فوارق
        الجلسة الجارية.
      </p>

      <div className="relative">
        <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="ابحث بالاسم أو الباركود..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="h-11 bg-card ps-9"
        />
      </div>
      {familles.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          <Button size="sm" variant={fam ? "outline" : "default"} onClick={() => { setFam(""); setPage(1); }}>الكل</Button>
          {familles.map((f) => (
            <Button key={f} size="sm" variant={fam === f ? "default" : "outline"} onClick={() => { setFam(f); setPage(1); }}>{f}</Button>
          ))}
        </div>
      )}

      {canSell && products.length > 0 && (
        <div className="surface-card flex flex-wrap items-center gap-2 p-3 text-sm">
          <span className="flex-1 font-bold">المتجر أونلاين: {products.filter((p) => p.online_visible).length} معروض من {products.length}{sel.size > 0 ? ` · ${sel.size} محدد` : ""}</span>
          {sel.size > 0 ? (<>
            <Button size="sm" disabled={busy} onClick={() => void setOnline([...sel], true)}>عرض المحدد</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void setOnline([...sel], false)}>إخفاء المحدد</Button>
            <Button size="sm" variant="ghost" onClick={() => setSel(new Set())}>إلغاء التحديد</Button>
          </>) : (<>
            <Button size="sm" disabled={busy} onClick={() => void setOnline(filtered.map((p) => p.id), true)}>عرض الكل في المتجر ({filtered.length})</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void setOnline(filtered.map((p) => p.id), false)}>إخفاء الكل</Button>
          </>)}
        </div>
      )}

      <div className="surface-card overflow-hidden">
        {products.length === 0 ? (
          <div className="flex flex-col items-center gap-3 p-12 text-center">
            <Package className="h-10 w-10 text-muted-foreground" />
            <p className="font-bold">الكتالوج فارغ</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              استورد ملف Excel فيه الباركود، الاسم، الموقع والكمية النظامية. يمكنك تحميل النموذج
              أولاً.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-xs text-muted-foreground">
                <tr>
                  {canSell && <th className="px-2 py-3"><input type="checkbox" aria-label="تحديد الكل" className="h-4 w-4" checked={filtered.length > 0 && filtered.every((p) => sel.has(p.id))} onChange={(e) => setSel(e.target.checked ? new Set(filtered.map((p) => p.id)) : new Set())} /></th>}
                  <th className="px-4 py-3 text-start font-bold">المنتج</th>
                  <th className="px-4 py-3 text-start font-bold">الباركود</th>
                  <th className="px-4 py-3 text-start font-bold">الموقع</th>
                  <th className="px-4 py-3 text-end font-bold">الكمية النظامية</th>
                  <th className="px-4 py-3 text-end font-bold">سعر الشراء</th>
                  <th className="px-4 py-3 text-end font-bold">سعر البيع</th>
                  <th className="px-4 py-3 text-end font-bold">الكرتون</th>
                  <th className="px-2 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {pageItems.map((p) => (
                  <tr key={p.id} className="hover:bg-muted/40">
                    {canSell && <td className="px-2 py-3"><input type="checkbox" aria-label="تحديد" className="h-4 w-4" checked={sel.has(p.id)} onChange={(e) => setSel((s) => { const n = new Set(s); if (e.target.checked) n.add(p.id); else n.delete(p.id); return n; })} /></td>}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                      {p.image_url && <img src={p.image_url} alt="" loading="lazy" className="h-9 w-9 rounded object-cover" />}
                      <div>
                      <p className="font-bold">{p.name}{p.online_visible && <span className="ms-2 rounded bg-primary/15 px-1.5 text-[10px] text-primary">أونلاين</span>}</p>
                      {(p.famille || p.model) && (
                        <p className="text-xs text-muted-foreground">{[p.famille, p.model].filter(Boolean).join(" · ")}</p>
                      )}
                      </div></div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="barcode-chip rounded-md bg-secondary px-2 py-0.5 text-xs">
                        {p.barcode}
                      </span>
                      {(p.alt_barcodes ?? []).length > 0 && (
                        <p className="mt-1 text-[10px] text-muted-foreground" dir="ltr">
                          + {(p.alt_barcodes ?? []).join(", ")}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{p.default_location || "—"}</td>
                    <td className={`px-4 py-3 text-end font-mono font-bold ${Number(p.min_stock) > 0 && Number(p.system_quantity) <= Number(p.min_stock) ? "text-destructive" : ""}`}>
                      {formatQty(Number(p.system_quantity))}
                    </td>
                    <td className="px-4 py-2"><div className="flex justify-end"><PriceCell barcode={p.barcode} purchase={Number(p.purchase_price)} selling={Number(p.selling_price)} field="purchase" onSaved={() => void queryClient.invalidateQueries({ queryKey: ["products", tenant.id] })} /></div></td>
                    <td className="px-4 py-2"><div className="flex justify-end"><PriceCell barcode={p.barcode} purchase={Number(p.purchase_price)} selling={Number(p.selling_price)} field="selling" onSaved={() => void queryClient.invalidateQueries({ queryKey: ["products", tenant.id] })} /></div></td>
                    <td className="px-4 py-3 text-end font-mono text-xs">
                      {Number(p.carton_size) > 1 ? `× ${formatQty(Number(p.carton_size))}` : "—"}
                    </td>
                    <td className="flex px-2 py-3">
                      {canSell && (
                        <Button size="icon" variant="ghost" aria-label="تعديل" onClick={() => setEditing(p)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                      {isManager && (
                        <Button size="icon" variant="ghost" className="hover:text-destructive" aria-label="حذف" onClick={async () => {
                          if (!window.confirm(`حذف المنتج «${p.name}» نهائياً؟`)) return;
                          const { error } = await supabase.from("products").delete().eq("id", p.id);
                          if (error) return void toast.error(error.message);
                          toast.success("تم حذف المنتج");
                          void queryClient.invalidateQueries({ queryKey: ["products", tenant.id] });
                        }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                      <Button size="icon" variant="ghost" aria-label="طباعة ملصق" onClick={() => setLabelItems([p])}>
                        <Printer className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t p-3 text-xs text-muted-foreground">
              <span>
                عرض {filtered.length === 0 ? 0 : (curPage - 1) * PER_PAGE + 1} إلى {Math.min(curPage * PER_PAGE, filtered.length)} من أصل {filtered.length} منتج
              </span>
              <div className="flex flex-wrap items-center gap-1">
                <Button size="sm" variant="outline" disabled={curPage <= 1} onClick={() => setPage(curPage - 1)}>السابق</Button>
                {Array.from({ length: pageCount }, (_, i) => i + 1)
                  .filter((n) => n === 1 || n === pageCount || Math.abs(n - curPage) <= 2)
                  .map((n, i, arr) => (
                    <span key={n} className="flex items-center gap-1">
                      {i > 0 && n - (arr[i - 1] ?? n) > 1 && <span>…</span>}
                      <Button size="sm" variant={n === curPage ? "default" : "outline"} className="min-w-9" onClick={() => setPage(n)}>{n}</Button>
                    </span>
                  ))}
                <Button size="sm" variant="outline" disabled={curPage >= pageCount} onClick={() => setPage(curPage + 1)}>التالي</Button>
              </div>
            </div>
          </div>
        )}
      </div>

      <ProductFormDialog
        product={editing === "new" ? null : editing}
        open={editing !== null}
        familles={familles}
        tenantId={tenant.id}
        onOpenChange={(o) => !o && setEditing(null)}
        onSaved={() => { setEditing(null); void queryClient.invalidateQueries({ queryKey: ["products", tenant.id] }); }}
      />

      <LabelPrintDialog
        products={labelItems ?? []}
        open={Boolean(labelItems)}
        onOpenChange={(o) => !o && setLabelItems(null)}
        defaultSize={{ w: storeSettings.label_width, h: storeSettings.label_height }}
      />

      <Dialog
        open={Boolean(parsed)}
        onOpenChange={(o) => !o && progress === null && setParsed(null)}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader className="text-right sm:text-right">
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              {parsed?.fileName}
            </DialogTitle>
            <DialogDescription>
              راجع النتيجة قبل الاستيراد. المنتجات الموجودة تُحدَّث حسب الباركود.
            </DialogDescription>
          </DialogHeader>
          {parsed && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-xl bg-success/10 p-3 text-sm font-bold text-success">
                <CheckCircle2 className="h-5 w-5" />
                {parsed.rows.length} منتج صالح للاستيراد
              </div>
              {parsed.errors.length > 0 && (
                <div className="rounded-xl border border-warning bg-warning/10 p-3">
                  <p className="flex items-center gap-2 text-sm font-bold text-warning-foreground">
                    <AlertTriangle className="h-4 w-4" />
                    {parsed.errors.length} سطر مرفوض
                  </p>
                  <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto text-xs text-muted-foreground">
                    {parsed.errors.slice(0, 50).map((e, i) => (
                      <li key={i}>
                        السطر <span className="font-mono">{e.line}</span>: {e.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {parsed.rows.length > 0 && (
                <div className="max-h-40 overflow-y-auto rounded-xl border text-xs">
                  {parsed.rows.slice(0, 5).map((r) => (
                    <div
                      key={r.barcode}
                      className="flex justify-between gap-2 border-b px-3 py-2 last:border-0"
                    >
                      <span className="barcode-chip">{r.barcode}</span>
                      <span className="truncate font-bold">{r.name}</span>
                      <span className="font-mono">{formatQty(r.system_quantity)}</span>
                    </div>
                  ))}
                </div>
              )}
              {progress !== null && <Progress value={progress} />}
              <Button
                className="w-full"
                size="lg"
                disabled={parsed.rows.length === 0 || progress !== null}
                onClick={runImport}
              >
                {progress !== null
                  ? `جاري الاستيراد ${progress}%`
                  : `استيراد ${parsed.rows.length} منتج`}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
