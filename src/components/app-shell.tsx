import { useEffect } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  CloudOff,
  LayoutDashboard,
  Layers,
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

type NavItem = {
  to: "/admin" | "/dashboard" | "/scan" | "/products" | "/team" | "/pos";
  label: string;
  icon: LucideIcon;
};

function navFor(me: Me): NavItem[] {
  if (me.isMaster) return [{ to: "/admin", label: "المتاجر", icon: Building2 }];
  if (me.isManager)
    return [
      { to: "/dashboard", label: "لوحة الجرد", icon: LayoutDashboard },
      { to: "/scan", label: "السكان", icon: ScanLine },
      { to: "/pos", label: "البيع", icon: ShoppingCart },
      { to: "/products", label: "المنتجات", icon: Package },
      { to: "/team", label: "الفريق", icon: Users },
    ];
  return [{ to: "/scan", label: "السكان", icon: ScanLine }];
}

export function SyncBadge() {
  const { online, syncing, queue } = useSyncState();
  const pending = queue.filter((q) => q.status === "pending").length;
  const failed = queue.filter((q) => q.status === "failed").length;
  if (online && pending === 0 && failed === 0) {
    return (
      <span className="flex items-center gap-1.5 rounded-full bg-success/15 px-2.5 py-1 text-[11px] font-bold text-success">
        <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-success" />
        متصل
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
      {!online ? "بدون اتصال" : "قيد الإرسال"}
      {pending > 0 && <span className="font-mono">· {pending}</span>}
      {failed > 0 && <span className="font-mono">· {failed} مرفوض</span>}
    </button>
  );
}

export function AppShell({ me, children }: { me: Me; children: React.ReactNode }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const items = navFor(me);

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
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <header className="sticky top-0 z-30 bg-ink text-ink-foreground">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
          <Link to={me.homePath} className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Layers className="h-5 w-5" />
            </span>
            <span className="leading-tight">
              <span className="block text-base font-extrabold">
                SMART <span className="text-warning">STOCK</span>
              </span>
              <span className="block max-w-[10rem] truncate text-[11px] text-ink-muted">
                {me.tenant ? me.tenant.name : "الإدارة العامة"}
              </span>
            </span>
          </Link>

          <nav className="hidden flex-1 items-center gap-1 md:flex">
            {items.map((item) => {
              const active = pathname.startsWith(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold transition-colors",
                    active
                      ? "bg-ink-foreground/12 text-ink-foreground"
                      : "text-ink-muted hover:text-ink-foreground",
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="ms-auto flex items-center gap-2">
            <SyncBadge />
            <DropdownMenu dir="rtl">
              <DropdownMenuTrigger asChild>
                <Button variant="inkGhost" className="h-10 gap-2 px-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink-foreground/15 text-sm font-bold">
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
                <DropdownMenuItem asChild>
                  <Link to="/settings">
                    <Settings className="h-4 w-4" />
                    الإعدادات
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={signOut}
                  className="text-destructive focus:text-destructive"
                >
                  <LogOut className="h-4 w-4" />
                  تسجيل الخروج
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>

      {items.length > 1 && (
        <nav className="fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 backdrop-blur md:hidden">
          <div
            className="mx-auto grid max-w-md"
            style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }}
          >
            {items.map((item) => {
              const active = pathname.startsWith(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "flex flex-col items-center gap-1 py-2.5 text-[11px] font-bold",
                    active ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}
