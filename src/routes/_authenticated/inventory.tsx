import { Suspense, useState } from "react";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { ClipboardList, Play, Square } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader } from "@/components/stat-card";
import { DashboardSkeleton, SessionView } from "@/components/session-view";
import { activeSessionQuery, sessionsQuery, teamQuery } from "@/lib/queries";
import { errorText, formatDateTime } from "@/lib/messages";

export const Route = createFileRoute("/_authenticated/inventory")({
  beforeLoad: ({ context }) => {
    if (!context.me.canWatchInventory || !context.me.tenant) throw redirect({ to: context.me.homePath });
    return { tenant: context.me.tenant, isManager: context.me.isManager };
  },
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(activeSessionQuery(context.tenant.id)),
      context.queryClient.ensureQueryData(sessionsQuery(context.tenant.id)),
      context.queryClient.ensureQueryData(teamQuery(context.tenant.id)),
    ]);
  },
  head: () => ({ meta: [{ title: "لوحة الجرد | SMART STOCK" }] }),
  component: InventoryPage,
});

function InventoryPage() {
  const { tenant, isManager } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const { data: active } = useSuspenseQuery(activeSessionQuery(tenant.id));
  const { data: sessions } = useSuspenseQuery(sessionsQuery(tenant.id));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [closing, setClosing] = useState(false);

  const sessionId = selectedId ?? active?.id ?? sessions[0]?.id ?? null;
  const session = sessions.find((s) => s.id === sessionId) ?? active ?? null;

  const refreshSessions = () => {
    void queryClient.invalidateQueries({ queryKey: ["active-session", tenant.id] });
    void queryClient.invalidateQueries({ queryKey: ["sessions", tenant.id] });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="لوحة الجرد"
        subtitle={
          session ? (
            <span className="flex flex-wrap items-center gap-2">
              {session.status === "active" ? (
                <span className="flex items-center gap-1.5 rounded-full bg-success/15 px-2 py-0.5 text-xs font-bold text-success">
                  <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-success" />
                  جلسة مفتوحة
                </span>
              ) : (
                <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-bold">
                  جلسة مغلقة
                </span>
              )}
              بدأت {formatDateTime(session.started_at)}
            </span>
          ) : (
            "لا توجد جلسات جرد بعد"
          )
        }
        actions={
          <>
            {sessions.length > 0 && (
              <Select value={sessionId ?? ""} onValueChange={setSelectedId}>
                <SelectTrigger className="h-9 w-56 bg-card">
                  <SelectValue placeholder="اختر جلسة" />
                </SelectTrigger>
                <SelectContent>
                  {sessions.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} {s.status === "active" ? "• مفتوحة" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {!isManager ? null : active ? (
              <Button variant="outline" onClick={() => setClosing(true)}>
                <Square />
                إغلاق الجلسة
              </Button>
            ) : (
              <Button onClick={() => setStarting(true)}>
                <Play />
                بدء جلسة جرد
              </Button>
            )}
          </>
        }
      />

      {!session ? (
        <div className="surface-card bg-ledger flex flex-col items-center gap-3 p-12 text-center">
          <ClipboardList className="h-10 w-10 text-primary" />
          <p className="text-lg font-extrabold">ابدأ أول جلسة جرد</p>
          <p className="max-w-md text-sm text-muted-foreground">
            عند البداية، تُجمَّد الكميات النظامية لكل المنتجات. الفوارق تُحسب مقابل هذه النسخة طوال
            الجلسة.
          </p>
          <div className={isManager ? "flex gap-2" : "hidden"}>
            <Button onClick={() => setStarting(true)}>
              <Play />
              بدء جلسة جرد
            </Button>
            <Button variant="outline" asChild>
              <Link to="/products">استيراد المنتجات أولاً</Link>
            </Button>
          </div>
        </div>
      ) : (
        <Suspense fallback={<DashboardSkeleton />}>
          <SessionView session={session} tenantId={tenant.id} storeName={tenant.name} readOnly={!isManager} />
        </Suspense>
      )}

      <StartSessionDialog
        open={starting}
        onOpenChange={setStarting}
        onStarted={(id) => {
          setSelectedId(id);
          refreshSessions();
        }}
      />

      <AlertDialog open={closing} onOpenChange={setClosing}>
        <AlertDialogContent>
          <AlertDialogHeader className="text-right sm:text-right">
            <AlertDialogTitle>إغلاق جلسة الجرد؟</AlertDialogTitle>
            <AlertDialogDescription>
              لن يستطيع العمال إضافة أو تعديل العدّ في هذه الجلسة بعد الإغلاق. تبقى النتائج متاحة
              للعرض والتصدير.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:justify-start">
            <AlertDialogAction
              onClick={async (e) => {
                e.preventDefault();
                if (!active) return;
                const { error } = await supabase.rpc("close_inventory_session", {
                  _session_id: active.id,
                });
                if (error) toast.error(errorText(error));
                else toast.success("تم إغلاق الجلسة");
                refreshSessions();
              }}
            >
              إغلاق الجلسة
            </AlertDialogAction>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StartSessionDialog({
  open,
  onOpenChange,
  onStarted,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onStarted: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-right sm:text-right">
          <DialogTitle>جلسة جرد جديدة</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setLoading(true);
            const { data, error } = await supabase.rpc("start_inventory_session", { _name: name });
            setLoading(false);
            if (error || !data) return void toast.error(errorText(error));
            toast.success("بدأت الجلسة. يمكن للعمال المسح الآن.");
            onOpenChange(false);
            setName("");
            onStarted(data);
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="session-name">اسم الجلسة</Label>
            <Input
              id="session-name"
              placeholder={`جرد ${new Date().toLocaleDateString("fr-FR")}`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-11"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            سيتم نسخ الكميات النظامية الحالية لكل المنتجات كمرجع ثابت لهذه الجلسة.
          </p>
          <Button type="submit" size="lg" className="w-full" disabled={loading}>
            {loading ? "جاري البدء..." : "بدء الجلسة"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
