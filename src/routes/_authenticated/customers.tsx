import { useMemo, useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Contact, HandCoins, Pencil, Plus, Printer, Trash2 } from "lucide-react";
import { money } from "@/lib/pos-queries";
import { esc, openPrint, useStoreSettings, companyHeader } from "@/lib/store-settings";
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
export const debtsQuery = (tenantId: string) =>
  queryOptions({
    queryKey: ["customer-debts", tenantId],
    queryFn: async () => {
      const [t, p] = await Promise.all([
        supabase.from("sales_tickets").select("id, ticket_number, total_amount, created_at, customer_id").eq("tenant_id", tenantId).eq("payment_method", "credit").not("customer_id", "is", null),
        supabase.from("customer_payments").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }),
      ]);
      if (t.error) throw new Error(t.error.message);
      if (p.error) throw new Error(p.error.message);
      return { tickets: t.data, payments: p.data };
    },
  });
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
  loader: ({ context }) => Promise.all([context.queryClient.ensureQueryData(customersQuery(context.tenant.id)), context.queryClient.ensureQueryData(debtsQuery(context.tenant.id))]),
  head: () => ({ meta: [{ title: "الزبائن | SMART STOCK" }, { name: "description", content: "قائمة زبائن المتجر ومعلومات الاتصال بهم." }] }),
  component: CustomersPage,
});

