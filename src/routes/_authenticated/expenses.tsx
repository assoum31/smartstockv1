import { useMemo, useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Plus, Trash2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader } from "@/components/stat-card";
import { money } from "@/lib/pos-queries";
import { errorText } from "@/lib/messages";

export const EXPENSE_CATEGORIES = ["كراء", "كهرباء وماء", "نقل وتوصيل", "وجبات وعمال", "صيانة", "مصاريف عامة"];

const expensesQuery = (tenantId: string) =>
  queryOptions({
    queryKey: ["expenses", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase.from("expenses").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(1000);
      if (error) throw error;
      return data;
    },
  });

export const Route = createFileRoute("/_authenticated/expenses")({
  beforeLoad: ({ context }) => {
    if (!context.me.canSell || !context.me.tenant) throw redirect({ to: context.me.homePath });
    return { tenant: context.me.tenant, isManager: context.me.isManager };
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(expensesQuery(context.tenant.id)),
  head: () => ({ meta: [{ title: "المصاريف | SMART STOCK" }, { name: "description", content: "سجل مصاريف المتجر اليومية." }] }),
  component: ExpensesPage,
});

function ExpensesPage() {
  const { tenant, isManager } = Route.useRouteContext();
  const qc = useQueryClient();
  const { data } = useSuspenseQuery(expensesQuery(tenant.id));
  const [open, setOpen] = useState(false);
  const [cat, setCat] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const rows = useMemo(() => data.filter((e) => (!cat || e.category === cat) && (!from || e.created_at.slice(0, 10) >= from) && (!to || e.created_at.slice(0, 10) <= to)), [data, cat, from, to]);
  const total = rows.reduce((n, e) => n + Number(e.amount), 0);
  const refresh = () => void qc.invalidateQueries({ queryKey: ["expenses", tenant.id] });
  const remove = async (id: string) => {
    if (!confirm("حذف هذا المصروف؟")) return;
    const { error } = await supabase.from("expenses").delete().eq("id", id);
    if (error) return void toast.error(errorText(error));
    refresh();
  };
  return (
    <div className="space-y-5">
      <PageHeader title="المصاريف" subtitle="تكاليف المتجر اليومية" actions={<Button onClick={() => setOpen(true)}><Plus /> مصروف جديد</Button>} />
      <div className="surface-card grid gap-3 p-4 sm:grid-cols-4">
        <div className="sm:col-span-1">
          <p className="text-xs text-muted-foreground">المجموع</p>
          <p className="font-mono text-2xl font-extrabold text-destructive">{money(total)} دج</p>
        </div>
        <select aria-label="الفئة" value={cat} onChange={(e) => setCat(e.target.value)} className="h-10 rounded-md border border-input bg-background px-2 text-sm">
          <option value="">كل الفئات</option>
          {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <Input type="date" aria-label="من" value={from} onChange={(e) => setFrom(e.target.value)} className="h-10" />
        <Input type="date" aria-label="إلى" value={to} onChange={(e) => setTo(e.target.value)} className="h-10" />
      </div>
      {rows.length === 0 ? (
        <div className="surface-card p-10 text-center text-muted-foreground"><Wallet className="mx-auto mb-3 h-10 w-10" />لا توجد مصاريف.</div>
      ) : (
        <div className="space-y-2">
          {rows.map((e) => (
            <div key={e.id} className="surface-card flex items-center gap-3 p-3">
              <div className="flex-1">
                <p className="font-bold">{e.category} <span className="text-xs font-normal text-muted-foreground">· {e.source === "cash" ? "من الصندوق" : "خارجي"}</span></p>
                <p className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString("fr-FR")} · {e.created_by_name}{e.note ? ` · ${e.note}` : ""}</p>
              </div>
              <span className="font-mono font-extrabold">{money(Number(e.amount))}</span>
              {isManager && <Button size="icon" variant="ghost" aria-label="حذف" onClick={() => void remove(e.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
            </div>
          ))}
        </div>
      )}
      <NewExpense open={open} onClose={() => setOpen(false)} onDone={refresh} />
    </div>
  );
}

function NewExpense({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [source, setSource] = useState<"cash" | "external">("cash");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    const n = Number(amount.replace(",", "."));
    if (!(n > 0)) return void toast.error("أدخل مبلغاً صحيحاً");
    setBusy(true);
    const { error } = await supabase.rpc("create_expense", { _category: category, _amount: n, _note: note, _source: source });
    setBusy(false);
    if (error) return void toast.error(errorText(error));
    toast.success("تم تسجيل المصروف");
    setAmount(""); setNote("");
    onDone(); onClose();
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-right sm:text-right"><DialogTitle>مصروف جديد</DialogTitle></DialogHeader>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          <div className="space-y-1.5">
            <Label htmlFor="ex-cat">الفئة</Label>
            <select id="ex-cat" value={category} onChange={(e) => setCategory(e.target.value)} className="h-11 w-full rounded-md border border-input bg-background px-2">
              {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="space-y-1.5"><Label htmlFor="ex-amount">المبلغ</Label><Input id="ex-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-11 font-mono" /></div>
          <div className="space-y-1.5">
            <Label>مصدر الدفع</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant={source === "cash" ? "default" : "outline"} onClick={() => setSource("cash")}>من الصندوق</Button>
              <Button type="button" variant={source === "external" ? "default" : "outline"} onClick={() => setSource("external")}>خارجي / بنك</Button>
            </div>
          </div>
          <div className="space-y-1.5"><Label htmlFor="ex-note">ملاحظة</Label><Input id="ex-note" value={note} onChange={(e) => setNote(e.target.value)} className="h-11" /></div>
          <Button type="submit" size="lg" className="w-full" disabled={busy}>{busy ? "جاري الحفظ..." : "حفظ"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
