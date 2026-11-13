import { BrandMark } from "@/components/brand-logo";
import { RecountBanner } from "@/components/recount-banner";
import { History, Undo2 } from "lucide-react";
import { useEffect } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  ClipboardList,
  PackagePlus,
  Truck,
  Building2,
  CloudOff,
  LayoutDashboard,
  LogOut,
  Package,
  RefreshCw,
  ScanLine,
  ShoppingCart,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ROLE_LABEL, type Me } from "@/lib/me";
import { startOfflineSync, useSyncState, flushQueue } from "@/lib/offline";
import { cn } from "@/lib/utils";
import { useLiveNotes, useSeenAt } from "@/lib/notifications";
import { useI18n, type TKey } from "@/lib/i18n";

type NavItem = {
  to:
    | "/admin"
    | "/dashboard"
    | "/inventory"
    | "/scan"
    | "/products"
    | "/team"
    | "/pos"
    | "/sales"
    | "/suppliers"
    | "/receipts"
    | "/returns"
    | "/activity";
  label: TKey;
  short?: TKey;
  icon: LucideIcon;
  /** Shown in the phone bottom bar; the rest live in the account menu. */
  dock?: boolean;
};

function navFor(me: Me): NavItem[] {
  if (me.isMaster) return [{ to: "/admin", label: "stores", icon: Building2, dock: true }];
  const pos: NavItem[] = [
    { to: "/sales", label: "salesLog", short: "salesShort", icon: ClipboardList },
    { to: "/returns", label: "returns", short: "returnsShort", icon: Undo2 },
    { to: "/receipts", label: "receipts", short: "receiptsShort", icon: PackagePlus },
    { to: "/suppliers", label: "suppliers", icon: Truck },
  ];
  const activity: NavItem = { to: "/activity", label: "activity", short: "activityShort", icon: History };
  if (me.isManager)
    return [
      { to: "/dashboard", label: "dashboard", short: "dashboardShort", icon: LayoutDashboard, dock: true },
      { to: "/inventory", label: "inventory", icon: ClipboardList, dock: true },
      { to: "/pos", label: "pos", icon: ShoppingCart, dock: true },
      { to: "/scan", label: "scan", icon: ScanLine, dock: true },
      { to: "/products", label: "products", icon: Package, dock: true },
      { to: "/team", label: "team", icon: Users, dock: true },
      ...pos,
      activity,
    ];
  const items: NavItem[] = [];
  if (me.canSell)
    items.push(
      { to: "/pos", label: "pos", icon: ShoppingCart, dock: true },
      ...pos.map((i) => ({ ...i, dock: i.to === "/sales" || i.to === "/returns" })),
    );
  if (me.roles.includes("worker")) items.push({ to: "/scan", label: "scan", icon: ScanLine, dock: true });
  if (me.canSeeProducts) items.push({ to: "/products", label: "products", icon: Package, dock: true });
  if (!items.length) items.push({ to: "/scan", label: "scan", icon: ScanLine, dock: true });
  items.push({ ...activity, dock: items.filter((i) => i.dock).length < 5 });
  return items;
}

