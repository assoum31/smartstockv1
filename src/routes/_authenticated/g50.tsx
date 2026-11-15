import { useMemo, useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { FileSpreadsheet, Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/stat-card";
import { downloadWorkbook } from "@/lib/excel";
import { g50Summary } from "@/lib/subscription";

export const Route = createFileRoute("/_authenticated/g50")({
  beforeLoad: ({ context }) => {
    const me = context.me;
    if (!me.tenant || !(me.isManager || me.roles.includes("storekeeper"))) throw redirect({ to: me.homePath });
    return { tenant: me.tenant, canExport: me.features.import_export };
  },
  head: () => ({ meta: [{ title: "تصريح G50 | SMART STOCK" }] }),
  component: G50Page,
});

const monthRange = (m: string) => {
  const [y = 2026, mo = 1] = m.split("-").map(Number);
  return { from: new Date(Date.UTC(y, mo - 1, 1)).toISOString(), to: new Date(Date.UTC(y, mo, 1)).toISOString() };
};
const sum = (rows: { total_amount: number | string }[] | null) => (rows ?? []).reduce((a, r) => a + Number(r.total_amount), 0);

const g50Query = (tenantId: string, month: string) =>
  queryOptions({
    queryKey: ["g50", tenantId, month],
    queryFn: async () => {
      const { from, to } = monthRange(month);
      const [sales, receipts, returns] = await Promise.all([
        supabase.from("sales_tickets").select("total_amount").eq("tenant_id", tenantId).gte("created_at", from).lt("created_at", to),
        supabase.from("goods_receipts").select("total_amount").eq("tenant_id", tenantId).gte("created_at", from).lt("created_at", to),
        supabase.from("stock_returns").select("total_amount, kind").eq("tenant_id", tenantId).gte("created_at", from).lt("created_at", to),
      ]);
      for (const r of [sales, receipts, returns]) if (r.error) throw r.error;
      const customerReturns = sum((returns.data ?? []).filter((r) => r.kind === "customer"));
      const supplierReturns = sum((returns.data ?? []).filter((r) => r.kind === "supplier"));
      return {
        tickets: sales.data?.length ?? 0,
        salesTtc: sum(sales.data) - customerReturns,
        purchasesTtc: sum(receipts.data) - supplierReturns,
        customerReturns,
        supplierReturns,
      };
    },
  });

const fmt = (n: number) => n.toLocaleString("fr-DZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " دج";

function G50Page() {
  const { tenant, canExport } = Route.useRouteContext();
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [tva, setTva] = useState("19");
  const [tap, setTap] = useState("0");
  const { data, isLoading } = useQuery(g50Query(tenant.id, month));
  const s = useMemo(
    () => data && g50Summary({ salesTtc: data.salesTtc, purchasesTtc: data.purchasesTtc, tvaRate: Number(tva) || 0, tapRate: Number(tap) || 0 }),
    [data, tva, tap],
  );

  const lines: [string, number][] = s && data
    ? [
        ["رقم الأعمال TTC (بعد مرتجعات الزبائن)", data.salesTtc],
        ["رقم الأعمال HT (الخاضع للرسم)", s.salesHt],
        ["TVA المحصلة", s.tvaCollected],
        ["المشتريات TTC (بعد مرتجعات الموردين)", data.purchasesTtc],
        ["المشتريات HT", s.purchasesHt],
        ["TVA القابلة للخصم", s.tvaDeductible],
        ["TVA الواجب دفعها", s.tvaDue],
        ["فائض TVA (رصيد لصالحكم)", s.tvaCredit],
        [`TAP (${tap}%)`, s.tap],
        ["المجموع الواجب دفعه", s.totalDue],
      ]
    : [];

  const exportXlsx = () =>
    void downloadWorkbook(`SMART-STOCK-G50-${month}.xlsx`, [
      { name: "G50", headers: ["البند", "المبلغ (دج)"], rows: [["المتجر", tenant.name], ["الشهر", month], ["نسبة TVA %", tva], ...lines] },
    ]);

  return (
    <div className="space-y-6">
      <PageHeader title="تصريح G50" subtitle="ملخص شهري تقديري لـ TVA و TAP من المبيعات والمشتريات المسجلة." />
      <div className="surface-card grid grid-cols-1 gap-3 p-4 sm:grid-cols-3">
        <div className="space-y-2"><Label>الشهر</Label><Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></div>
        <div className="space-y-2"><Label>نسبة TVA %</Label><Input inputMode="decimal" value={tva} onChange={(e) => setTva(e.target.value)} /></div>
        <div className="space-y-2"><Label>نسبة TAP %</Label><Input inputMode="decimal" value={tap} onChange={(e) => setTap(e.target.value)} /></div>
      </div>
      <div className="surface-card overflow-hidden">
        {isLoading || !s ? (
          <p className="p-6 text-center text-muted-foreground">جارٍ الحساب...</p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {lines.map(([k, v], i) => (
                <tr key={k} className={i === lines.length - 1 ? "bg-primary/10 font-extrabold" : "border-b"}>
                  <td className="p-3">{k}</td>
                  <td className="p-3 text-end tabular-nums">{fmt(v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="flex flex-wrap gap-2 print:hidden">
        {canExport && (
          <Button variant="outline" onClick={exportXlsx} disabled={!s}><FileSpreadsheet />تصدير Excel</Button>
        )}
        <Button variant="outline" onClick={() => window.print()} disabled={!s}><Printer />طباعة</Button>
      </div>
      <p className="text-xs text-muted-foreground">
        الأرقام تقديرية وتفترض أن الأسعار المسجلة تشمل الرسم (TTC). راجعها مع محاسبك قبل إيداع التصريح.
      </p>
    </div>
  );
}
