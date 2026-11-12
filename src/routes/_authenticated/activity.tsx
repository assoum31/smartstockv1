import { useEffect, useMemo, useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { AlertTriangle, Download, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/stat-card";
import { money } from "@/lib/pos-queries";
import { downloadWorkbook } from "@/lib/excel";

const activityQuery = (tenantId: string, from: string, to: string) =>
  queryOptions({
    queryKey: ["activity", tenantId, from, to],
    queryFn: async () => {
      let q = supabase.from("activity_log").select("*").eq("tenant_id", tenantId);
      if (from) q = q.gte("created_at", new Date(`${from}T00:00:00`).toISOString());
      if (to) q = q.lte("created_at", new Date(`${to}T23:59:59.999`).toISOString());
      const { data, error } = await q.order("created_at", { ascending: false }).limit(1000);
      if (error) throw new Error(error.message);
      return data;
    },
  });

const today = () => new Date().toISOString().slice(0, 10);

export const Route = createFileRoute("/_authenticated/activity")({
  beforeLoad: ({ context }) => {
    if (!context.me.tenant) throw redirect({ to: context.me.homePath });
    return { tenant: context.me.tenant };
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(activityQuery(context.tenant.id, today(), today())),
  head: () => ({ meta: [{ title: "سجل العمليات | SMART STOCK" }] }),
  component: ActivityPage,
});

const CATS: Record<string, string> = {
  sale: "بيع", return: "إرجاع", receipt: "وصول سلع", cash: "الصندوق",
  inventory: "جرد", price: "أسعار", product: "منتجات", team: "الفريق",
};

function ActivityPage() {
  const { tenant, me } = Route.useRouteContext();
  const qc = useQueryClient();
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [cat, setCat] = useState("");
  const [actor, setActor] = useState("");
  const [q, setQ] = useState("");
  const [onlySensitive, setOnlySensitive] = useState(false);
  const { data: rows } = useSuspenseQuery(activityQuery(tenant.id, from, to));

  useEffect(() => {
    const ch = supabase
      .channel(`activity-${tenant.id}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "activity_log", filter: `tenant_id=eq.${tenant.id}` },
        () => void qc.invalidateQueries({ queryKey: ["activity", tenant.id] }))
      .subscribe();
    return () => void supabase.removeChannel(ch);
  }, [tenant.id, qc]);

  const actors = useMemo(() => [...new Set(rows.map((r) => r.actor_name))].sort(), [rows]);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) =>
      (!cat || r.category === cat) && (!actor || r.actor_name === actor) && (!onlySensitive || r.sensitive) &&
      (!s || `${r.action} ${r.ref ?? ""} ${JSON.stringify(r.details)}`.toLowerCase().includes(s)));
  }, [rows, cat, actor, q, onlySensitive]);

  const detail = (d: unknown) => {
    const o = (d ?? {}) as Record<string, unknown>;
    const parts: string[] = [];
    if (o["product"]) parts.push(String(o["product"]));
    if (o["supplier"]) parts.push(`المورد: ${o["supplier"]}`);
    if (o["ticket"]) parts.push(`وصل ${o["ticket"]}`);
    if (o["reason"]) parts.push(String(o["reason"]));
    if (o["role"]) parts.push(String(o["role"]));
    if (o["new_selling"] !== undefined) parts.push(`شراء ${o["old_purchase"]}→${o["new_purchase"]} · بيع ${o["old_selling"]}→${o["new_selling"]}`);
    return parts.join(" · ");
  };

  const exportXlsx = () =>
    void downloadWorkbook(`smartstock_activity_${from || "all"}_${to || "all"}.xlsx`, [{
      name: "Journal",
      headers: ["Date", "Employé", "Catégorie", "Action", "Référence", "Montant", "Détails", "Sensible"],
      rows: list.map((r) => [new Date(r.created_at).toLocaleString("fr-FR"), r.actor_name, CATS[r.category] ?? r.category,
        r.action, r.ref ?? "", r.amount === null ? null : Number(r.amount), detail(r.details), r.sensitive ? "oui" : ""]),
      textColumns: [4],
    }]);

  const sel = "h-11 rounded-md border bg-background px-3 text-sm";
  return (
    <div className="space-y-5">
      <PageHeader title="سجل العمليات" subtitle={me.isManager ? "كل عمليات عمال المتجر، لا يمكن حذفها ولا تعديلها" : "العمليات التي قمت بها"} />
      <div className="surface-card grid gap-2 p-3 sm:grid-cols-3 lg:grid-cols-6">
        <div className="relative sm:col-span-2">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-11 ps-9" placeholder="رقم وصل، منتج..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className={sel} value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">كل الفئات</option>
          {Object.entries(CATS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        {me.isManager && (
          <select className={sel} value={actor} onChange={(e) => setActor(e.target.value)}>
            <option value="">كل العمال</option>
            {actors.map((a) => <option key={a}>{a}</option>)}
          </select>
        )}
        <Input type="date" className="h-11" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="من" />
        <Input type="date" className="h-11" value={to} onChange={(e) => setTo(e.target.value)} aria-label="إلى" />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant={onlySensitive ? "default" : "outline"} onClick={() => setOnlySensitive((v) => !v)}><AlertTriangle />الحساسة فقط</Button>
        <Button size="sm" variant="outline" onClick={() => { setFrom(""); setTo(""); }}>كل الأيام</Button>
        {me.isManager && <Button size="sm" variant="outline" onClick={exportXlsx}><Download />Excel</Button>}
        <span className="ms-auto self-center text-sm text-muted-foreground">{list.length} عملية</span>
      </div>
      <div className="surface-card divide-y">
        {list.length === 0 && <p className="p-8 text-center text-muted-foreground">لا توجد عمليات.</p>}
        {list.map((r) => (
          <div key={r.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm ${r.sensitive ? "border-s-4 border-s-warning" : ""}`}>
            <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-bold">{CATS[r.category] ?? r.category}</span>
            <span className="font-bold">{r.action}</span>
            {r.ref && <span className="barcode-chip text-xs">{r.ref}</span>}
            <span className="min-w-0 flex-1 truncate text-muted-foreground">{detail(r.details)}</span>
            {r.amount !== null && <span className="font-mono font-bold">{money(Number(r.amount))}</span>}
            <span className="w-full text-xs text-muted-foreground sm:w-auto">{r.actor_name} · {new Date(r.created_at).toLocaleString("fr-FR")}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
