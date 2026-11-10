import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import {
  Activity,
  Check,
  Download,
  Edit3,
  MapPin,
  PackageCheck,
  PackageX,
  ScanLine,
  Scale,
  Search,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { StatCard } from "@/components/stat-card";
import { WorkerProgress } from "@/components/worker-progress";
import { SalesPanel, useSalesTickets } from "@/components/sales-panel";
import { computeVariances, type VarianceRow } from "@/lib/inventory-rules";
import {
  sessionLogsQuery,
  snapshotQuery,
  type InventoryLog,
  type InventorySession,
} from "@/lib/queries";
import { downloadWorkbook } from "@/lib/excel";
import { errorText, formatDateTime, formatQty } from "@/lib/messages";
import { cn } from "@/lib/utils";

export function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-96 rounded-xl" />
    </div>
  );
}

type VarianceFilter = "all" | "gaps" | "missing" | "surplus" | "uncounted";

/**
 * One inventory session: totals, variance per product, worker progress and the count log.
 * `readOnly` is for the master, who watches stores without changing their counts.
 */
export function SessionView({
  session,
  tenantId,
  readOnly = false,
  storeName = "SMART STOCK",
}: {
  session: InventorySession;
  tenantId: string;
  readOnly?: boolean;
  storeName?: string;
}) {
  const queryClient = useQueryClient();
  const { data: logs } = useSuspenseQuery(sessionLogsQuery(session.id));
  const { data: snapshot } = useSuspenseQuery(snapshotQuery(session.id));
  const isActive = session.status === "active";

  // Live updates while the session is open
  useEffect(() => {
    if (!isActive) return;
    const channel = supabase
      .channel(`logs-${session.id}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "inventory_logs",
          filter: `session_id=eq.${session.id}`,
        },
        () => void queryClient.invalidateQueries({ queryKey: ["session-logs", session.id] }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [isActive, session.id, queryClient]);

  const sales = useSalesTickets(session);
  const variances = useMemo(
    () =>
      computeVariances(
        snapshot,
        logs,
        sales.items.map((i) => ({
          ...i,
          quantity: Number(i.quantity),
          sold_at: sales.tickets.find((t) => t.id === i.ticket_id)?.created_at ?? null,
        })),
      ),
    [snapshot, logs, sales.items, sales.tickets],
  );
  const workers = useMemo(() => new Set(logs.map((l) => l.counted_by_name)).size, [logs]);
  const totalQty = logs.reduce((n, l) => n + Number(l.counted_quantity || 0), 0);
  const gaps = variances.filter((v) => v.variance !== 0 && v.entries > 0).length;
  const uncounted = variances.filter((v) => v.in_snapshot && v.entries === 0).length;
  const counted = variances.filter((v) => v.entries > 0).length;

  const exportExcel = () => {
    void downloadWorkbook(`stocki_${session.name.replace(/\s+/g, "_")}.xlsx`, [
      {
        name: "Ecarts",
        headers: [
          "Barcode",
          "Article",
          "Stock système",
          "Vendu",
          "Vendu après comptage",
          "Stock attendu",
          "Compté",
          "Écart",
          "Lignes",
          "Emplacements",
        ],
        rows: variances.map((v) => [
          v.barcode,
          v.product_name,
          v.system_quantity,
          v.sold_quantity,
          v.deducted_quantity,
          v.expected_quantity,
          v.counted_quantity,
          v.variance,
          v.entries,
          v.locations.join(" | "),
        ]),
        textColumns: [0],
      },
      {
        name: "Comptages",
        headers: ["Barcode", "Article", "Quantité", "Emplacement", "Note", "Compté par", "Date"],
        rows: logs.map((l) => [
          l.barcode,
          l.product_name,
          Number(l.counted_quantity),
          l.location ?? "",
          l.notes ?? "",
          l.counted_by_name,
          new Date(l.counted_at).toLocaleString("fr-FR"),
        ]),
        textColumns: [0],
      },
      {
        name: "Ventes",
        headers: ["Bon", "Date", "Vendeur", "Barcode", "Article", "Quantité", "Prix", "Total"],
        rows: sales.items.map((i) => {
          const t = sales.tickets.find((x) => x.id === i.ticket_id);
          return [
            t?.ticket_number ?? "",
            t ? new Date(t.created_at).toLocaleString("fr-FR") : "",
            t?.created_by_name ?? "",
            i.barcode,
            i.product_name,
            Number(i.quantity),
            Number(i.unit_price),
            Number(i.quantity) * Number(i.unit_price),
          ];
        }),
        textColumns: [3],
      },
    ]);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="المنتجات المحسوبة"
          value={counted}
          hint={`${logs.length} أسطر - ${formatQty(totalQty)} قطعة`}
          icon={PackageCheck}
          tone="primary"
        />
        <StatCard
          label="منتجات بفارق"
          value={gaps}
          hint="من بين المنتجات المحسوبة"
          icon={Scale}
          tone="warning"
        />
        <StatCard
          label="لم تُحسب بعد"
          value={uncounted}
          hint={`من ${snapshot.length} في الكتالوج`}
          icon={PackageX}
          tone="destructive"
        />
        <StatCard label="القائمون بالجرد" value={workers} icon={Users} />
      </div>

      <Tabs defaultValue="variances" dir="rtl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="variances">الفوارق لكل منتج</TabsTrigger>
            <TabsTrigger value="sales">المبيعات ({sales.tickets.length})</TabsTrigger>
            <TabsTrigger value="workers">تقدم العمال</TabsTrigger>
            <TabsTrigger value="logs">سجل العدّ</TabsTrigger>
            <TabsTrigger value="alerts">
              التنبيهات
              {logs.filter((l) => l.notes?.trim()).length > 0 && (
                <span className="ms-1.5 rounded-full bg-destructive px-1.5 text-[10px] font-bold text-destructive-foreground">
                  {logs.filter((l) => l.notes?.trim()).length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
          <div className="flex gap-2">
            {isActive && !readOnly && (
              <Button variant="outline" size="sm" asChild>
                <Link to="/scan">
                  <ScanLine />
                  السكان
                </Link>
              </Button>
            )}
            <Button variant="success" size="sm" onClick={exportExcel}>
              <Download />
              تصدير Excel
            </Button>
          </div>
        </div>
        <TabsContent value="variances" className="mt-4">
          <VarianceTable rows={variances} editable={isActive && !readOnly} sessionId={session.id} />
        </TabsContent>
        <TabsContent value="sales" className="mt-4">
          <SalesPanel
            session={session}
            snapshot={snapshot}
            storeName={storeName}
            tickets={sales.tickets}
            items={sales.items}
            canSell={isActive && !readOnly}
          />
        </TabsContent>
        <TabsContent value="workers" className="mt-4">
          <WorkerProgress tenantId={tenantId} logs={logs} live={isActive} />
        </TabsContent>
        <TabsContent value="logs" className="mt-4">
          <LogsTable logs={logs} editable={isActive && !readOnly} sessionId={session.id} />
        </TabsContent>
        <TabsContent value="alerts" className="mt-4">
          <div className="space-y-2">
            {logs.filter((l) => l.notes?.trim()).length === 0 ? (
              <p className="surface-card p-8 text-center text-sm text-muted-foreground">
                لا توجد ملاحظات من فريق الجرد بعد.
              </p>
            ) : (
              [...logs]
                .filter((l) => l.notes?.trim())
                .sort((a, b) => b.counted_at.localeCompare(a.counted_at))
                .map((l) => (
                  <div key={l.id} className="surface-card border-s-4 border-warning p-4">
                    <p className="font-bold">{l.notes}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {l.product_name} · <span className="barcode-chip">{l.barcode}</span> · الكمية{" "}
                      {formatQty(Number(l.counted_quantity))} · {l.location || "—"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {l.counted_by_name} · {formatDateTime(l.counted_at)}
                    </p>
                  </div>
                ))
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

const FILTERS: { value: VarianceFilter; label: string }[] = [
  { value: "gaps", label: "بفارق" },
  { value: "missing", label: "ناقص" },
  { value: "surplus", label: "زائد" },
  { value: "uncounted", label: "غير محسوب" },
  { value: "all", label: "الكل" },
];

function VarianceTable({
  rows,
  editable,
  sessionId,
}: {
  rows: VarianceRow[];
  editable: boolean;
  sessionId: string;
}) {
  const queryClient = useQueryClient();
  const [removing, setRemoving] = useState<VarianceRow | null>(null);
  const [filter, setFilter] = useState<VarianceFilter>("gaps");
  const [search, setSearch] = useState("");
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter((r) => {
        if (filter === "gaps") return r.variance !== 0;
        if (filter === "missing") return r.variance < 0;
        if (filter === "surplus") return r.variance > 0;
        if (filter === "uncounted") return r.in_snapshot && r.entries === 0;
        return true;
      })
      .filter(
        (r) =>
          !q || r.barcode.toLowerCase().includes(q) || r.product_name.toLowerCase().includes(q),
      )
      .slice(0, 300);
  }, [rows, filter, search]);

  return (
    <div className="surface-card overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b p-3">
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-bold transition-colors",
                filter === f.value
                  ? "bg-ink text-ink-foreground"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative ms-auto w-full sm:w-64">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="بحث..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 ps-9"
          />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-start font-bold">المنتج</th>
              <th className="px-4 py-3 text-start font-bold">المواقع</th>
              <th className="px-4 py-3 text-end font-bold">المخزون الأولي</th>
              <th className="px-4 py-3 text-end font-bold">المبيعات</th>
              <th className="px-4 py-3 text-end font-bold">المتوقع</th>
              <th className="px-4 py-3 text-end font-bold">المحسوب</th>
              <th className="px-4 py-3 text-end font-bold">الفارق (المحسوب − المبيعات)</th>
              {editable && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody className="divide-y">
            {shown.length === 0 && (
              <tr>
                <td colSpan={8} className="p-10 text-center text-muted-foreground">
                  لا توجد منتجات في هذا التصنيف.
                </td>
              </tr>
            )}
            {shown.map((r) => (
              <tr key={r.barcode} className="hover:bg-muted/40">
                <td className="px-4 py-3">
                  <p className="font-bold">{r.product_name}</p>
                  <p className="barcode-chip text-xs text-muted-foreground">
                    {r.barcode}
                    {!r.in_snapshot && (
                      <span className="ms-2 font-sans text-warning-foreground">
                        · خارج الكتالوج
                      </span>
                    )}
                  </p>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {r.locations.length ? r.locations.join("، ") : "—"}
                  {r.entries > 1 && <span className="ms-1 font-mono">({r.entries} أسطر)</span>}
                </td>
                <td className="px-4 py-3 text-end font-mono">{formatQty(r.system_quantity)}</td>
                <td className="px-4 py-3 text-end font-mono text-muted-foreground">
                  {r.sold_quantity ? (
                    <>
                      <span className="font-bold text-foreground">
                        {r.deducted_quantity ? `−${formatQty(r.deducted_quantity)}` : "0"}
                      </span>
                      {r.deducted_quantity !== r.sold_quantity && (
                        <span className="block text-[10px]">
                          {r.entries === 0
                            ? `بيع ${formatQty(r.sold_quantity)} · غير محسوب`
                            : `بيع ${formatQty(r.sold_quantity)} · قبل العدّ لا يُخصم`}
                        </span>
                      )}
                    </>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-3 text-end font-mono">{formatQty(r.expected_quantity)}</td>
                <td className="px-4 py-3 text-end font-mono font-bold">
                  {formatQty(r.counted_quantity)}
                </td>
                <td className="px-4 py-3 text-end">
                  <span
                    className={cn(
                      "inline-block min-w-14 rounded-lg px-2 py-1 text-center font-mono text-sm font-bold",
                      r.variance === 0 && "bg-success/15 text-success",
                      r.variance < 0 && "bg-destructive/10 text-destructive",
                      r.variance > 0 && "bg-warning/25 text-warning-foreground",
                    )}
                    dir="ltr"
                  >
                    {r.variance > 0 ? "+" : ""}
                    {formatQty(r.variance)}
                  </span>
                </td>
                {editable && (
                  <td className="px-2 py-3">
                    {r.entries > 0 && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 hover:text-destructive"
                        aria-label="حذف عدّ المنتج"
                        onClick={() => setRemoving(r)}
                      >
                        <Trash2 />
                      </Button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AlertDialog open={Boolean(removing)} onOpenChange={(o) => !o && setRemoving(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader className="text-right sm:text-right">
            <AlertDialogTitle>حذف عدّ هذا المنتج من الجرد؟</AlertDialogTitle>
            <AlertDialogDescription>
              {removing?.product_name} — تُحذف كل أسطر العدّ ({removing?.entries}) لهذا المنتج في
              هذه الجلسة.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:justify-start">
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async (e) => {
                e.preventDefault();
                if (!removing) return;
                const { error } = await supabase
                  .from("inventory_logs")
                  .delete()
                  .eq("session_id", sessionId)
                  .eq("barcode", removing.barcode);
                if (error) toast.error(errorText(error));
                else toast.success("تم الحذف");
                setRemoving(null);
                void queryClient.invalidateQueries({ queryKey: ["session-logs", sessionId] });
              }}
            >
              حذف
            </AlertDialogAction>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function LogsTable({
  logs,
  editable,
  sessionId,
}: {
  logs: InventoryLog[];
  editable: boolean;
  sessionId: string;
}) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [worker, setWorker] = useState("all");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: "", qty: "", location: "", notes: "" });
  const [deleting, setDeleting] = useState<InventoryLog | null>(null);
  const workers = useMemo(() => Array.from(new Set(logs.map((l) => l.counted_by_name))), [logs]);
  const refresh = () =>
    void queryClient.invalidateQueries({ queryKey: ["session-logs", sessionId] });

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return logs
      .filter((l) => worker === "all" || l.counted_by_name === worker)
      .filter(
        (l) =>
          !q || l.barcode.toLowerCase().includes(q) || l.product_name.toLowerCase().includes(q),
      )
      .slice(0, 300);
  }, [logs, search, worker]);

  const save = async (id: string) => {
    const qty = Number(draft.qty.replace(",", "."));
    if (!Number.isFinite(qty) || qty < 0) return void toast.error("كمية غير صالحة");
    const { error } = await supabase
      .from("inventory_logs")
      .update({
        product_name: draft.name.trim(),
        counted_quantity: qty,
        location: draft.location.trim() || null,
        notes: draft.notes.trim() || null,
      })
      .eq("id", id);
    if (error) return void toast.error(errorText(error));
    setEditing(null);
    refresh();
  };

  return (
    <div className="surface-card overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b p-3">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="بحث..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 ps-9"
          />
        </div>
        <Select value={worker} onValueChange={setWorker} dir="rtl">
          <SelectTrigger className="h-9 w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل العمال ({workers.length})</SelectItem>
            {workers.map((w) => (
              <SelectItem key={w} value={w}>
                {w}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-start font-bold">المنتج</th>
              <th className="px-4 py-3 text-end font-bold">الكمية</th>
              <th className="px-4 py-3 text-start font-bold">الموقع</th>
              <th className="px-4 py-3 text-start font-bold">ملاحظة</th>
              <th className="px-4 py-3 text-start font-bold">بواسطة</th>
              <th className="px-4 py-3 text-start font-bold">الوقت</th>
              {editable && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody className="divide-y">
            {shown.length === 0 && (
              <tr>
                <td colSpan={7} className="p-10 text-center text-muted-foreground">
                  لا توجد أسطر عدّ بعد.
                </td>
              </tr>
            )}
            {shown.map((l) =>
              editing === l.id ? (
                <tr key={l.id} className="bg-accent/40">
                  <td className="px-4 py-2">
                    <Input
                      value={draft.name}
                      onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                      className="h-9"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <Input
                      inputMode="decimal"
                      value={draft.qty}
                      onChange={(e) => setDraft({ ...draft, qty: e.target.value })}
                      className="h-9 w-24 text-center font-mono"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <Input
                      value={draft.location}
                      onChange={(e) => setDraft({ ...draft, location: e.target.value })}
                      className="h-9"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <Input
                      value={draft.notes}
                      placeholder="اختياري"
                      onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                      className="h-9"
                    />
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{l.counted_by_name}</td>
                  <td className="px-4 py-2" />
                  <td className="px-4 py-2">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="icon"
                        variant="success"
                        className="h-8 w-8"
                        onClick={() => save(l.id)}
                        aria-label="حفظ"
                      >
                        <Check />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => setEditing(null)}
                        aria-label="إلغاء"
                      >
                        <X />
                      </Button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={l.id} className="hover:bg-muted/40">
                  <td className="px-4 py-3">
                    <p className="font-bold">{l.product_name}</p>
                    <p className="barcode-chip text-xs text-muted-foreground">{l.barcode}</p>
                  </td>
                  <td className="px-4 py-3 text-end font-mono font-bold">
                    {formatQty(Number(l.counted_quantity))}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3" />
                      {l.location || "—"}
                    </span>
                  </td>
                  <td className="max-w-48 px-4 py-3 text-xs text-muted-foreground">
                    {l.notes || "—"}
                  </td>
                  <td className="px-4 py-3 font-medium">{l.counted_by_name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {formatDateTime(l.counted_at)}
                  </td>
                  {editable && (
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          aria-label="تعديل"
                          onClick={() => {
                            setEditing(l.id);
                            setDraft({
                              name: l.product_name,
                              qty: String(l.counted_quantity),
                              location: l.location ?? "",
                              notes: l.notes ?? "",
                            });
                          }}
                        >
                          <Edit3 />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 hover:text-destructive"
                          aria-label="حذف"
                          onClick={() => setDeleting(l)}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>

      <AlertDialog open={Boolean(deleting)} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader className="text-right sm:text-right">
            <AlertDialogTitle>حذف سطر العدّ؟</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting?.product_name} —{" "}
              {deleting ? formatQty(Number(deleting.counted_quantity)) : ""} (
              {deleting?.counted_by_name})
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:justify-start">
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async (e) => {
                e.preventDefault();
                if (!deleting) return;
                const { error } = await supabase
                  .from("inventory_logs")
                  .delete()
                  .eq("id", deleting.id);
                if (error) toast.error(errorText(error));
                setDeleting(null);
                refresh();
              }}
            >
              حذف
            </AlertDialogAction>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
