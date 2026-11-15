import { useMemo, useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Banknote, Pencil, Phone, Plus, Printer, Trash2, Truck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader } from "@/components/stat-card";
import { money, suppliersQuery, type Supplier } from "@/lib/pos-queries";
import { companyHeader, esc, openPrint, useStoreSettings } from "@/lib/store-settings";
import { errorText } from "@/lib/messages";

export const Route = createFileRoute("/_authenticated/suppliers")({
  beforeLoad: ({ context }) => {
    if (!context.me.canStock || !context.me.tenant) throw redirect({ to: context.me.homePath });
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
  const settings = useStoreSettings(tenant.id);
  const [onlyDebt, setOnlyDebt] = useState(false);
  const [paying, setPaying] = useState<Supplier | null>(null);
  const ledger = useQuery({
    queryKey: ["supplier-ledger", tenant.id],
    queryFn: async () => {
      const [r, p] = await Promise.all([
        supabase.from("goods_receipts").select("id, supplier_id, receipt_number, total_amount, paid_amount, created_at").eq("tenant_id", tenant.id).not("supplier_id", "is", null),
        supabase.from("supplier_payments").select("*").eq("tenant_id", tenant.id),
      ]);
      if (r.error) throw r.error;
      if (p.error) throw p.error;
      return { receipts: r.data, payments: p.data };
    },
  });
  const balances = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of ledger.data?.receipts ?? []) {
      if (r.paid_amount == null) continue;
      m.set(r.supplier_id!, (m.get(r.supplier_id!) ?? 0) + Number(r.total_amount) - Number(r.paid_amount));
    }
    for (const p of ledger.data?.payments ?? []) m.set(p.supplier_id, (m.get(p.supplier_id) ?? 0) - Number(p.amount));
    return m;
  }, [ledger.data]);
  const totalDebt = [...balances.values()].reduce((a, b) => a + Math.max(0, b), 0);
  const shown = onlyDebt ? suppliers.filter((s) => (balances.get(s.id) ?? 0) > 0.009) : suppliers;
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["suppliers", tenant.id] });
    void qc.invalidateQueries({ queryKey: ["supplier-ledger", tenant.id] });
  };

  const statement = (s: Supplier) => {
    const rows = [
      ...(ledger.data?.receipts ?? []).filter((r) => r.supplier_id === s.id).map((r) => ({ at: r.created_at, label: `وصل استلام BR-${String(r.receipt_number).padStart(5, "0")}`, credit: Number(r.total_amount), debit: Number(r.paid_amount ?? r.total_amount) })),
      ...(ledger.data?.payments ?? []).filter((p) => p.supplier_id === s.id).map((p) => ({ at: p.created_at, label: `تسديد (${p.source === "cash" ? "الصندوق" : "خارجي"})${p.note ? " — " + p.note : ""}`, credit: 0, debit: Number(p.amount) })),
    ].sort((a, b) => a.at.localeCompare(b.at));
    let run = 0;
    const tr = rows.map((r) => { run += r.credit - r.debit; return `<tr><td>${new Date(r.at).toLocaleDateString("fr-FR")}</td><td>${esc(r.label)}</td><td>${money(r.credit)}</td><td>${money(r.debit)}</td><td>${money(run)}</td></tr>`; }).join("");
    openPrint(`<!doctype html><html dir="rtl"><head><meta charset="utf-8"/><title>كشف حساب ${esc(s.name)}</title><style>@page{size:${settings.invoice_paper === "A5" ? "A5" : "A4"};margin:12mm}body{font-family:Arial;font-size:12px}.hdr{display:flex;gap:12px;align-items:center;border-bottom:2px solid #111;padding-bottom:8px}.hdr h2{margin:0}.logo{max-height:60px}h1{text-align:center;font-size:17px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #999;padding:5px;text-align:center}th{background:#eee}.tot{text-align:left;font-weight:bold;font-size:15px;margin-top:10px}</style></head><body>${companyHeader(settings, tenant.name, false)}<h1>كشف حساب المورد: ${esc(s.name)}</h1><p>${esc(s.phone ?? "")} · ${new Date().toLocaleDateString("fr-FR")}</p><table><thead><tr><th>التاريخ</th><th>البيان</th><th>مستحق</th><th>مدفوع</th><th>الرصيد</th></tr></thead><tbody>${tr}</tbody></table><p class="tot">الدين المتبقي: ${money(run)} دج</p></body></html>`);
  };

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
      <div className="flex flex-wrap items-center gap-3">
        <div className="surface-card flex-1 p-4">
          <p className="text-xs text-muted-foreground">إجمالي ديون الموردين</p>
          <p className="font-mono text-2xl font-extrabold text-destructive">{money(totalDebt)} دج</p>
        </div>
        <Button variant={onlyDebt ? "default" : "outline"} onClick={() => setOnlyDebt((v) => !v)}>الدائنون فقط</Button>
      </div>
      {shown.length === 0 ? (
        <div className="surface-card p-10 text-center text-muted-foreground">
          <Truck className="mx-auto mb-3 h-10 w-10" />
          لا يوجد موردون بعد.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((s) => (
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
              <div className="flex items-center gap-2 border-t border-border pt-2">
                <span className={`flex-1 text-sm font-bold ${(balances.get(s.id) ?? 0) > 0.009 ? "text-destructive" : "text-muted-foreground"}`}>
                  الدين: <span className="font-mono">{money(Math.max(0, balances.get(s.id) ?? 0))}</span> دج
                </span>
                <Button size="sm" variant="outline" onClick={() => setPaying(s)}><Banknote className="h-4 w-4" /> تسديد</Button>
                <Button size="icon" variant="ghost" aria-label="كشف حساب" onClick={() => statement(s)}><Printer className="h-4 w-4" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <PayDialog supplier={paying} debt={paying ? Math.max(0, balances.get(paying.id) ?? 0) : 0} onClose={() => setPaying(null)} onDone={refresh} />

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="sm:max-w-md">
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

function PayDialog({ supplier, debt, onClose, onDone }: { supplier: Supplier | null; debt: number; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [source, setSource] = useState<"cash" | "external">("external");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!supplier) return;
    const n = Number(amount.replace(",", "."));
    if (!(n > 0)) return void toast.error("أدخل مبلغاً صحيحاً");
    setBusy(true);
    const { error } = await supabase.rpc("record_supplier_payment", { _supplier_id: supplier.id, _amount: n, _note: note, _source: source });
    setBusy(false);
    if (error) return void toast.error(errorText(error));
    toast.success("تم تسجيل التسديد");
    setAmount(""); setNote("");
    onDone(); onClose();
  };
  return (
    <Dialog open={!!supplier} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-right sm:text-right"><DialogTitle>تسديد دين: {supplier?.name}</DialogTitle></DialogHeader>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          <p className="text-sm">الدين الحالي: <b className="font-mono">{money(debt)}</b> دج</p>
          <div className="space-y-1.5"><Label htmlFor="sp-amount">المبلغ</Label><Input id="sp-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-11 font-mono" /></div>
          <div className="space-y-1.5">
            <Label>مصدر الدفع</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant={source === "cash" ? "default" : "outline"} onClick={() => setSource("cash")}>من الصندوق</Button>
              <Button type="button" variant={source === "external" ? "default" : "outline"} onClick={() => setSource("external")}>خارجي / بنك</Button>
            </div>
          </div>
          <div className="space-y-1.5"><Label htmlFor="sp-note">ملاحظة</Label><Input id="sp-note" value={note} onChange={(e) => setNote(e.target.value)} className="h-11" /></div>
          <Button type="submit" size="lg" className="w-full" disabled={busy}>{busy ? "جاري الحفظ..." : "تسجيل التسديد"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