export function SyncBadge() {
  const { t } = useI18n();
  const { online, syncing, queue } = useSyncState();
  const pending = queue.filter((q) => q.status === "pending").length;
  const failed = queue.filter((q) => q.status === "failed").length;
  if (online && pending === 0 && failed === 0) {
    return (
      <span className="flex items-center gap-1.5 rounded-full bg-success/15 px-2.5 py-1 text-[11px] font-bold text-success">
        <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-success" />
        {t("online")}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={() => void flushQueue()}
      className={cn(
        "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold",
        failed
          ? "bg-destructive/20 text-destructive-foreground"
          : "bg-warning text-warning-foreground",
      )}
      title="إعادة الإرسال"
    >
      {online ? (
        <RefreshCw className={cn("h-3 w-3", syncing && "animate-spin")} />
      ) : (
        <CloudOff className="h-3 w-3" />
      )}
      {!online ? t("offline") : t("sending")}
      {pending > 0 && <span className="font-mono">· {pending}</span>}
      {failed > 0 && <span className="font-mono">· {failed} {t("rejected")}</span>}
    </button>
  );
}

function NotificationBell({ tenantId }: { tenantId: string }) {
  const { data = [] } = useLiveNotes(tenantId);
  const { seenAt } = useSeenAt();
  const { t } = useI18n();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const unread = pathname === "/notifications" ? 0 : data.filter((n) => n.counted_at > seenAt).length;
  return (
    <Link to="/notifications" aria-label={t("notifications")} className="relative flex h-10 w-10 items-center justify-center rounded-lg hover:bg-ink-foreground/10">
      <Bell className="h-5 w-5" />
      {unread > 0 && (
        <span className="absolute -top-0.5 -end-0.5 min-w-5 rounded-full bg-destructive px-1 text-center text-[10px] font-bold leading-5 text-destructive-foreground">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </Link>
  );
}

export function AppShell({ me, children }: { me: Me; children: React.ReactNode }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const items = navFor(me);
  const dockItems = items.filter((i) => i.dock).slice(0, 5);
  const menuItems = items.filter((i) => !dockItems.includes(i));
  const { t, dir } = useI18n();

  useEffect(() => {
    startOfflineSync();
  }, []);

  const signOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({
      to: me.isMaster ? "/master" : me.isManager ? "/manager" : "/worker",
      replace: true,
    });
  };

  return (
    <div className="min-h-screen bg-background pb-32 md:pb-0">
      {!me.isMaster && <RecountBanner userId={me.userId} />}
      <header className="sticky top-0 z-30 border-b border-ink-foreground/10 bg-ink/95 text-ink-foreground backdrop-blur pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-3 sm:h-16 sm:px-6">
          <Link to={me.homePath} className="flex min-w-0 items-center gap-2">
            <BrandMark className="h-9 w-9 shrink-0 shadow-lift rounded-xl" />
            <span className="min-w-0 leading-tight">
              <span className="block text-sm font-extrabold tracking-wide sm:text-base">
                SMART <span className="text-warning">STOCK</span>
              </span>
              <span className="block max-w-[8rem] truncate text-[11px] text-ink-muted sm:max-w-[12rem]">
                {me.tenant ? me.tenant.name : t("hq")}
              </span>
            </span>
          </Link>

          <nav className="hidden flex-1 items-center justify-center gap-1 md:flex">
            {items.map((item) => {
              const active = pathname.startsWith(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition-colors",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-ink-muted hover:bg-ink-foreground/10 hover:text-ink-foreground",
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {t(item.label)}
                </Link>
              );
            })}
          </nav>

          <div className="ms-auto flex items-center gap-1.5">
            <SyncBadge />
            {!me.isMaster && (
              <Link to="/activity" aria-label={t("activity")} className="flex h-10 w-10 items-center justify-center rounded-lg hover:bg-ink-foreground/10">
                <History className="h-5 w-5" />
              </Link>
            )}
            {me.isManager && me.tenant && <NotificationBell tenantId={me.tenant.id} />}
            <DropdownMenu dir={dir}>
              <DropdownMenuTrigger asChild>
                <Button variant="inkGhost" className="h-10 gap-2 rounded-full px-1 sm:px-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-warning text-sm font-extrabold text-warning-foreground">
                    {me.fullName.charAt(0)}
                  </span>
                  <span className="hidden text-start sm:block">
                    <span className="block text-xs font-bold">{me.fullName}</span>
                    <span className="block text-[10px] font-medium text-ink-muted">
                      {ROLE_LABEL[me.roles[0] ?? "worker"]}
                    </span>
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <p className="text-sm font-bold">{me.fullName}</p>
                  <p className="barcode-chip text-xs text-muted-foreground">
                    {me.username}@{me.tenant?.code ?? "admin"}
                  </p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {menuItems.map((item) => (
                  <DropdownMenuItem key={item.to} asChild className="md:hidden">
                    <Link to={item.to}>
                      <item.icon className="h-4 w-4" />
                      {t(item.label)}
                    </Link>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuItem asChild>
                  <Link to="/settings">
                    <Settings className="h-4 w-4" />
                    {t("settings")}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={signOut}
                  className="text-destructive focus:text-destructive"
                >
                  <LogOut className="h-4 w-4" />
                  {t("signOut")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl min-w-0 overflow-x-hidden px-3 py-5 sm:px-6 sm:py-8">{children}</main>

      {dockItems.length > 1 && (
        <nav
          aria-label="main"
          className="fixed inset-x-3 bottom-3 z-30 mb-[env(safe-area-inset-bottom)] rounded-2xl border bg-card/90 shadow-lift backdrop-blur-lg md:hidden"
        >
          <div
            className="mx-auto grid max-w-md items-center px-1"
            style={{ gridTemplateColumns: `repeat(${dockItems.length}, 1fr)` }}
          >
            {dockItems.map((item) => {
              const active = pathname.startsWith(item.to);
              const hero = item.to === (me.canSell ? "/pos" : "/scan");
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "flex h-16 min-w-0 flex-col items-center justify-center gap-1 text-[10.5px] font-bold leading-none transition-all active:scale-95",
                    active ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-8 w-11 items-center justify-center rounded-xl transition-colors",
                      hero ? "bg-primary text-primary-foreground shadow-lift" : active && "bg-primary/12",
                      hero && active && "ring-2 ring-primary/30 ring-offset-2 ring-offset-card",
                    )}
                  >
                    <item.icon className="h-[18px] w-[18px]" strokeWidth={2.2} />
                  </span>
                  <span className="w-full truncate px-0.5 text-center">{t(item.short ?? item.label)}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}
