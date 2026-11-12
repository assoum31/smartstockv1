import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Product } from "@/lib/queries";
import { parseAltBarcodes } from "@/lib/inventory-rules";

const EMPTY = {
  barcode: "", name: "", famille: "", model: "", default_location: "", alt: "",
  purchase_price: "0", selling_price: "0", carton_size: "1", system_quantity: "0", min_stock: "0",
};

export function ProductFormDialog({
  product, open, onOpenChange, onSaved, familles, tenantId,
}: {
  product: Product | null; open: boolean; onOpenChange: (o: boolean) => void; onSaved: () => void; familles: string[]; tenantId: string;
}) {
  const [f, setF] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    setF(product ? {
      barcode: product.barcode, name: product.name, famille: product.famille ?? "", model: product.model ?? "",
      default_location: product.default_location ?? "", alt: (product.alt_barcodes ?? []).join(", "),
      purchase_price: String(product.purchase_price), selling_price: String(product.selling_price),
      carton_size: String(product.carton_size), system_quantity: String(product.system_quantity), min_stock: String(product.min_stock),
    } : EMPTY);
  }, [open, product]);
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
      system_quantity: num(f.system_quantity), min_stock: num(f.min_stock), updated_at: new Date().toISOString(),
    };
    const { error } = product
      ? await supabase.from("products").update(row).eq("id", product.id)
      : await supabase.from("products").insert(row);
    setSaving(false);
    if (error) return void toast.error(error.code === "23505" ? "هذا الباركود موجود مسبقاً" : "تعذر الحفظ");
    toast.success(product ? "تم تعديل المنتج" : "تمت إضافة المنتج");
    onSaved();
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
        </div>
        <Button size="lg" className="w-full" disabled={saving} onClick={() => void save()}>حفظ</Button>
      </DialogContent>
    </Dialog>
  );
}
