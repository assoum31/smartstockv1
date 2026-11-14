import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Download, ExternalLink, Search, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/stat-card";
import { downloadWorkbook, readSheetAsText } from "@/lib/excel";
import { errorText } from "@/lib/messages";
import { compressImage } from "@/lib/product-image";
import { filterByQuery, parseRelated, STORE_COLORS } from "@/lib/store-rules";

type P = { id: string; barcode: string; name: string; famille: string | null; selling_price: number; system_quantity: number; image_url: string | null; online_visible: boolean; online_description: string | null; related_barcodes: string[] };
type S = { store_title: string | null; store_tagline: string | null; store_color: string | null; store_banner: string | null; store_logo: string | null; store_enabled: boolean };

const productsQ = (t: string) => queryOptions({
  queryKey: ["online-products", t],
  queryFn: async () => {
    const all: P[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from("products").select("id,barcode,name,famille,selling_price,system_quantity,image_url,online_visible,online_description,related_barcodes").eq("tenant_id", t).order("name").range(from, from + 999);
      if (error) throw new Error(error.message);
      all.push(...(data as P[]));
      if (data.length < 1000) break;
    }
    return all;
  },
});
const settingsQ = (t: string) => queryOptions({
  queryKey: ["online-settings", t],
  queryFn: async () => {
    const { data, error } = await supabase.from("store_settings").select("store_title,store_tagline,store_color,store_banner,store_logo,store_enabled").eq("tenant_id", t).maybeSingle();
    if (error) throw new Error(error.message);
    return (data ?? { store_title: "", store_tagline: "", store_color: STORE_COLORS[0]!.value, store_banner: "", store_logo: "", store_enabled: true }) as S;
  },
});

export const Route = createFileRoute("/_authenticated/online-store")({
  beforeLoad: ({ context }) => {
    if (!context.me.isManager || !context.me.tenant) throw redirect({ to: context.me.homePath });
    return { tenant: context.me.tenant };
  },
  loader: ({ context }) => Promise.all([context.queryClient.ensureQueryData(productsQ(context.tenant.id)), context.queryClient.ensureQueryData(settingsQ(context.tenant.id))]),
  head: () => ({ meta: [{ title: "إدارة المتجر أونلاين | SMART STOCK" }, { name: "description", content: "تخصيص واجهة المتجر أونلاين وسلعه وصورها." }] }),
  component: OnlineStorePage,
});

