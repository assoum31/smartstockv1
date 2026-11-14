import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Product } from "@/lib/queries";
import { parseAltBarcodes } from "@/lib/inventory-rules";
import { Switch } from "@/components/ui/switch";
import { compressImage } from "@/lib/product-image";

const EMPTY = {
  barcode: "", name: "", famille: "", model: "", default_location: "", alt: "",
  purchase_price: "0", selling_price: "0", carton_size: "1", system_quantity: "0", min_stock: "0", image_url: "",
};

export function ProductFormDialog({
  product, open, onOpenChange, onSaved, familles, tenantId, initialBarcode,
}: {
  product: Product | null; open: boolean; onOpenChange: (o: boolean) => void; onSaved: (saved?: Product) => void; initialBarcode?: string; familles: string[]; tenantId: string;
}) {
  const [f, setF] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [online, setOnline] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    setF(product ? {
      barcode: product.barcode, name: product.name, famille: product.famille ?? "", model: product.model ?? "",
      default_location: product.default_location ?? "", alt: (product.alt_barcodes ?? []).join(", "),
      purchase_price: String(product.purchase_price), selling_price: String(product.selling_price),
      carton_size: String(product.carton_size), system_quantity: String(product.system_quantity), min_stock: String(product.min_stock), image_url: product.image_url ?? "",
    } : { ...EMPTY, barcode: initialBarcode ?? "" });
    setOnline(product ? product.online_visible : false);
  }, [open, product, initialBarcode]);
  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) => setF((s) => ({ ...s, [k]: e.target.value }));
  const num = (v: string) => Number(v.replace(",", ".")) || 0;

  const save = async () => {
    if (!f.barcode.trim() || !f.name.trim()) return void toast.error("الباركود والاسم إجباريان");
    setSaving(true);
    const row = {
      tenant_id: tenantId, barcode: f.barcode.trim(), name: f.name.trim(),
      famille: f.famille.trim() || null, model: f.model.trim() || null, default_location: f.default_location.trim() || null,
      alt_barcodes: parseAltBarcodes(f.alt).filter((b) => b !== f.barcode.trim()),
      purchase_price: num(f.purchase_price), selling_price: num(f.selling_price), carton_size: num(f.carton_size) || 1,
      system_quantity: num(f.system_quantity), min_stock: num(f.min_stock), image_url: f.image_url.trim() || null, online_visible: online, updated_at: new Date().toISOString(),
    };
    const { data, error } = product
      ? await supabase.from("products").update(row).eq("id", product.id).select().single()
      : await supabase.from("products").insert(row).select().single();
    setSaving(false);
    if (error) return void toast.error(error.code === "23505" ? "هذا الباركود موجود مسبقاً" : "تعذر الحفظ");
    toast.success(product ? "تم تعديل المنتج" : "تمت إضافة المنتج");
    onSaved((data ?? undefined) as Product | undefined);
  };

  const field = (k: keyof typeof EMPTY, label: string, opts: { mono?: boolean; list?: string } = {}) => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input value={f[k]} onChange={set(k)} list={opts.list} className={`h-11 ${opts.mono ? "font-mono" : ""}`} inputMode={opts.mono ? "decimal" : undefined} />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader className="text-right sm:text-right">
          <DialogTitle>{product ? "تعديل المنتج" : "منتج جديد"}</DialogTitle>
        </DialogHeader>
        <datalist id="familles">{familles.map((x) => <option key={x} value={x} />)}</datalist>
        <div className="grid gap-3 sm:grid-cols-2">
          {field("barcode", "الباركود *")}
          {field("name", "اسم المنتج *")}
          {field("famille", "العائلة (Famille)", { list: "familles" })}
          {field("model", "الموديل / الماركة")}
          {field("purchase_price", "سعر الشراء (دج)", { mono: true })}
          {field("selling_price", "سعر البيع (دج)", { mono: true })}
          {field("system_quantity", "الكمية في المخزون", { mono: true })}
          {field("min_stock", "مخزون الأمان (تنبيه)", { mono: true })}
          {field("carton_size", "سعة الكرتون", { mono: true })}
          {field("default_location", "الموقع في الرف")}
          <div className="sm:col-span-2">{field("alt", "باركودات إضافية (مفصولة بفاصلة)")}</div>
          <div className="space-y-2 sm:col-span-2">
            <Label>صورة المنتج</Label>
            <div className="flex items-center gap-3">
              {f.image_url ? <img src={f.image_url} alt="" className="h-16 w-16 rounded-lg border object-cover" /> : <div className="flex h-16 w-16 items-center justify-center rounded-lg border bg-muted text-xs text-muted-foreground">بدون</div>}
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>رفع صورة</Button>
                {f.image_url && <Button type="button" variant="ghost" size="sm" onClick={() => setF((s) => ({ ...s, image_url: "" }))}>إزالة</Button>}
              </div>
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={async (e) => {
                const file = e.target.files?.[0]; e.target.value = "";
                if (!file) return;
                try { const d = await compressImage(file); setF((s) => ({ ...s, image_url: d })); } catch { toast.error("تعذر قراءة الصورة"); }
              }} />
            </div>
            <Input value={f.image_url.startsWith("data:") ? "" : f.image_url} onChange={set("image_url")} placeholder="أو الصق رابط الصورة https://..." dir="ltr" className="h-11" />
          </div>
          <label className="flex items-center justify-between gap-3 rounded-lg border p-3 sm:col-span-2">
            <span className="font-bold">معروض في المتجر أونلاين</span>
            <Switch checked={online} onCheckedChange={setOnline} />
          </label>
        </div>
        <Button size="lg" className="w-full" disabled={saving} onClick={() => void save()}>حفظ</Button>
      </DialogContent>
    </Dialog>
  );
}
