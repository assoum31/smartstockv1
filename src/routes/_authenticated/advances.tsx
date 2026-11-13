import { useMemo, useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { HandCoins, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader } from "@/components/stat-card";
import { teamQuery } from "@/lib/queries";
import { errorText, formatDateTime } from "@/lib/messages";

const advancesQuery = (tenantId: string) =>
  queryOptions({
    queryKey: ["advances", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cash_advances")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) throw new Error(error.message);
      return data;
    },
  });

export const Route = createFileRoute("/_authenticated/advances")({
  beforeLoad: ({ context }) => {
    if (!context.me.canSell || !context.me.tenant) throw redirect({ to: context.me.homePath });
    return { tenant: context.me.tenant };
  },
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(advancesQuery(context.tenant.id)),
      context.queryClient.ensureQueryData(teamQuery(context.tenant.id)),
    ]),
  head: () => ({
    meta: [
      { title: "التسبيقات | SMART STOCK" },
      { name: "description", content: "سجل المبالغ التي يأخذها العمال من الصندوق مع السبب." },
    ],
  }),
  component: AdvancesPage,
});

const money = (n: number) => `${n.toLocaleString("fr-DZ", { maximumFractionDigits: 2 })}\u00A0DA`;

function AdvancesPage() {
  const { tenant } = Route.useRouteContext();
  const qc = useQueryClient();
  const { data: rows } = useSuspenseQuery(advancesQuery(tenant.id));
  const { data: team } = useSuspenseQuery(teamQuery(tenant.id));
  const [worker, setWorker] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) => {
      const day = r.created_at.slice(0, 10);
      return (
        (worker === "all" || r.beneficiary_id === worker) &&
        (!from || day >= from) &&
        (!to || day <= to) &&
        (!s || (r.reason ?? "").toLowerCase().includes(s) || r.beneficiary_name.toLowerCase().includes(s))
      );
    });
  }, [rows, worker, from, to, q]);
  const total = list.reduce((a, r) => a + Number(r.amount), 0);
  const perWorker = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of list) m.set(r.beneficiary_name, (m.get(r.beneficiary_name) ?? 0) + Number(r.amount));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [list]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="التسبيقات"
        subtitle="ما أخذه كل عامل من الصندوق ولماذا"
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus />
            تسبيق جديد
          </Button>
        }
      />
      <div className="surface-card grid gap-3 p-3 sm:grid-cols-4">
        <Select value={worker} onValueChange={setWorker}>
          <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل العمال</SelectItem>
            {team.map((m) => (
              <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="من تاريخ" />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="إلى تاريخ" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث في السبب أو الاسم" />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="surface-card p-4">
          <p className="text-xs text-muted-foreground">إجمالي التسبيقات</p>
          <p className="text-2xl font-extrabold whitespace-nowrap">{money(total)}</p>
        </div>
        <div className="surface-card p-4 sm:col-span-2">
          <p className="mb-2 text-xs text-muted-foreground">المجموع حسب العامل</p>
          <ul className="flex flex-wrap gap-2">
            {perWorker.map(([n, v]) => (
              <li key={n} className="rounded-full bg-secondary px-3 py-1 text-xs font-bold">
                {n}: {money(v)}
              </li>
            ))}
            {!perWorker.length && <li className="text-sm text-muted-foreground">—</li>}
          </ul>
        </div>
      </div>
      <ul className="space-y-2">
        {list.map((r) => (
          <li key={r.id} className="surface-card flex items-center gap-3 p-3">
            <HandCoins className="h-5 w-5 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold">{r.beneficiary_name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {r.reason || "بدون سبب"} · {formatDateTime(r.created_at)} · سجّله {r.created_by_name}
              </p>
            </div>
            <span className="whitespace-nowrap font-extrabold">{money(Number(r.amount))}</span>
          </li>
        ))}
        {!list.length && <li className="surface-card p-8 text-center text-sm text-muted-foreground">لا توجد تسبيقات</li>}
      </ul>
      <NewAdvance
        open={open}
        onOpenChange={setOpen}
        team={team}
        onDone={() => void qc.invalidateQueries({ queryKey: ["advances", tenant.id] })}
      />
    </div>
  );
}

function NewAdvance({
  open,
  onOpenChange,
  team,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  team: { id: string; full_name: string }[];
  onDone: () => void;
}) {
  const [who, setWho] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const n = Number(amount);
    if (!who) { toast.error("اختر العامل"); return; }
    if (!Number.isFinite(n) || n <= 0) { toast.error("مبلغ غير صالح"); return; }
    setBusy(true);
    const { error } = await supabase.rpc("create_cash_advance", { _beneficiary_id: who, _amount: n, _reason: reason });
    setBusy(false);
    if (error) { toast.error(errorText(error)); return; }
    toast.success("تم تسجيل التسبيق");
    setWho("");
    setAmount("");
    setReason("");
    onOpenChange(false);
    onDone();
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-right sm:text-right">
          <DialogTitle>تسبيق جديد</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>العامل</Label>
            <Select value={who} onValueChange={setWho}>
              <SelectTrigger className="h-11"><SelectValue placeholder="اختر العامل" /></SelectTrigger>
              <SelectContent>
                {team.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="adv-amount">المبلغ (DA)</Label>
            <Input id="adv-amount" type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="adv-reason">السبب</Label>
            <Input id="adv-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثلا: مصاريف نقل" />
          </div>
          <Button className="w-full" disabled={busy} onClick={() => void save()}>حفظ التسبيق</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