function CustomersPage() {
  const { tenant, isManager } = Route.useRouteContext();
  const qc = useQueryClient();
  const { data: rows } = useSuspenseQuery(customersQuery(tenant.id));
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<Customer | null | undefined>(undefined);
  const { data: debts } = useSuspenseQuery(debtsQuery(tenant.id));
  const settings = useStoreSettings(tenant.id);
  const [onlyDebt, setOnlyDebt] = useState(false);
  const [paying, setPaying] = useState<Customer | null>(null);
  const balance = (id: string) =>
    debts.tickets.filter((t) => t.customer_id === id).reduce((n, t) => n + Number(t.total_amount), 0) -
    debts.payments.filter((p) => p.customer_id === id).reduce((n, p) => n + Number(p.amount), 0);
  const totalDebt = rows.reduce((n, r) => n + Math.max(0, balance(r.id)), 0);
  const statement = (c: Customer) => {
    const lines = [
      ...debts.tickets.filter((t) => t.customer_id === c.id).map((t) => ({ at: t.created_at, label: `بيع بالدين — بون ${String(t.ticket_number).padStart(4, "0")}`, debit: Number(t.total_amount), credit: 0 })),
      ...debts.payments.filter((p) => p.customer_id === c.id).map((p) => ({ at: p.created_at, label: `تسديد${p.note ? ` — ${p.note}` : ""}`, debit: 0, credit: Number(p.amount) })),
    ].sort((a, b) => a.at.localeCompare(b.at));
    let run = 0;
    const tr = lines.map((l) => { run += l.debit - l.credit; return `<tr><td>${new Date(l.at).toLocaleDateString("fr-FR")}</td><td>${esc(l.label)}</td><td>${l.debit ? money(l.debit) : ""}</td><td>${l.credit ? money(l.credit) : ""}</td><td>${money(run)}</td></tr>`; }).join("");
    openPrint(`<!doctype html><html dir="rtl"><head><meta charset="utf-8"/><title>كشف حساب ${esc(c.name)}</title><style>@page{size:${settings.invoice_paper === "A5" ? "A5" : "A4"};margin:12mm}body{font-family:Arial;font-size:12px}.hdr{display:flex;gap:12px;align-items:center;border-bottom:2px solid #111;padding-bottom:8px}.hdr h2{margin:0}.logo{max-height:60px}h1{text-align:center;font-size:17px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #999;padding:5px;text-align:center}th{background:#eee}.tot{text-align:left;font-weight:bold;font-size:15px;margin-top:10px}</style></head><body>${companyHeader(settings, tenant.name, false)}<h1>كشف حساب الزبون: ${esc(c.name)}</h1><p>${esc(c.phone ?? "")} · ${new Date().toLocaleDateString("fr-FR")}</p><table><thead><tr><th>التاريخ</th><th>البيان</th><th>مدين</th><th>دائن</th><th>الرصيد</th></tr></thead><tbody>${tr}</tbody></table><p class="tot">الرصيد المستحق: ${money(run)} دج</p></body></html>`);
  };
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) => (!s || [r.name, r.phone, r.whatsapp, r.email].some((v) => (v ?? "").toLowerCase().includes(s))) && (!onlyDebt || balance(r.id) > 0.009));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, q, onlyDebt, debts]);
  const refresh = () => { void qc.invalidateQueries({ queryKey: ["customers", tenant.id] }); void qc.invalidateQueries({ queryKey: ["customer-debts", tenant.id] }); };
  const del = async (c: Customer) => {
    if (!confirm(`حذف الزبون ${c.name}؟`)) return;
    const { error } = await supabase.from("customers").delete().eq("id", c.id);
    if (error) toast.error(errorText(error)); else { toast.success("تم الحذف"); refresh(); }
  };
  return (
    <div className="space-y-5">
      <PageHeader title="الزبائن" subtitle="أضف زبائنك واحفظ أرقامهم" actions={<Button onClick={() => setEdit(null)}><Plus />زبون جديد</Button>} />
      <div className="surface-card flex items-center justify-between gap-3 p-4">
        <div><p className="text-xs text-muted-foreground">مجموع ديون الزبائن</p><p className="font-mono text-2xl font-extrabold text-destructive">{money(totalDebt)} دج</p></div>
        <Button variant={onlyDebt ? "default" : "outline"} onClick={() => setOnlyDebt((v) => !v)}><HandCoins />المدينون فقط</Button>
      </div>
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث بالاسم أو الهاتف" />
      <ul className="space-y-2">
        {list.map((c) => (
          <li key={c.id} className="surface-card flex items-center gap-3 p-3">
            <Contact className="h-5 w-5 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold">{c.name}</p>
              <p className="truncate text-xs text-muted-foreground" dir="ltr">{[c.phone, c.whatsapp && `WA ${c.whatsapp}`, c.email].filter(Boolean).join(" · ") || "—"}</p>
            </div>
            {(() => { const b = balance(c.id); return b > 0.009 ? <span className="shrink-0 rounded-md bg-destructive/10 px-2 py-1 font-mono text-xs font-bold text-destructive">{money(b)} دج</span> : null; })()}
            <Button size="icon" variant="ghost" aria-label="تسديد دين" onClick={() => setPaying(c)}><HandCoins /></Button>
            <Button size="icon" variant="ghost" aria-label="كشف حساب" onClick={() => statement(c)}><Printer /></Button>
            <Button size="icon" variant="ghost" aria-label="تعديل" onClick={() => setEdit(c)}><Pencil /></Button>
            {isManager && <Button size="icon" variant="ghost" aria-label="حذف" onClick={() => void del(c)}><Trash2 /></Button>}
          </li>
        ))}
        {!list.length && <li className="surface-card p-8 text-center text-sm text-muted-foreground">لا يوجد زبائن</li>}
      </ul>
      <PaymentDialog customer={paying} due={paying ? balance(paying.id) : 0} onClose={() => setPaying(null)} onSaved={refresh} />
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

function PaymentDialog({ customer, due, onClose, onSaved }: { customer: Customer | null; due: number; onClose: () => void; onSaved: () => void }) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const n = Number(amount.replace(",", "."));
    if (!customer || !(n > 0)) return void toast.error("أدخل مبلغاً صحيحاً");
    setBusy(true);
    const { error } = await supabase.rpc("record_customer_payment", { _customer_id: customer.id, _amount: n, _note: note });
    setBusy(false);
    if (error) return void toast.error(errorText(error));
    toast.success("تم تسجيل التسديد");
    setAmount(""); setNote("");
    onSaved(); onClose();
  };
  return (
    <Dialog open={!!customer} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader className="text-right sm:text-right"><DialogTitle>تسديد دين — {customer?.name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-sm">الرصيد المستحق: <b className="font-mono">{money(Math.max(0, due))} دج</b></p>
          <div className="space-y-1.5"><Label htmlFor="pay-amt">المبلغ المدفوع</Label><Input id="pay-amt" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-12 text-center font-mono text-xl" /></div>
          <div className="space-y-1.5"><Label htmlFor="pay-note">ملاحظة (اختياري)</Label><Input id="pay-note" value={note} onChange={(e) => setNote(e.target.value)} /></div>
          <Button className="w-full" disabled={busy} onClick={() => void save()}>تسجيل التسديد</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
