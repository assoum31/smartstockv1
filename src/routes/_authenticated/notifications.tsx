import { useEffect, useMemo, useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Bell, MapPin, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/stat-card";
import { useLiveNotes, useSeenAt } from "@/lib/notifications";
import { formatDateTime, formatQty } from "@/lib/messages";

export const Route = createFileRoute("/_authenticated/notifications")({
  beforeLoad: ({ context }) => {
    if (!context.me.isManager || !context.me.tenant) throw redirect({ to: context.me.homePath });
    return { tenant: context.me.tenant };
  },
  head: () => ({ meta: [{ title: "التنبيهات | SMART STOCK" }] }),
  component: NotificationsPage,
});

function NotificationsPage() {
  const { tenant } = Route.useRouteContext();
  const { data = [], isLoading } = useLiveNotes(tenant.id);
  const { seenAt, markSeen } = useSeenAt();
  const [lastSeen, setLastSeen] = useState<string | null>(null);
  const [q, setQ] = useState("");

  // Remember what was new on arrival, then mark everything as read
  useEffect(() => {
    if (lastSeen === null && seenAt !== undefined) {
      setLastSeen(localStorage.getItem("smartstock_notes_seen_at") ?? "");
      markSeen();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return data;
    return data.filter((n) =>
      [n.notes, n.product_name, n.barcode, n.counted_by_name, n.location]
        .some((v) => (v ?? "").toLowerCase().includes(s)),
    );
  }, [data, q]);

  return (
    <div className="space-y-5">
      <PageHeader title="التنبيهات" subtitle="ملاحظات فريق الجرد أثناء المسح، تصل مباشرة." />
      <div className="relative">
        <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="ابحث بالعامل، المنتج، الملاحظة..." value={q} onChange={(e) => setQ(e.target.value)} className="h-11 bg-card ps-9" />
      </div>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">جارٍ التحميل...</p>
      ) : list.length === 0 ? (
        <div className="surface-card flex flex-col items-center gap-3 p-12 text-center">
          <Bell className="h-10 w-10 text-muted-foreground" />
          <p className="font-bold">لا توجد تنبيهات</p>
        </div>
      ) : (
        <div className="space-y-2">
          {list.map((n) => {
            const isNew = lastSeen !== null && n.counted_at > lastSeen;
            return (
              <div key={n.id} className={`surface-card p-4 ${isNew ? "border-s-4 border-s-destructive" : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  <p className="font-extrabold">{n.notes}</p>
                  {isNew && <span className="rounded bg-destructive px-1.5 py-0.5 text-[10px] font-bold text-destructive-foreground">جديد</span>}
                </div>
                <p className="mt-1 text-sm">
                  {n.product_name} · <span className="barcode-chip text-xs">{n.barcode}</span> · ×{formatQty(Number(n.counted_quantity))}
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3" />{n.location || "—"} · {n.counted_by_name} · {formatDateTime(n.counted_at)}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
