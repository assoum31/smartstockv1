import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { isNetworkError } from './offline';

export type Role = "master" | "manager" | "worker" | "cashier" | "pricer" | "observer" | "auditor" | "sales_manager";

export interface Me {
  userId: string;
  username: string;
  fullName: string;
  roles: Role[];
  tenant: { id: string; code: string; name: string } | null;
  isMaster: boolean;
  isManager: boolean;
  /** Manager or cashier: point of sale, sales log, suppliers, goods receipts. */
  canSell: boolean;
  /** Manager, cashier or price checker: product catalogue. */
  canSeeProducts: boolean;
  /** Manager or inventory observer: read the inventory board. */
  canWatchInventory: boolean;
  /** Manager or inventory auditor: audit counted lines. */
  canAudit: boolean;
  /** Manager or sales manager: sales statistics, revenue and profit. */
  canSeeStats: boolean;
  /** Account or store switched off by an admin. */
  blocked: boolean;
  homePath: "/admin" | "/dashboard" | "/scan" | "/pos" | "/products" | "/inventory" | "/audit";
}

const CACHE_KEY = "stocki_me_v5";

function readCache(userId: string): Me | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const me = JSON.parse(raw) as Me;
    return me.userId === userId ? me : null;
  } catch {
    return null;
  }
}

/**
 * The signed-in person, their roles and store. Falls back to the last known
 * copy when the phone is offline so the scan screen still opens.
 */
export async function fetchMe(): Promise<Me | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return null;
  const userId = session.user.id;
  if (!navigator.onLine) return readCache(userId);

  const [profileRes, rolesRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("username, full_name, tenant_id, is_active")
      .eq("id", userId)
      .maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", userId),
  ]);

  if (profileRes.error || rolesRes.error) {
    const message = (profileRes.error ?? rolesRes.error)?.message ?? '';
    const cached = isNetworkError(message) ? readCache(userId) : null;
    if (cached) return cached;
    throw profileRes.error ?? rolesRes.error;
  }

  const profile = profileRes.data;
  if (!profile) return null;
  const roles = (rolesRes.data ?? []).map((r) => r.role as Role);

  let tenant: Me["tenant"] = null;
  if (profile.tenant_id) {
    const { data } = await supabase
      .from("tenants")
      .select("id, code, name")
      .eq("id", profile.tenant_id)
      .maybeSingle();
    tenant = data ?? null;
  }

  const isMaster = roles.includes("master");
  const isManager = roles.includes("manager");
  // A store member whose store is switched off can't see their store row.
  const canSell = isManager || roles.includes("cashier") || roles.includes("sales_manager");
  const canSeeStats = isManager || roles.includes("sales_manager");
  const canSeeProducts = canSell || roles.includes("pricer");
  const canWatchInventory = isManager || roles.includes("observer");
  const canAudit = isManager || roles.includes("auditor");
  const blocked = !profile.is_active || (!isMaster && !tenant);

  const me: Me = {
    userId,
    username: profile.username,
    fullName: profile.full_name,
    roles,
    tenant,
    isMaster,
    isManager,
    canSell,
    canSeeProducts,
    canWatchInventory,
    canAudit,
    canSeeStats,
    blocked,
    homePath: isMaster
      ? "/admin"
      : canSeeStats
        ? "/dashboard"
        : roles.includes("cashier")
          ? "/pos"
          : roles.includes("auditor")
            ? "/audit"
            : roles.includes("observer") && !roles.includes("worker")
              ? "/inventory"
              : roles.includes("pricer") && !roles.includes("worker")
            ? "/products"
            : "/scan",
  };
  localStorage.setItem(CACHE_KEY, JSON.stringify(me));
  return me;
}

export const meQueryOptions = queryOptions({
  queryKey: ["me"],
  networkMode: 'always',
  queryFn: fetchMe,
  staleTime: 5 * 60 * 1000,
});

export const ROLE_LABEL: Record<Role, string> = {
  master: "المدير العام",
  manager: "مسير المتجر",
  worker: "عامل جرد",
  cashier: "بائع / كاشير",
  pricer: "مصحح الأسعار",
  observer: "مراقب الجرد",
  auditor: "مدقق الجرد",
  sales_manager: "مسؤول المبيعات",
};
