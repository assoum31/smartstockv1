import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Clock, Users } from "lucide-react";
import { teamQuery, type InventoryLog } from "@/lib/queries";
import { ACTIVE_WINDOW_MINUTES, workerProgress } from "@/lib/inventory-rules";
import { formatDateTime, formatQty } from "@/lib/messages";
import { cn } from "@/lib/utils";

/** Who counted what in this session, and who is scanning right now. */
export function WorkerProgress({
  tenantId,
  logs,
  live,
}: {
  tenantId: string;
  logs: InventoryLog[];
  live: boolean;
}) {
  const { data: team = [] } = useQuery(teamQuery(tenantId));
  const rows = useMemo(
    () =>
      workerProgress(
        logs,
        team.filter((m) => m.is_active && !m.roles.includes("master")),
      ),
    [logs, team],
  );
  const maxLines = Math.max(1, ...rows.map((r) => r.lines));
  const started = rows.filter((r) => r.lines > 0).length;

  return (
    <div className="surface-card overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b p-3 text-sm">
        <Users className="h-4 w-4 text-muted-foreground" />
        <span className="font-bold">
          {started} من {rows.length} بدأوا العدّ
        </span>
        {live && (
          <span className="ms-auto text-xs text-muted-foreground">
            "يعمل الآن" = مسح خلال آخر {ACTIVE_WINDOW_MINUTES} دقائق
          </span>
        )}
      </div>
      {rows.length === 0 && (
        <p className="p-10 text-center text-sm text-muted-foreground">
          لا يوجد عمال في هذا المتجر.
        </p>
      )}
      <ul className="divide-y">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary font-bold">
              {r.name.charAt(0)}
            </span>
            <div className="min-w-0 flex-1 basis-40">
              <p className="flex items-center gap-2 font-bold">
                {r.name}
                {live && r.active && (
                  <span className="flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-bold text-success">
                    <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-success" />
                    يعمل الآن
                  </span>
                )}
                {r.lines === 0 && (
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                    لم يبدأ
                  </span>
                )}
              </p>
              <div className="mt-1.5 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full",
                    r.active && live ? "bg-success" : "bg-primary",
                  )}
                  style={{ width: `${(r.lines / maxLines) * 100}%` }}
                />
              </div>
            </div>
            <dl className="flex gap-5 text-center">
              <div>
                <dt className="text-[10px] font-bold text-muted-foreground">أسطر</dt>
                <dd className="font-mono font-bold">{r.lines}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-bold text-muted-foreground">منتجات</dt>
                <dd className="font-mono font-bold">{r.products}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-bold text-muted-foreground">قطع</dt>
                <dd className="font-mono font-bold">{formatQty(r.quantity)}</dd>
              </div>
            </dl>
            <p className="flex w-full items-center gap-1 text-[11px] text-muted-foreground sm:w-auto">
              <Clock className="h-3 w-3" />
              {r.lastScanAt ? formatDateTime(r.lastScanAt) : "—"}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
