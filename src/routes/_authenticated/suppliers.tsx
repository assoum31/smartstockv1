import { useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Pencil, Phone, Plus, Trash2, Truck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader } from "@/components/stat-card";
import { suppliersQuery, type Supplier } from "@/lib/pos-queries";
import { errorText } from "@/lib/messages";

export const Route = createFileRoute("/_authenticated/suppliers")({
  beforeLoad: ({ context }) => {
    if (!context.me.canSell || !context.me.tenant) throw redirect({ to: context.me.homePath });
    return { tenant: context.me.tenant, isManager: context.me.isManager };
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(suppliersQuery(context.tenant.id)),
  head: () => ({ meta: [{ title: "الموردون | SMART STOCK" }] }),
  component: SuppliersPage,
});

type Draft = { id?: string; name: string; phone: string; address: string; notes: string };
const empty: Draft = { name: "", phone: "", address: "", notes: "" };

function SuppliersPage() {
  const { tenant, isManager } = Route.useRouteContext();
  const qc = useQueryClient();
  const { data: suppliers } = useSuspenseQuery(suppliersQuery(tenant.id));
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const refresh = () => void qc.invalidateQueries({ queryKey: ["suppliers", tenant.id] });

  const save = async () => {
    if (!draft || !draft.name.trim()) return;
    setSaving(true);
    const row = {
      name: draft.name.trim(),
      phone: draft.phone.trim() || null,
      address: draft.address.trim() || null,
      notes: draft.notes.trim() || null,
    };
    const { error } = draft.id
      ? await supabase.from("suppliers").update(row).eq("id", draft.id)
      : await supabase.from("suppliers").insert({ ...row, tenant_id: tenant.id });
    setSaving(false);
    if (error) return void toast.error(errorText(error));
    toast.success("تم حفظ المورد");
    setDraft(null);
    refresh();
  };

  const remove = async (s: Supplier) => {
    if (!confirm(`حذف المورد ${s.name}؟`)) return;
    const { error } = await supabase.from("suppliers").delete().eq("id", s.id);
    if (error) return void toast.error(errorText(error));
    refresh();
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="الموردون"
        subtitle={`${suppliers.length} مورد`}
        actions={<Button onClick={() => setDraft({ ...empty })}><Plus /> مورد جديد</Button>}
      />
      {suppliers.length === 0 ? (
        <div className="surface-card p-10 text-center text-muted-foreground">
          <Truck className="mx-auto mb-3 h-10 w-10" />
          لا يوجد موردون بعد.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {suppliers.map((s) => (
            <div key={s.id} className="surface-card space-y-1.5 p-4">
              <div className="flex items-start gap-2">
                <p className="flex-1 font-extrabold">{s.name}</p>
                <Button size="icon" variant="ghost" aria-label="تعديل" onClick={() => setDraft({ id: s.id, name: s.name, phone: s.phone ?? "", address: s.address ?? "", notes: s.notes ?? "" })}>
                  <Pencil className="h-4 w-4" />
                </Button>
                {isManager && (
                  <Button size="icon" variant="ghost" aria-label="حذف" onClick={() => void remove(s)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
              {s.phone && (
                <a href={`tel:${s.phone}`} className="flex items-center gap-1.5 text-sm text-primary" dir="ltr">
                  <Phone className="h-3.5 w-3.5" /> {s.phone}
                </a>
              )}
              {s.address && <p className="text-sm text-muted-foreground">{s.address}</p>}
              {s.notes && <p className="text-xs text-muted-foreground">{s.notes}</p>}
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader className="text-right sm:text-right">
            <DialogTitle>{draft?.id ? "تعديل المورد" : "مورد جديد"}</DialogTitle>
          </DialogHeader>
          {draft && (
            <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void save(); }}>
              {([
                ["name", "الاسم / الشركة"],
                ["phone", "الهاتف"],
                ["address", "العنوان / الولاية"],
                ["notes", "ملاحظات"],
              ] as const).map(([k, label]) => (
                <div key={k} className="space-y-1.5">
                  <Label htmlFor={`sup-${k}`}>{label}</Label>
                  <Input id={`sup-${k}`} required={k === "name"} value={draft[k]} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} className="h-11" />
                </div>
              ))}
              <Button type="submit" size="lg" className="w-full" disabled={saving}>{saving ? "جاري الحفظ..." : "حفظ"}</Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
