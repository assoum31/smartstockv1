import { useMemo, useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { CheckCircle2, Search, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/stat-card";
import { activeSessionQuery, sessionLogsQuery, type InventoryLog } from "@/lib/queries";
import { errorText, formatDateTime, formatQty } from "@/lib/messages";

export const Route = createFileRoute("/_authenticated/audit")({
  beforeLoad: ({ context }) => {
    if (!context.me.canAudit || !context.me.tenant) throw redirect({ to: context.me.homePath });
    return { tenant: context.me.tenant, userId: context.me.userId };
  },
  loader: async ({ context }) => {
    const active = await context.queryClient.ensureQueryData(activeSessionQuery(context.tenant.id));
    await context.queryClient.ensureQueryData(sessionLogsQuery(active?.id ?? null));
  },
  head: () => ({
    meta: [
      { title: "تدقيق الجرد | SMART STOCK" },
      { name: "description", content: "تدقيق الباركود والاسم والرقم ومكان الرف لكل منتج محسوب." },
    ],
  }),
  component: AuditPage,
});

function AuditPage() {
  const { tenant, userId } = Route.useRouteContext();
  const qc = useQueryClient();
  const { data: active } = useSuspenseQuery(activeSessionQuery(tenant.id));
  const { data: logs } = useSuspenseQuery(sessionLogsQuery(active?.id ?? null));
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<InventoryLog | null>(null);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return logs;
    return logs.filter(
      (l) =>
        l.barcode.toLowerCase().includes(s) ||
        l.product_name.toLowerCase().includes(s) ||
        (l.audit_code ?? "").includes(s) ||
        (l.location ?? "").toLowerCase().includes(s),
    );
  }, [logs, q]);
  const mine = useMemo(
    () =>
      logs
        .filter((l) => l.audited_by === userId)
        .sort((a, b) => (b.audited_at ?? "").localeCompare(a.audited_at ?? "")),
    [logs, userId],
  );
  const done = logs.filter((l) => l.audited_at).length;
  const refresh = () => void qc.invalidateQueries({ queryKey: ["session-logs", active?.id ?? null] });

  if (!active)
    return (
      <div className="space-y-6">
        <PageHeader title="تدقيق الجرد" subtitle="لا توجد جلسة جرد مفتوحة" />
        <div className="surface-card p-10 text-center text-muted-foreground">انتظر حتى يفتح المسير جلسة جرد.</div>
      </div>
    );

  return (
    <div className="space-y-5">
      <PageHeader title="تدقيق الجرد" subtitle={`${active.name} · تم تدقيق ${done} من ${logs.length}`} />
      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">المنتجات المحسوبة</TabsTrigger>
          <TabsTrigger value="mine">سجلي ({mine.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="all" className="mt-4 space-y-3">
          <div className="relative">
            <Search className="absolute start-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ابحث بالباركود، الاسم، الرقم ID أو الرف"
              className="h-11 ps-9"
            />
          </div>
          <LogList logs={filtered} onPick={setEdit} />
        </TabsContent>
        <TabsContent value="mine" className="mt-4">
          <LogList logs={mine} onPick={setEdit} showAudit />
        </TabsContent>
      </Tabs>
      {edit && (
        <AuditDialog
          log={edit}
          sessionId={active.id}
          onClose={() => setEdit(null)}
          onSaved={() => {
            setEdit(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function LogList({ logs, onPick, showAudit }: { logs: InventoryLog[]; onPick: (l: InventoryLog) => void; showAudit?: boolean }) {
  if (!logs.length) return <div className="surface-card p-8 text-center text-sm text-muted-foreground">لا توجد نتائج</div>;
  return (
    <ul className="space-y-2">
      {logs.slice(0, 300).map((l) => (
        <li key={l.id}>
          <button type="button" onClick={() => onPick(l)} className="surface-card flex w-full items-center gap-3 p-3 text-start hover:bg-secondary/50">
            <span className="barcode-chip min-w-14 rounded-md bg-secondary px-2 py-1 text-center text-xs font-bold">
              {l.audit_code ?? "----"}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-bold">{l.product_name}</span>
              <span className="barcode-chip block truncate text-xs text-muted-foreground" dir="ltr">
                {l.barcode}
              </span>
              <span className="block text-xs text-muted-foreground">
                الرف: {l.location || "—"} · الكمية: {formatQty(Number(l.counted_quantity))}
                {showAudit && l.audited_at ? ` · ${formatDateTime(l.audited_at)}` : ""}
              </span>
            </span>
            {l.audited_at && <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />}
          </button>
        </li>
      ))}
    </ul>
  );
}

function AuditDialog({ log, sessionId, onClose, onSaved }: { log: InventoryLog; sessionId: string; onClose: () => void; onSaved: () => void }) {
  const [code, setCode] = useState(log.audit_code ?? "");
  const [barcode, setBarcode] = useState(log.barcode);
  const [name, setName] = useState(log.product_name);
  const [location, setLocation] = useState(log.location ?? "");
  const [editQty, setEditQty] = useState(false);
  const [qty, setQty] = useState(String(log.counted_quantity));
  const [busy, setBusy] = useState(false);

  const nextCode = async () => {
    const { data, error } = await supabase.rpc("next_audit_code", { _session_id: sessionId });
    if (error) toast.error(errorText(error));
    else setCode(String(data ?? ""));
  };

  const save = async () => {
    const n = Number(qty);
    if (editQty && (!Number.isFinite(n) || n < 0)) return toast.error("كمية غير صالحة");
    setBusy(true);
    const { error } = await supabase.rpc("audit_inventory_log", {
      _log_id: log.id,
      _code: code,
      _barcode: barcode,
      _name: name,
      _location: location,
      _qty: (editQty ? n : null) as number,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message.includes("duplicate_audit_code") ? "هذا الرقم ID مستعمل لمنتج آخر" : errorText(error));
      return;
    }
    toast.success("تم التدقيق");
    onSaved();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-right sm:text-right">
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            تدقيق المنتج
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="a-code">الرقم ID (اختياري)</Label>
            <div className="flex gap-2">
              <Input id="a-code" dir="ltr" value={code} onChange={(e) => setCode(e.target.value)} placeholder="0001" className="barcode-chip" />
              <Button type="button" variant="outline" onClick={() => void nextCode()}>
                الرقم التالي
              </Button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="a-bc">الباركود</Label>
            <Input id="a-bc" dir="ltr" value={barcode} onChange={(e) => setBarcode(e.target.value)} className="barcode-chip" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="a-name">اسم المنتج</Label>
            <Input id="a-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="a-loc">المكان في المخزن (مثلا رف A1)</Label>
            <Input id="a-loc" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="A1" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={editQty} onCheckedChange={(v) => setEditQty(v === true)} />
            تعديل الكمية
          </label>
          {editQty && (
            <Input type="number" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
          )}
          <Button className="w-full" disabled={busy} onClick={() => void save()}>
            حفظ التدقيق
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
