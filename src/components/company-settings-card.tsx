import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, ImagePlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { defaultSettings, storeSettingsQuery, type StoreSettings } from "@/lib/store-settings";
import { errorText } from "@/lib/messages";

const TEXT_FIELDS: [keyof StoreSettings, string][] = [
  ["company_name", "اسم الشركة / المحل"],
  ["phone", "الهاتف"],
  ["address", "العنوان"],
  ["email", "البريد الإلكتروني"],
  ["rc", "السجل التجاري (RC)"],
  ["nif", "NIF"],
  ["nis", "NIS"],
  ["ai", "رقم المادة (AI)"],
  ["ticket_footer", "نص أسفل وصل البيع"],
  ["invoice_footer", "نص أسفل الفاتورة / الوصل A4"],
];

/** Shrinks the logo so it stays small enough to store with the settings. */
async function resizeLogo(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  const img = new Image();
  await new Promise((ok, ko) => { img.onload = ok; img.onerror = ko; img.src = url; });
  const scale = Math.min(1, 300 / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * scale);
  c.height = Math.round(img.height * scale);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  URL.revokeObjectURL(url);
  return c.toDataURL("image/png");
}

export function CompanySettingsCard({ tenantId }: { tenantId: string }) {
  const qc = useQueryClient();
  const { data } = useQuery(storeSettingsQuery(tenantId));
  const [s, setS] = useState<StoreSettings>(defaultSettings(tenantId));
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (data) setS(data); }, [data]);
  const set = (patch: Partial<StoreSettings>) => setS((v) => ({ ...v, ...patch }));

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from("store_settings").upsert({ ...s, tenant_id: tenantId, updated_at: new Date().toISOString() });
    setSaving(false);
    if (error) return void toast.error(errorText(error));
    toast.success("تم حفظ معلومات المؤسسة");
    void qc.invalidateQueries({ queryKey: ["store-settings", tenantId] });
  };

  return (
    <div className="surface-card space-y-4 p-6">
      <h2 className="flex items-center gap-2 text-lg font-extrabold">
        <Building2 className="h-5 w-5 text-primary" /> معلومات المؤسسة والطباعة
      </h2>
      <div className="flex items-center gap-3">
        <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-xl border bg-muted">
          {s.logo ? <img src={s.logo} alt="الشعار" className="max-h-full max-w-full" /> : <ImagePlus className="h-6 w-6 text-muted-foreground" />}
        </div>
        <label className="cursor-pointer">
          <span className="inline-flex h-10 items-center rounded-md border px-3 text-sm font-bold">تغيير الشعار</span>
          <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) set({ logo: await resizeLogo(f) });
            e.target.value = "";
          }} />
        </label>
        {s.logo && <Button size="icon" variant="ghost" aria-label="حذف الشعار" onClick={() => set({ logo: null })}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {TEXT_FIELDS.map(([k, label]) => (
          <div key={k} className="space-y-1.5">
            <Label htmlFor={`cs-${k}`}>{label}</Label>
            <Input id={`cs-${k}`} value={(s[k] as string | null) ?? ""} onChange={(e) => set({ [k]: e.target.value || null } as Partial<StoreSettings>)} />
          </div>
        ))}
      </div>
      <div className="space-y-2">
        <Label>عرض وصل البيع</Label>
        <div className="flex gap-2">
          {[58, 60, 80].map((w) => (
            <Button key={w} type="button" variant={s.ticket_width === w ? "default" : "outline"} onClick={() => set({ ticket_width: w })}>{w} مم</Button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <Label>مقاس ملصق الباركود الافتراضي (مم)</Label>
        <div className="flex flex-wrap gap-2">
          {[[40, 20], [40, 25], [50, 30], [58, 40]].map(([w, h]) => (
            <Button key={`${w}x${h}`} type="button" variant={s.label_width === w && s.label_height === h ? "default" : "outline"} onClick={() => set({ label_width: w!, label_height: h! })}>{w}×{h}</Button>
          ))}
        </div>
      </div>
      <Button className="w-full" disabled={saving} onClick={() => void save()}>{saving ? "جاري الحفظ..." : "حفظ الإعدادات"}</Button>
    </div>
  );
}
