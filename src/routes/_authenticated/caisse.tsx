import { useMemo, useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowDownToLine, ArrowUpFromLine, Landmark, Trash2, Vault } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader, StatCard } from "@/components/stat-card";
import { money } from "@/lib/pos-queries";
import { errorText } from "@/lib/messages";
import { cashSessionSummary, treasuryBalance, type TreasuryKind } from "@/lib/treasury";

const caisseQuery = (tenantId: string) =>
  queryOptions({
    queryKey: ["caisse", tenantId],
    queryFn: async () => {
      const since = new Date(Date.now() - 90 * 86400000).toISOString();
      const [cs, tk, cp, sp, ex, rt, adv, tr] = await Promise.all([
        supabase.from("cash_sessions").select("*").eq("tenant_id", tenantId).order("opened_at", { ascending: false }).limit(300),
        supabase.from("sales_tickets").select("id, total_amount, payment_method, cash_session_id, created_at, ticket_number, created_by_name").eq("tenant_id", tenantId).gte("created_at", since).limit(5000),
        supabase.from("customer_payments").select("*").eq("tenant_id", tenantId).gte("created_at", since).limit(2000),
        supabase.from("supplier_payments").select("*").eq("tenant_id", tenantId).gte("created_at", since).limit(2000),
        supabase.from("expenses").select("*").eq("tenant_id", tenantId).gte("created_at", since).limit(2000),
        supabase.from("stock_returns").select("id, total_amount, created_at, created_by_name, kind").eq("tenant_id", tenantId).eq("kind", "customer").gte("created_at", since).limit(2000),
        supabase.from("employee_advances" as never).select("*").eq("tenant_id", tenantId).gte("created_at", since).limit(2000),
        supabase.from("treasury_transactions").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(2000),
      ]);
      for (const r of [cs, tk, cp, sp, ex, rt, tr]) if (r.error) throw r.error;
      return {
        sessions: cs.data ?? [], tickets: tk.data ?? [], customerPayments: cp.data ?? [], supplierPayments: sp.data ?? [],
        expenses: ex.data ?? [], returns: rt.data ?? [], advances: ((adv.error ? [] : adv.data) ?? []) as { amount: number; created_at: string; employee_name?: string; created_by_name?: string; cash_session_id?: string | null }[],
        treasury: tr.data ?? [],
      };
    },
  });

