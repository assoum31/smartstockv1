import { BrandMark } from "@/components/brand-logo";
import { RecountBanner } from "@/components/recount-banner";
import { Warehouse, HandCoins, Wallet, History, ShieldCheck, Undo2, Contact, Globe, Store } from "lucide-react";
import { useEffect, useState } from "react";
import { Menu, ChevronDown, FileText } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
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
import { startOfflineSync, useSyncState, flushQueue, clearLocalSignOutData } from "@/lib/offline";
import { cn } from "@/lib/utils";
import { useLiveNotes, useSeenAt } from "@/lib/notifications";
import { useI18n, type TKey } from "@/lib/i18n";
import { useDeviceSales, syncDeviceSales } from '@/lib/offline-sales';
import { InstallApp } from '@/components/install-app';

type NavItem = {
  to:
    | "/admin"
    | "/audit"
    | "/advances"
    | "/expenses"
    | "/stock"
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
    | "/activity"
    | "/customers"
    | "/orders"
    | "/online-store";
  label: TKey;
  short?: TKey;
  icon: LucideIcon;
  /** Shown in the phone bottom bar; the rest live in the account menu. */
  dock?: boolean;
};

type GroupKey = "work" | "sales" | "stock" | "admin";
const GROUPS: { key: GroupKey; label: string }[] = [
  { key: "work", label: "العمل اليومي" },
  { key: "sales", label: "المبيعات" },
  { key: "stock", label: "المخزون والمشتريات" },
  { key: "admin", label: "الإدارة" },
];
function groupOf(to: NavItem["to"]): GroupKey {
  if (["/pos", "/sales", "/returns", "/orders", "/customers", "/advances", "/expenses"].includes(to)) return "sales";
  if (["/products", "/stock", "/receipts", "/suppliers", "/online-store"].includes(to)) return "stock";
  if (["/team", "/activity", "/admin"].includes(to)) return "admin";
  return "work";
}
function grouped(items: NavItem[]) {
  return GROUPS.map((g) => ({ ...g, items: items.filter((i) => groupOf(i.to) === g.key) })).filter((g) => g.items.length);
}

function navFor(me: Me): NavItem[] {
  if (me.isMaster) return [{ to: "/admin", label: "stores", icon: Building2, dock: true }];
  const pos: NavItem[] = [
    { to: "/sales", label: "salesLog", short: "salesShort", icon: ClipboardList },
    { to: "/returns", label: "returns", short: "returnsShort", icon: Undo2 },
    { to: "/receipts", label: "receipts", short: "receiptsShort", icon: PackagePlus },
    { to: "/suppliers", label: "suppliers", icon: Truck },
    { to: "/customers", label: "customers", icon: Contact },
    { to: "/orders", label: "onlineOrders", short: "ordersShort", icon: Globe },
  ];
  const activity: NavItem = { to: "/activity", label: "activity", short: "activityShort", icon: History };
  if (me.isManager)
    return ([
      { to: "/dashboard", label: "dashboard", short: "dashboardShort", icon: LayoutDashboard, dock: true },
      { to: "/inventory", label: "inventory", icon: ClipboardList, dock: true },
      { to: "/pos", label: "pos", icon: ShoppingCart, dock: true },
      { to: "/scan", label: "scan", icon: ScanLine, dock: true },
      { to: "/products", label: "products", icon: Package, dock: true },
      { to: "/stock", label: "stock", icon: Warehouse },
      { to: "/team", label: "team", icon: Users },
      { to: "/audit", label: "audit", icon: ShieldCheck },
      { to: "/advances", label: "advances", icon: HandCoins },
      { to: "/expenses", label: "expenses", icon: Wallet },
      { to: "/online-store", label: "onlineStore", icon: Store },
      { to: "/g50", label: "g50", icon: FileText },
      ...pos,
      activity,
    ] satisfies NavItem[]).filter((i) => navAllowed(me, i.to));
  const items: NavItem[] = [];
  if (me.canAudit) items.push({ to: "/audit", label: "audit", icon: ShieldCheck, dock: true });
  if (me.canWatchInventory) items.push({ to: "/inventory", label: "inventory", icon: ClipboardList, dock: true });
  if (me.canSeeStats) items.push({ to: "/dashboard", label: "dashboard", short: "dashboardShort", icon: LayoutDashboard, dock: true });
  if (me.canSell)
    items.push(
      { to: "/pos", label: "pos", icon: ShoppingCart, dock: true },
      ...pos.map((i) => ({ ...i, dock: i.to === "/sales" || i.to === "/returns" })),
      { to: "/advances", label: "advances", icon: HandCoins },
      { to: "/expenses", label: "expenses", icon: Wallet },
    );
  if (!me.canSell && me.canStock)
    items.push(
      { to: "/receipts", label: "receipts", short: "receiptsShort", icon: PackagePlus, dock: true },
      { to: "/suppliers", label: "suppliers", icon: Truck, dock: true },
      { to: "/returns", label: "returns", short: "returnsShort", icon: Undo2, dock: true },
    );
  if (me.canStock && me.roles.includes("storekeeper")) items.push({ to: "/g50", label: "g50", icon: FileText });
  if (me.roles.includes("worker") && me.features.inventory) items.push({ to: "/scan", label: "scan", icon: ScanLine, dock: true });
  if (me.canSeeProducts) items.push({ to: "/products", label: "products", icon: Package, dock: true }, { to: "/stock", label: "stock", icon: Warehouse });
  if (me.canSell && !me.canStock) {
    for (let k = items.length - 1; k >= 0; k--) if (["/receipts", "/suppliers"].includes(items[k]?.to ?? "")) items.splice(k, 1);
  }
  if (!items.length) items.push({ to: "/scan", label: "scan", icon: ScanLine, dock: true });
  return items;
}

