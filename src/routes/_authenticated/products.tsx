import { useMemo, useRef, useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Package,
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
import { downloadWorkbook, readSheetAsText } from "@/lib/excel";
import { chunk, parseProductRows, type ProductImportResult } from "@/lib/inventory-rules";
import { productsQuery } from "@/lib/queries";
import { formatQty } from "@/lib/messages";

export const Route = createFileRoute("/_authenticated/products")({
  beforeLoad: ({ context }) => {
    if (!context.me.isManager || !context.me.tenant) throw redirect({ to: context.me.homePath });
    return { tenant: context.me.tenant };
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(productsQuery(context.tenant.id)),
  head: () => ({ meta: [{ title: "المنتجات | Stocki Pro" }] }),
  component: ProductsPage,
});

const IMPORT_CHUNK = 500;

function ProductsPage() {
  const { tenant } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const { data: products } = useSuspenseQuery(productsQuery(tenant.id));
  const [search, setSearch] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<(ProductImportResult & { fileName: string }) | null>(null);
  const [progress, setProgress] = useState<number | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? products.filter(
          (p) => p.barcode.toLowerCase().includes(q) || p.name.toLowerCase().includes(q),
        )
      : products;
    return list.slice(0, 200);
  }, [products, search]);

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
                downloadWorkbook("stocki-modele-produits.xlsx", [
                  {
                    name: "produits",
                    headers: ["barcode", "name", "location", "system_quantity"],
                    rows: [["0061112457800", "زيت زيتون 1L", "Rayon B2", 24]],
                    textColumns: [0],
                  },
                ])
              }
            >
              <Download />
              نموذج Excel
            </Button>
            <Button onClick={() => fileRef.current?.click()}>
              <Upload />
              استيراد Excel
            </Button>
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
          onChange={(e) => setSearch(e.target.value)}
          className="h-11 bg-card ps-9"
        />
      </div>

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
                  <th className="px-4 py-3 text-start font-bold">المنتج</th>
                  <th className="px-4 py-3 text-start font-bold">الباركود</th>
                  <th className="px-4 py-3 text-start font-bold">الموقع</th>
                  <th className="px-4 py-3 text-end font-bold">الكمية النظامية</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((p) => (
                  <tr key={p.id} className="hover:bg-muted/40">
                    <td className="px-4 py-3 font-bold">{p.name}</td>
                    <td className="px-4 py-3">
                      <span className="barcode-chip rounded-md bg-secondary px-2 py-0.5 text-xs">
                        {p.barcode}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{p.default_location || "—"}</td>
                    <td className="px-4 py-3 text-end font-mono font-bold">
                      {formatQty(Number(p.system_quantity))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {products.length > filtered.length && (
              <p className="border-t p-3 text-center text-xs text-muted-foreground">
                عرض {filtered.length} من {products.length}. استعمل البحث للعثور على منتج.
              </p>
            )}
          </div>
        )}
      </div>

      <Dialog
        open={Boolean(parsed)}
        onOpenChange={(o) => !o && progress === null && setParsed(null)}
      >
        <DialogContent dir="rtl" className="sm:max-w-lg">
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
