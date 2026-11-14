import { useMemo, useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Contact, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader } from "@/components/stat-card";
import { errorText } from "@/lib/messages";

type Customer = Tables<"customers">;
export const customersQuery = (tenantId: string) =>
  queryOptions({
    queryKey: ["customers", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data;
    },
  });

export const Route = createFileRoute("/_authenticated/customers")({
  beforeLoad: ({ context }) => {
    if (!context.me.canSell || !context.me.tenant) throw redirect({ to: context.me.homePath });
    return { tenant: context.me.tenant, isManager: context.me.isManager };
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(customersQuery(context.tenant.id)),
  head: () => ({ meta: [{ title: "الزبائن | SMART STOCK" }, { name: "description", content: "قائمة زبائن المتجر ومعلومات الاتصال بهم." }] }),
  component: CustomersPage,
});

function CustomersPage() {
  const { tenant, isManager } = Route.useRouteContext();
  const qc = useQueryClient();
  const { data: rows } = useSuspenseQuery(customersQuery(tenant.id));
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<Customer | null | undefined>(undefined);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) => !s || [r.name, r.phone, r.whatsapp, r.email].some((v) => (v ?? "").toLowerCase().includes(s)));
  }, [rows, q]);
  const refresh = () => void qc.invalidateQueries({ queryKey: ["customers", tenant.id] });
  const del = async (c: Customer) => {
    if (!confirm(`حذف الزبون ${c.name}؟`)) return;
    const { error } = await supabase.from("customers").delete().eq("id", c.id);
    if (error) toast.error(errorText(error)); else { toast.success("تم الحذف"); refresh(); }
  };
  return (
    <div className="space-y-5">
      <PageHeader title="الزبائن" subtitle="أضف زبائنك واحفظ أرقامهم" actions={<Button onClick={() => setEdit(null)}><Plus />زبون جديد</Button>} />
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث بالاسم أو الهاتف" />
      <ul className="space-y-2">
        {list.map((c) => (
          <li key={c.id} className="surface-card flex items-center gap-3 p-3">
            <Contact className="h-5 w-5 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold">{c.name}</p>
              <p className="truncate text-xs text-muted-foreground" dir="ltr">{[c.phone, c.whatsapp && `WA ${c.whatsapp}`, c.email].filter(Boolean).join(" · ") || "—"}</p>
            </div>
            <Button size="icon" variant="ghost" aria-label="تعديل" onClick={() => setEdit(c)}><Pencil /></Button>
            {isManager && <Button size="icon" variant="ghost" aria-label="حذف" onClick={() => void del(c)}><Trash2 /></Button>}
          </li>
        ))}
        {!list.length && <li className="surface-card p-8 text-center text-sm text-muted-foreground">لا يوجد زبائن</li>}
      </ul>
      <CustomerDialog customer={edit} onClose={() => setEdit(undefined)} onSaved={refresh} tenantId={tenant.id} />
    </div>
  );
}

export function CustomerDialog({ customer, onClose, onSaved, tenantId }: { customer: Customer | null | undefined; onClose: () => void; onSaved: () => void; tenantId: string }) {
  const open = customer !== undefined;
  const [f, setF] = useState({ name: "", phone: "", whatsapp: "", email: "", address: "", notes: "" });
  const [key, setKey] = useState<string | null>(null);
  const k = customer === undefined ? null : customer?.id ?? "new";
  if (k !== key) {
    setKey(k);
    setF({ name: customer?.name ?? "", phone: customer?.phone ?? "", whatsapp: customer?.whatsapp ?? "", email: customer?.email ?? "", address: customer?.address ?? "", notes: customer?.notes ?? "" });
  }
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!f.name.trim()) { toast.error("الاسم مطلوب"); return; }
    setBusy(true);
    const row = { name: f.name.trim(), phone: f.phone || null, whatsapp: f.whatsapp || null, email: f.email || null, address: f.address || null, notes: f.notes || null };
    const { error } = customer
      ? await supabase.from("customers").update(row).eq("id", customer.id)
      : await supabase.from("customers").insert({ ...row, tenant_id: tenantId });
    setBusy(false);
    if (error) { toast.error(errorText(error)); return; }
    toast.success("تم الحفظ");
    onSaved();
    onClose();
  };
  const field = (id: keyof typeof f, label: string, ltr = false) => (
    <div className="space-y-1.5">
      <Label htmlFor={`c-${id}`}>{label}</Label>
      <Input id={`c-${id}`} dir={ltr ? "ltr" : undefined} value={f[id]} onChange={(e) => setF({ ...f, [id]: e.target.value })} />
    </div>
  );
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-right sm:text-right"><DialogTitle>{customer ? "تعديل زبون" : "زبون جديد"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {field("name", "الاسم")}
          {field("phone", "الهاتف", true)}
          {field("whatsapp", "واتساب", true)}
          {field("email", "البريد الإلكتروني (اختياري)", true)}
          {field("address", "العنوان")}
          {field("notes", "ملاحظة")}
          <Button className="w-full" disabled={busy} onClick={() => void save()}>حفظ</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