function OnlineStorePage() {
  const { tenant } = Route.useRouteContext();
  const qc = useQueryClient();
  const { data: products } = useSuspenseQuery(productsQ(tenant.id));
  const { data: s0 } = useSuspenseQuery(settingsQ(tenant.id));
  const [s, setS] = useState<S>(s0);
  const [link, setLink] = useState("");
  useEffect(() => setLink(`${window.location.origin}/store/${tenant.code}`), [tenant.code]);
  const refresh = () => qc.invalidateQueries({ queryKey: ["online-products", tenant.id] });

  const saveSettings = async () => {
    const { error } = await supabase.from("store_settings").upsert({ tenant_id: tenant.id, ...s, updated_at: new Date().toISOString() }, { onConflict: "tenant_id" });
    if (error) toast.error(errorText(error)); else { toast.success("تم حفظ إعدادات المتجر"); void qc.invalidateQueries({ queryKey: ["online-settings", tenant.id] }); }
  };

  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [edit, setEdit] = useState<P | null>(null);
  const list = useMemo(() => filterByQuery(products, q), [products, q]);
  const pages = Math.max(1, Math.ceil(list.length / 50));
  const cur = Math.min(page, pages);
  const rows = list.slice((cur - 1) * 50, cur * 50);

  const toggle = async (p: P, v: boolean) => {
    const { error } = await supabase.from("products").update({ online_visible: v }).eq("id", p.id);
    if (error) toast.error(errorText(error)); else void refresh();
  };
  const bulk = async (v: boolean) => {
    const ids = list.map((p) => p.id);
    for (let i = 0; i < ids.length; i += 200) {
      const { error } = await supabase.from("products").update({ online_visible: v }).in("id", ids.slice(i, i + 200));
      if (error) { toast.error(errorText(error)); return; }
    }
    toast.success(v ? "تم عرض السلع المحددة" : "تم إخفاء السلع المحددة"); void refresh();
  };

  const exportX = () => downloadWorkbook("SMART-STOCK-متجر-أونلاين.xlsx", [{
    name: "المتجر",
    headers: ["الباركود", "الاسم", "الفئة", "سعر البيع", "معروض", "رابط الصورة", "الوصف", "سلع مقترحة"],
    rows: products.map((p) => [p.barcode, p.name, p.famille ?? "", Number(p.selling_price), p.online_visible ? "نعم" : "لا", p.image_url ?? "", p.online_description ?? "", p.related_barcodes.join(",")]),
    textColumns: [0, 7],
  }]);
  const fileRef = useRef<HTMLInputElement>(null);
  const importX = async (file: File) => {
    const data = await readSheetAsText(file);
    const byCode = new Map(products.map((p) => [p.barcode, p]));
    let n = 0, miss = 0;
    for (const r of data) {
      const p = byCode.get(String(r["الباركود"] ?? "").trim());
      if (!p) { miss++; continue; }
      const patch: { name?: string; famille?: string | null; selling_price?: number; online_visible?: boolean; image_url?: string | null; online_description?: string | null; related_barcodes?: string[] } = {};
      const str = (k: string) => String(r[k] ?? "").trim();
      if (str("الاسم")) patch.name = str("الاسم");
      if ("الفئة" in r) patch.famille = str("الفئة") || null;
      const price = Number(str("سعر البيع").replace(",", "."));
      if (str("سعر البيع") && Number.isFinite(price) && price >= 0) patch.selling_price = price;
      if (str("معروض")) patch.online_visible = !/^(لا|no|non|0|false)$/i.test(str("معروض"));
      if ("رابط الصورة" in r) patch.image_url = str("رابط الصورة") || null;
      if ("الوصف" in r) patch.online_description = str("الوصف") || null;
      if ("سلع مقترحة" in r) patch.related_barcodes = parseRelated(str("سلع مقترحة"), p.barcode);
      const { error } = await supabase.from("products").update(patch).eq("id", p.id);
      if (!error) n++;
    }
    toast.success(`تم تحديث ${n} منتج${miss ? `، ${miss} باركود غير موجود` : ""}`);
    void refresh();
  };

  const txt = (k: keyof S, label: string, ph = "") => (
    <div className="space-y-1"><Label htmlFor={`s-${k}`}>{label}</Label>
      <Input id={`s-${k}`} placeholder={ph} value={String(s[k] ?? "")} onChange={(e) => setS({ ...s, [k]: e.target.value })} /></div>
  );

  return (
    <div className="space-y-5">
      <PageHeader title="إدارة المتجر أونلاين" subtitle="الواجهة، الألوان، الشعار، والسلع المعروضة" />
      <section className="surface-card space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-extrabold">هوية المتجر</h2>
          <label className="flex items-center gap-2 text-sm">المتجر مفتوح للزوار<Switch checked={s.store_enabled} onCheckedChange={(v) => setS({ ...s, store_enabled: v })} /></label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {txt("store_title", "اسم المتجر")}
          {txt("store_tagline", "جملة ترحيبية", "أفضل الأسعار في مدينتك")}
          {txt("store_logo", "رابط الشعار", "https://…")}
          {txt("store_banner", "رابط صورة الغلاف", "https://…")}
        </div>
        <div className="space-y-1">
          <Label>لون المتجر</Label>
          <div className="flex flex-wrap gap-2">
            {STORE_COLORS.map((c) => (
              <button key={c.value} type="button" aria-label={c.label} title={c.label} onClick={() => setS({ ...s, store_color: c.value })}
                className={`h-9 w-9 rounded-full border-2 ${s.store_color === c.value ? "border-foreground" : "border-transparent"}`} style={{ background: c.value }} />
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void saveSettings()}>حفظ إعدادات المتجر</Button>
          {link && <Button variant="outline" asChild><a href={link} target="_blank" rel="noreferrer"><ExternalLink />فتح المتجر</a></Button>}
        </div>
      </section>

      <section className="surface-card space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="flex-1 font-extrabold">سلع المتجر ({products.filter((p) => p.online_visible).length} معروضة من {products.length})</h2>
          <Button variant="outline" size="sm" onClick={() => void exportX()}><Download />تصدير Excel</Button>
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}><Upload />استيراد Excel</Button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void importX(f); e.target.value = ""; }} />
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-0 flex-1"><Search className="absolute start-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input className="ps-9" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="بحث بالاسم أو الباركود أو الفئة" /></div>
          <Button size="sm" onClick={() => void bulk(true)}>عرض الكل في المتجر ({list.length})</Button>
          <Button size="sm" variant="secondary" onClick={() => void bulk(false)}>إخفاء الكل</Button>
        </div>
        <ul className="divide-y rounded-lg border">
          {rows.map((p) => (
            <li key={p.id} className="flex items-center gap-3 p-2 text-sm">
              {p.image_url ? <img src={p.image_url} alt="" className="h-10 w-10 rounded object-cover" loading="lazy" /> : <div className="flex h-10 w-10 items-center justify-center rounded bg-muted text-xs font-bold">{p.name.slice(0, 2)}</div>}
              <div className="min-w-0 flex-1"><p className="truncate font-bold">{p.name}</p><p className="truncate text-xs text-muted-foreground">{p.famille ?? "—"} · {Number(p.selling_price)} DA · {Number(p.system_quantity)}</p></div>
              <Button size="sm" variant="outline" onClick={() => setEdit(p)}>تعديل</Button>
              <Switch checked={p.online_visible} onCheckedChange={(v) => void toggle(p, v)} aria-label="معروض في المتجر" />
            </li>
          ))}
        </ul>
        {pages > 1 && <div className="flex items-center justify-center gap-2 text-sm">
          <Button size="sm" variant="outline" disabled={cur <= 1} onClick={() => setPage(cur - 1)}>السابق</Button>
          <span>{cur} / {pages}</span>
          <Button size="sm" variant="outline" disabled={cur >= pages} onClick={() => setPage(cur + 1)}>التالي</Button></div>}
      </section>
      {edit && <EditDialog p={edit} products={products} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); void refresh(); }} />}
    </div>
  );
}