function navAllowed(me: Me, to: string) {
  const f = me.features;
  if (["/inventory", "/scan", "/audit"].includes(to)) return f.inventory;
  if (["/pos", "/sales", "/dashboard", "/customers", "/orders", "/advances", "/expenses"].includes(to)) return f.sales;
  if (["/receipts", "/suppliers", "/returns", "/g50"].includes(to)) return f.stock_io || to === "/g50";
  if (to === "/online-store") return f.online_store;
  return true;
}

export function SyncBadge() {
  const { t } = useI18n();
  const { online, syncing, queue } = useSyncState();
  const { sales, syncing: syncingSales } = useDeviceSales();
  const pending = queue.filter((q) => q.status === "pending").length + sales.filter(sale => sale.status === 'pending').length;
  const failed = queue.filter((q) => q.status === "failed").length + sales.filter(sale => sale.status === 'failed').length;
  if (online && pending === 0 && failed === 0) {
    return (
      <span className="flex items-center gap-1.5 rounded-full bg-success/15 px-2.5 py-1 text-[11px] font-bold text-success">
        <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-success" />
        {t("online")}
      </span>
    );
  }
  return (
    <Button variant="ghost"
      type="button"
      onClick={() => { void flushQueue(); void syncDeviceSales(); }}
      className={cn(
        "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold",
        failed
          ? "bg-destructive/20 text-destructive-foreground"
          : "bg-warning text-warning-foreground",
      )}
      title="إعادة الإرسال"
    >
      {online ? (
        <RefreshCw className={cn("h-3 w-3", (syncing || syncingSales) && "animate-spin")} />
      ) : (
        <CloudOff className="h-3 w-3" />
      )}
      {!online ? t("offline") : t("sending")}
      {pending > 0 && <span className="font-mono">· {pending}</span>}
      {failed > 0 && <span className="font-mono">· {failed} {t("rejected")}</span>}
    </Button>
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
  const groups = grouped(items);
  const [drawer, setDrawer] = useState(false);
  const { t, dir } = useI18n();
  const { queue } = useSyncState();
  const { sales } = useDeviceSales();

  useEffect(() => {
    startOfflineSync();
  }, []);

  const signOut = async () => {
    if (queue.length || sales.length) {
      const { toast } = await import('sonner');
      toast.error('زامن العمليات المحفوظة قبل تسجيل الخروج.');
      return;
    }
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    try {
      await clearLocalSignOutData();
    } catch {
      // Local cleanup must never prevent sign-out or navigation.
    }
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

          <Sheet open={drawer} onOpenChange={setDrawer}>
            <SheetTrigger asChild>
              <Button variant="inkGhost" size="icon" className="h-10 w-10 shrink-0 lg:hidden" aria-label={t("settings")}>
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side={dir === "rtl" ? "right" : "left"} className="flex w-[86vw] max-w-sm flex-col gap-0 p-0">
              <SheetHeader className="border-b p-4 text-start">
                <SheetTitle className="flex items-center gap-2">
                  <BrandMark className="h-9 w-9 rounded-xl" />
                  <span className="min-w-0">
                    <span className="block text-base font-extrabold">SMART STOCK</span>
                    <span className="block truncate text-xs font-medium text-muted-foreground">{me.fullName} · {ROLE_LABEL[me.roles[0] ?? "worker"]}</span>
                  </span>
                </SheetTitle>
              </SheetHeader>
              <nav className="flex-1 space-y-5 overflow-y-auto p-3">
                {groups.map((g) => (
                  <div key={g.key}>
                    <p className="px-3 pb-1.5 text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground">{g.label}</p>
                    <div className="space-y-0.5">
                      {g.items.map((item) => {
                        const active = pathname.startsWith(item.to);
                        return (
                          <Link key={item.to} to={item.to} onClick={() => setDrawer(false)}
                            className={cn("flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition-colors",
                              active ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
                            <item.icon className="h-[18px] w-[18px] shrink-0" />
                            <span className="truncate">{t(item.label)}</span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </nav>
              <div className="space-y-1 border-t p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
                <Link to="/settings" onClick={() => setDrawer(false)} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold hover:bg-muted">
                  <Settings className="h-[18px] w-[18px]" />{t("settings")}
                </Link>
                <button type="button" onClick={signOut} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold text-destructive hover:bg-destructive/10">
                  <LogOut className="h-[18px] w-[18px]" />{t("signOut")}
                </button>
              </div>
            </SheetContent>
          </Sheet>
          <Link to={me.homePath} className="flex min-w-0 items-center gap-2">
            <BrandMark className="h-9 w-9 shrink-0 shadow-lift rounded-xl" />
            <span className="min-w-0 leading-tight">
              <span className="block text-sm font-extrabold tracking-wide sm:text-base">
                SMART <span className="text-warning">STOCK</span>
              </span>
              <span className="block max-w-[7rem] truncate text-[11px] text-ink-muted sm:max-w-[12rem]">
                {me.tenant ? me.tenant.name : t("hq")}
              </span>
            </span>
          </Link>

          <nav className="hidden min-w-0 flex-1 items-center justify-center gap-1 lg:flex">
            {groups.map((g) => {
              const active = g.items.some((i) => pathname.startsWith(i.to));
              if (g.items.length === 1) {
                const item = g.items[0]!;
                return (
                  <Link key={g.key} to={item.to} className={cn("flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-bold transition-colors",
                    active ? "bg-primary text-primary-foreground" : "text-ink-muted hover:bg-ink-foreground/10 hover:text-ink-foreground")}>
                    <item.icon className="h-4 w-4" />{t(item.label)}
                  </Link>
                );
              }
              return (
                <DropdownMenu key={g.key} dir={dir}>
                  <DropdownMenuTrigger asChild>
                    <button type="button" className={cn("flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-bold transition-colors",
                      active ? "bg-primary text-primary-foreground" : "text-ink-muted hover:bg-ink-foreground/10 hover:text-ink-foreground")}>
                      {g.label}<ChevronDown className="h-3.5 w-3.5 opacity-70" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-56">
                    {g.items.map((item) => (
                      <DropdownMenuItem key={item.to} asChild className={cn(pathname.startsWith(item.to) && "bg-accent")}>
                        <Link to={item.to}><item.icon className="h-4 w-4" />{t(item.label)}</Link>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              );
            })}
          </nav>

          <div className="ms-auto flex items-center gap-1.5">
            <InstallApp />
            <SyncBadge />
            {me.isManager && (
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
                  <DropdownMenuItem key={item.to} asChild className="hidden">
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