export const Route = createFileRoute("/_authenticated/caisse")({
  beforeLoad: ({ context }) => {
    if (!context.me.canSell || !context.me.tenant) throw redirect({ to: context.me.homePath });
    return { tenant: context.me.tenant, isManager: context.me.isManager };
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(caisseQuery(context.tenant.id)),
  head: () => ({ meta: [{ title: "الكاسة والخزينة | SMART STOCK" }, { name: "description", content: "سجل فتح وغلق الكاسة، الحركات المالية اليومية ورصيد الخزينة." }, { property: "og:title", content: "الكاسة والخزينة | SMART STOCK" }, { property: "og:description", content: "Caisse et Trésor du magasin." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: CaissePage,
});

const KIND_LABEL: Record<TreasuryKind, string> = { versement: "تحويل من الكاسة إلى الخزينة", alimentation: "تغذية الكاسة من الخزينة", deposit: "إيداع في الخزينة", withdrawal: "سحب من الخزينة" };
const today = () => new Date().toISOString().slice(0, 10);

function CaissePage() {
  const { tenant, isManager } = Route.useRouteContext();
  const qc = useQueryClient();
  const { data } = useSuspenseQuery(caisseQuery(tenant.id));
  const [tab, setTab] = useState<"sessions" | "day" | "tresor">("sessions");
  const [day, setDay] = useState(today());
  const [kind, setKind] = useState<TreasuryKind>("versement");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const refresh = () => void qc.invalidateQueries({ queryKey: ["caisse", tenant.id] });

  const sessions = useMemo(() => data.sessions.map((s) => ({ s, sum: cashSessionSummary(s, data) })), [data]);
  const balance = treasuryBalance(data.treasury);

  const moves = useMemo(() => {
    const on = (d: string) => !day || d.slice(0, 10) === day;
    const rows: { at: string; label: string; who: string; amount: number }[] = [];
    data.tickets.filter((t) => on(t.created_at) && t.payment_method === "cash").forEach((t) => rows.push({ at: t.created_at, label: `بيع نقدي #${t.ticket_number}`, who: t.created_by_name, amount: Number(t.total_amount) }));
    data.customerPayments.filter((x) => on(x.created_at)).forEach((x) => rows.push({ at: x.created_at, label: "تسديد دين زبون", who: x.created_by_name, amount: Number(x.amount) }));
    data.returns.filter((x) => on(x.created_at)).forEach((x) => rows.push({ at: x.created_at, label: "إرجاع زبون", who: x.created_by_name, amount: -Number(x.total_amount) }));
    data.expenses.filter((x) => on(x.created_at)).forEach((x) => rows.push({ at: x.created_at, label: `مصروف: ${x.category}`, who: x.created_by_name, amount: -Number(x.amount) }));
    data.supplierPayments.filter((x) => on(x.created_at)).forEach((x) => rows.push({ at: x.created_at, label: "دفع لمورد", who: x.created_by_name, amount: -Number(x.amount) }));
    data.advances.filter((x) => on(x.created_at)).forEach((x) => rows.push({ at: x.created_at, label: `تسبيق عامل${x.employee_name ? `: ${x.employee_name}` : ""}`, who: x.created_by_name ?? "—", amount: -Number(x.amount) }));
    data.treasury.filter((x) => on(x.created_at) && (x.kind === "versement" || x.kind === "alimentation")).forEach((x) => rows.push({ at: x.created_at, label: KIND_LABEL[x.kind as TreasuryKind], who: x.created_by_name, amount: x.kind === "versement" ? -Number(x.amount) : Number(x.amount) }));
    return rows.sort((a, b) => b.at.localeCompare(a.at));
  }, [data, day]);
  const inSum = moves.filter((m) => m.amount > 0).reduce((n, m) => n + m.amount, 0);
  const outSum = moves.filter((m) => m.amount < 0).reduce((n, m) => n - m.amount, 0);

  const record = async () => {
    const n = Number(amount.replace(",", "."));
    if (!(n > 0)) return void toast.error("أدخل مبلغاً صحيحاً");
    const { error } = await supabase.rpc("record_treasury", { _kind: kind, _amount: n, _note: note });
    if (error) return void toast.error(error.message.includes("no_open_cash") ? "لا توجد كاسة مفتوحة" : errorText(error));
    toast.success("تم تسجيل العملية");
    setAmount(""); setNote(""); refresh();
  };

  return (
    <div className="space-y-5">
      <PageHeader title="الكاسة والخزينة" subtitle="Caisse · Trésor · Coffre" />
      <div className="flex gap-2 overflow-x-auto">
        <Button variant={tab === "sessions" ? "default" : "outline"} onClick={() => setTab("sessions")}>سجل الكاسات</Button>
        <Button variant={tab === "day" ? "default" : "outline"} onClick={() => setTab("day")}>الحركات اليومية</Button>
        <Button variant={tab === "tresor" ? "default" : "outline"} onClick={() => setTab("tresor")}>الخزينة</Button>
      </div>

      {tab === "sessions" && (
        <div className="surface-card overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-muted/50 text-xs"><tr>
              <th className="p-2 text-start">البائع</th><th className="p-2 text-start">الفتح</th><th className="p-2 text-start">الإغلاق</th>
              <th className="p-2 text-end">مبلغ البداية</th><th className="p-2 text-end">المبيعات</th><th className="p-2 text-end">المتوقع</th>
              <th className="p-2 text-end">المصرح به</th><th className="p-2 text-end">الفارق</th>
            </tr></thead>
            <tbody>
              {sessions.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">لا توجد كاسات.</td></tr>}
              {sessions.map(({ s, sum }) => (
                <tr key={s.id} className="border-t">
                  <td className="p-2 font-bold">{s.opened_by_name}{s.status === "open" && <span className="ms-2 rounded-full bg-success/15 px-2 text-[10px] text-success">مفتوحة</span>}</td>
                  <td className="p-2 text-xs">{new Date(s.opened_at).toLocaleString("fr-FR")}</td>
                  <td className="p-2 text-xs">{s.closed_at ? new Date(s.closed_at).toLocaleString("fr-FR") : "—"}</td>
                  <td className="p-2 text-end font-mono">{money(Number(s.opening_amount))}</td>
                  <td className="p-2 text-end font-mono">{money(sum.sales)}</td>
                  <td className="p-2 text-end font-mono">{money(sum.expected)}</td>
                  <td className="p-2 text-end font-mono">{s.closing_amount == null ? "—" : money(Number(s.closing_amount))}</td>
                  <td className={`p-2 text-end font-mono font-bold ${sum.diff == null ? "" : sum.diff < 0 ? "text-destructive" : "text-success"}`}>{sum.diff == null ? "—" : `${sum.diff > 0 ? "+" : ""}${money(sum.diff)}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "day" && (
        <>
          <div className="flex flex-wrap gap-2">
            <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} className="h-10 w-44" />
            <Button variant="outline" onClick={() => setDay("")}>كل الأيام</Button>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <StatCard icon={ArrowDownToLine} label="المداخيل (دج)" value={money(inSum)} />
            <StatCard icon={ArrowUpFromLine} tone="neutral" label="المخارج (دج)" value={money(outSum)} />
            <StatCard icon={Landmark} tone="neutral" label="الصافي (دج)" value={money(inSum - outSum)} />
          </div>
          <div className="surface-card divide-y">
            {moves.length === 0 && <p className="p-6 text-center text-muted-foreground">لا توجد حركات.</p>}
            {moves.map((m, k) => (
              <div key={k} className="flex items-center gap-3 p-3 text-sm">
                <div className="min-w-0 flex-1"><p className="font-bold">{m.label}</p><p className="text-[11px] text-muted-foreground">{m.who} · {new Date(m.at).toLocaleString("fr-FR")}</p></div>
                <span className={`font-mono font-extrabold ${m.amount < 0 ? "text-destructive" : "text-success"}`}>{m.amount > 0 ? "+" : ""}{money(m.amount)}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === "tresor" && (
        <>
          <StatCard icon={Vault} label="رصيد الخزينة (دج)" value={money(balance)} />
          <div className="surface-card grid gap-2 p-4 sm:grid-cols-4">
            <select value={kind} onChange={(e) => setKind(e.target.value as TreasuryKind)} className="h-10 rounded-md border bg-background px-3 text-sm">
              {(Object.keys(KIND_LABEL) as TreasuryKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
            </select>
            <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="المبلغ" className="h-10 font-mono" />
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="ملاحظة (اختياري)" className="h-10" />
            <Button className="h-10" onClick={() => void record()}>تسجيل</Button>
          </div>
          <div className="surface-card divide-y">
            {data.treasury.length === 0 && <p className="p-6 text-center text-muted-foreground">لا توجد عمليات.</p>}
            {data.treasury.map((x) => {
              const sign = x.kind === "versement" || x.kind === "deposit" ? 1 : -1;
              return (
                <div key={x.id} className="flex items-center gap-3 p-3 text-sm">
                  <div className="min-w-0 flex-1"><p className="font-bold">{KIND_LABEL[x.kind as TreasuryKind]}</p><p className="text-[11px] text-muted-foreground">{x.created_by_name} · {new Date(x.created_at).toLocaleString("fr-FR")}{x.note ? ` · ${x.note}` : ""}</p></div>
                  <span className={`font-mono font-extrabold ${sign < 0 ? "text-destructive" : "text-success"}`}>{sign > 0 ? "+" : "−"}{money(Number(x.amount))}</span>
                  {isManager && <Button size="icon" variant="ghost" className="text-destructive" onClick={async () => {
                    if (!window.confirm("حذف هذه العملية؟")) return;
                    const { error } = await supabase.from("treasury_transactions").delete().eq("id", x.id);
                    if (error) return void toast.error(errorText(error));
                    refresh();
                  }}><Trash2 /></Button>}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