function EditDialog({ p, products, onClose, onSaved }: { p: P; products: P[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ name: p.name, famille: p.famille ?? "", price: String(p.selling_price), image: p.image_url ?? "", desc: p.online_description ?? "" });
  const [rel, setRel] = useState<string[]>(p.related_barcodes);
  const [rq, setRq] = useState("");
  const byCode = useMemo(() => new Map(products.map((x) => [x.barcode, x])), [products]);
  const hits = useMemo(() => { const x = rq.trim().toLowerCase(); if (!x) return []; return products.filter((o) => o.barcode !== p.barcode && !rel.includes(o.barcode) && (o.name.toLowerCase().includes(x) || o.barcode.toLowerCase().includes(x))).slice(0, 8); }, [rq, products, rel, p.barcode]);
  const save = async () => {
    const price = Number(f.price.replace(",", "."));
    if (!f.name.trim() || !Number.isFinite(price) || price < 0) { toast.error("تحقق من الاسم والسعر"); return; }
    const { error } = await supabase.from("products").update({ name: f.name.trim(), famille: f.famille.trim() || null, selling_price: price, image_url: f.image.trim() || null, online_description: f.desc.trim() || null, related_barcodes: rel }).eq("id", p.id);
    if (error) toast.error(errorText(error)); else { toast.success("تم الحفظ"); onSaved(); }
  };
  const fld = (k: keyof typeof f, label: string) => (
    <div className="space-y-1"><Label htmlFor={`e-${k}`}>{label}</Label><Input id={`e-${k}`} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></div>
  );
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-background/80 p-2 sm:items-center" onClick={onClose}>
      <div className="surface-card max-h-[90vh] w-full max-w-lg space-y-3 overflow-y-auto p-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-extrabold">تعديل: {p.name}</h3>
        {fld("name", "الاسم")}{fld("famille", "الفئة (القسم)")}{fld("price", "سعر البيع")}{fld("image", "رابط الصورة")}
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm font-bold"><Upload className="h-4 w-4" />رفع صورة من الجهاز
          <input type="file" accept="image/*" hidden onChange={async (e) => { const file = e.target.files?.[0]; e.target.value = ""; if (!file) return; try { const d = await compressImage(file); setF((x) => ({ ...x, image: d })); } catch { toast.error("تعذر قراءة الصورة"); } }} /></label>
        {f.image && <img src={f.image} alt="" className="h-28 rounded object-contain" />}
        {fld("desc", "وصف قصير")}
        <div className="space-y-1">
          <Label>سلع مقترحة مع هذا المنتج</Label>
          <div className="flex flex-wrap gap-1">{rel.map((b) => <button key={b} type="button" className="rounded-full bg-muted px-2 py-1 text-xs" onClick={() => setRel(rel.filter((x) => x !== b))}>{byCode.get(b)?.name ?? b} ✕</button>)}</div>
          <Input value={rq} onChange={(e) => setRq(e.target.value)} placeholder="ابحث لإضافة سلعة مقترحة" />
          {hits.map((h) => <button key={h.barcode} type="button" className="block w-full rounded px-2 py-1 text-start text-sm hover:bg-muted" onClick={() => { setRel([...rel, h.barcode].slice(0, 12)); setRq(""); }}>{h.name}</button>)}
          <p className="text-xs text-muted-foreground">إذا تركتها فارغة، يقترح المتجر تلقائيا سلعا من نفس الفئة.</p>
        </div>
        <div className="flex gap-2"><Button className="flex-1" onClick={() => void save()}>حفظ</Button><Button variant="outline" onClick={onClose}>إلغاء</Button></div>
      </div>
    </div>
  );
}
