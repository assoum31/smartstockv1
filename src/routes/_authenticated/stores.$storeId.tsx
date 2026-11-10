import { Suspense, useState } from "react";
import { createFileRoute, Link, notFound, redirect } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ArrowRight, ClipboardList, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/stat-card";
import { DashboardSkeleton, SessionView } from "@/components/session-view";
import { sessionsQuery, teamQuery } from "@/lib/queries";
import { formatDateTime } from "@/lib/messages";

// The master watches any store's inventory, read-only.
export const Route = createFileRoute("/_authenticated/stores/$storeId")({
  beforeLoad: ({ context }) => {
    if (!context.me.isMaster) throw redirect({ to: context.me.homePath });
  },
  loader: async ({ context, params }) => {
    const { data: store } = await supabase
      .from("tenants")
      .select("id, code, name, is_active")
      .eq("id", params.storeId)
      .maybeSingle();
    if (!store) throw notFound();
    await Promise.all([
      context.queryClient.ensureQueryData(sessionsQuery(store.id)),
      context.queryClient.ensureQueryData(teamQuery(store.id)),
    ]);
    return { store };
  },
  head: ({ loaderData }) => ({
    meta: [{ title: loaderData ? `${loaderData.store.name} | SMART STOCK` : "متجر | SMART STOCK" }],
  }),
  notFoundComponent: () => (
    <div className="surface-card p-10 text-center">
      <p className="font-bold">هذا المتجر غير موجود.</p>
      <Button asChild variant="outline" className="mt-4">
        <Link to="/admin">العودة للمتاجر</Link>
      </Button>
    </div>
  ),
  component: StoreInventoryPage,
});

function StoreInventoryPage() {
  const { store } = Route.useLoaderData();
  const { data: sessions } = useSuspenseQuery(sessionsQuery(store.id));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const session =
    sessions.find((s) => s.id === selectedId) ??
    sessions.find((s) => s.status === "active") ??
    sessions[0] ??
    null;

  return (
    <div className="space-y-6">
      <Link
        to="/admin"
        className="inline-flex items-center gap-1 text-sm font-bold text-muted-foreground hover:text-foreground"
      >
        <ArrowRight className="h-4 w-4" />
        كل المتاجر
      </Link>
      <PageHeader
        title={store.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs font-bold">
              <Eye className="h-3 w-3" />
              عرض فقط
            </span>
            <span className="barcode-chip">{store.code}</span>
            {session &&
              (session.status === "active" ? "جلسة مفتوحة" : "جلسة مغلقة") +
                " · بدأت " +
                formatDateTime(session.started_at)}
          </span>
        }
        actions={
          sessions.length > 0 && (
            <Select value={session?.id ?? ""} onValueChange={setSelectedId} dir="rtl">
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
          )
        }
      />
      {!session ? (
        <div className="surface-card flex flex-col items-center gap-3 p-12 text-center">
          <ClipboardList className="h-10 w-10 text-muted-foreground" />
          <p className="font-bold">لم يبدأ مسير هذا المتجر أي جلسة جرد بعد.</p>
        </div>
      ) : (
        <Suspense fallback={<DashboardSkeleton />}>
          <SessionView session={session} tenantId={store.id} storeName={store.name} readOnly />
        </Suspense>
      )}
    </div>
  );
}
