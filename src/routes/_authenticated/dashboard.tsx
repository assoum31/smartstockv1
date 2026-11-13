import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ClipboardList, Package, ScanLine, ShoppingCart, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SalesCharts } from "@/components/sales-charts";
import { PageHeader } from "@/components/stat-card";
import { activeSessionQuery } from "@/lib/queries";
import { formatDateTime } from "@/lib/messages";

export const Route = createFileRoute("/_authenticated/dashboard")({
  beforeLoad: ({ context }) => {
    if (!context.me.isManager || !context.me.tenant) throw redirect({ to: context.me.homePath });
    return { tenant: context.me.tenant };
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(activeSessionQuery(context.tenant.id)),
  head: () => ({ meta: [{ title: "لوحة التحكم | SMART STOCK" }] }),
  component: DashboardPage,
});

function DashboardPage() {
  const { tenant } = Route.useRouteContext();
  const { data: active } = useSuspenseQuery(activeSessionQuery(tenant.id));
  const quick = [
    { to: "/pos" as const, label: "نقطة البيع", Icon: ShoppingCart },
    { to: "/inventory" as const, label: "الجرد", Icon: ClipboardList },
    { to: "/scan" as const, label: "السكان", Icon: ScanLine },
    { to: "/products" as const, label: "المنتجات", Icon: Package },
  ];
  return (
    <div className="space-y-6">
      <PageHeader title="لوحة التحكم" subtitle="تابع أهدافك: المبيعات والمنتجات الأكثر طلباً" />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {quick.map(({ to, label, Icon }) => (
          <Link
            key={to}
            to={to}
            className="surface-card flex flex-col items-center gap-2 p-4 text-sm font-extrabold transition-colors hover:border-primary/40"
          >
            <Icon className="h-6 w-6 text-primary" />
            {label}
          </Link>
        ))}
      </div>

      <SalesCharts tenantId={tenant.id} />

      <div className="surface-card flex flex-wrap items-center justify-between gap-3 p-5">
        <div className="flex items-center gap-3">
          <Target className="h-6 w-6 text-primary" />
          <div>
            <p className="font-extrabold">
              {active ? `جلسة جرد مفتوحة: ${active.name}` : "لا توجد جلسة جرد مفتوحة"}
            </p>
            {active && (
              <p className="text-xs text-muted-foreground">بدأت {formatDateTime(active.started_at)}</p>
            )}
          </div>
        </div>
        <Button variant="outline" asChild>
          <Link to="/inventory">فتح لوحة الجرد</Link>
        </Button>
      </div>
    </div>
  );
}
