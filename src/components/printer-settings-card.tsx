import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Barcode, FileText, Printer, Receipt } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { a4DocHtml, defaultSettings, openPrint, storeSettingsQuery, ticketHtml, type StoreSettings } from "@/lib/store-settings";
import { errorText } from "@/lib/messages";

const SAMPLE = [{ product_name: "منتج تجريبي", quantity: 2, unit_price: 150 }];

function Section({ icon: Icon, title, children }: { icon: typeof Printer; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-xl border p-4 sm:p-5">
      <h3 className="flex items-center gap-2 font-extrabold"><Icon className="h-5 w-5 text-primary" />{title}</h3>
      {children}
    </section>
  );
}

function Toggle({ id, label, checked, onChange }: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Label htmlFor={id}>{label}</Label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

export function PrinterSettingsCard({ tenantId }: { tenantId: string }) {
  const qc = useQueryClient();
  const { data } = useQuery(storeSettingsQuery(tenantId));
  const [s, setS] = useState<StoreSettings>(defaultSettings(tenantId));
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (data) setS(data); }, [data]);
  const set = (patch: Partial<StoreSettings>) => setS((v) => ({ ...v, ...patch }));
  const custom = ![[40, 20], [50, 30], [40, 25], [58, 40]].some(([w, h]) => w === s.label_width && h === s.label_height);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from("store_settings").upsert({ ...s, tenant_id: tenantId, updated_at: new Date().toISOString() });
    setSaving(false);
    if (error) return void toast.error(errorText(error));
    toast.success("تم حفظ إعدادات الطابعات");
    void qc.invalidateQueries({ queryKey: ["store-settings", tenantId] });
  };

  const testTicket = () => openPrint(ticketHtml(s, "SMART STOCK", { title: "بون تجريبي", date: new Date().toLocaleString("fr-FR"), lines: SAMPLE, total: 300, code: "T0001" }), "width=380,height=600");
  const testInvoice = () => openPrint(a4DocHtml(s, "SMART STOCK", { title: "فاتورة تجريبية", number: "0001", date: new Date().toLocaleDateString("fr-FR"), party: "زبون تجريبي", lines: SAMPLE.map((l) => ({ barcode: "6130000000000", product_name: l.product_name, quantity: l.quantity, price: l.unit_price })) }));
  const testLabel = () => {
    const w = s.label_width, h = s.label_height;
    openPrint(`<!doctype html><html dir="rtl"><head><meta charset="utf-8"/><style>@page{size:${w}mm ${h}mm;margin:0}body{margin:0;font-family:Arial}div{width:${w}mm;height:${h}mm;border:1px dashed #999;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:9px}</style></head><body><div>${s.label_show_name ? "<b>منتج تجريبي</b>" : ""}<span style="font-family:monospace;letter-spacing:2px">||||| 6130000000000 |||||</span>${s.label_show_price ? "<b>150.00 دج</b>" : ""}<small>${w}×${h} مم</small></div></body></html>`);
  };

  return (
    <div className="surface-card space-y-5 p-5 sm:p-6">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-extrabold"><Printer className="h-5 w-5 text-primary" />الطابعات</h2>
        <p className="mt-1 text-sm text-muted-foreground">اضبط كل طابعة على حدة، ثم اطبع نموذجاً تجريبياً للتأكد من المقاس.</p>
      </div>

      <Section icon={Receipt} title="طابعة وصولات البيع (حرارية)">
        <div className="space-y-2">
          <Label>عرض الورق</Label>
          <div className="flex flex-wrap gap-2">
            {[58, 80].map((w) => (
              <Button key={w} type="button" variant={s.ticket_width === w ? "default" : "outline"} onClick={() => set({ ticket_width: w })}>{w} مم</Button>
            ))}
          </div>
        </div>
        <Toggle id="p-codes" label="طباعة باركود و QR الوصل" checked={s.ticket_show_codes} onChange={(v) => set({ ticket_show_codes: v })} />
        <div className="space-y-1.5">
          <Label htmlFor="p-tf">نص أسفل الوصل</Label>
          <Input id="p-tf" value={s.ticket_footer ?? ""} onChange={(e) => set({ ticket_footer: e.target.value || null })} />
        </div>
        <Button variant="outline" onClick={testTicket}><Printer />طباعة وصل تجريبي</Button>
      </Section>

      <Section icon={FileText} title="طابعة الفواتير ووصول الاستلام">
        <div className="space-y-2">
          <Label>مقاس الورق</Label>
          <div className="flex gap-2">
            {["A4", "A5"].map((p) => (
              <Button key={p} type="button" variant={s.invoice_paper === p ? "default" : "outline"} onClick={() => set({ invoice_paper: p })}>{p}</Button>
            ))}
          </div>
        </div>
        <Toggle id="p-sig" label="إظهار خانة التوقيع والختم" checked={s.invoice_signature} onChange={(v) => set({ invoice_signature: v })} />
        <div className="space-y-1.5">
          <Label htmlFor="p-if">نص أسفل الفاتورة (الشروط، الضمان...)</Label>
          <Input id="p-if" value={s.invoice_footer ?? ""} onChange={(e) => set({ invoice_footer: e.target.value || null })} />
        </div>
        <Button variant="outline" onClick={testInvoice}><Printer />طباعة فاتورة تجريبية</Button>
      </Section>

      <Section icon={Barcode} title="طابعة ملصقات الباركود">
        <div className="space-y-2">
          <Label>مقاس الملصق (مم)</Label>
          <div className="flex flex-wrap gap-2">
            {[[40, 20], [50, 30], [40, 25], [58, 40]].map(([w, h]) => (
              <Button key={`${w}x${h}`} type="button" variant={s.label_width === w && s.label_height === h ? "default" : "outline"} onClick={() => set({ label_width: w!, label_height: h! })}>{w}×{h}</Button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1"><Label htmlFor="p-lw" className="text-xs">العرض {custom && "(مخصص)"}</Label><Input id="p-lw" inputMode="decimal" value={s.label_width} onChange={(e) => set({ label_width: Number(e.target.value) || 0 })} /></div>
            <div className="space-y-1"><Label htmlFor="p-lh" className="text-xs">الارتفاع</Label><Input id="p-lh" inputMode="decimal" value={s.label_height} onChange={(e) => set({ label_height: Number(e.target.value) || 0 })} /></div>
          </div>
        </div>
        <Toggle id="p-ln" label="طباعة اسم المنتج" checked={s.label_show_name} onChange={(v) => set({ label_show_name: v })} />
        <Toggle id="p-lp" label="طباعة السعر" checked={s.label_show_price} onChange={(v) => set({ label_show_price: v })} />
        <div className="space-y-1.5">
          <Label htmlFor="p-lc">عدد النسخ الافتراضي لكل منتج</Label>
          <Input id="p-lc" inputMode="numeric" value={s.label_copies} onChange={(e) => set({ label_copies: Math.max(1, Number(e.target.value) || 1) })} />
        </div>
        <Button variant="outline" onClick={testLabel}><Printer />طباعة ملصق تجريبي</Button>
      </Section>

      <Button className="w-full" size="lg" disabled={saving || s.label_width < 10 || s.label_height < 10} onClick={() => void save()}>{saving ? "جاري الحفظ..." : "حفظ إعدادات الطابعات"}</Button>
    </div>
  );
}
