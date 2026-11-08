import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Role = "master" | "manager" | "worker";

export interface Me {
  userId: string;
  username: string;
  fullName: string;
  roles: Role[];
  tenant: { id: string; code: string; name: string } | null;
  isMaster: boolean;
  isManager: boolean;
  /** Account or store switched off by an admin. */
  blocked: boolean;
  homePath: "/admin" | "/dashboard" | "/scan";
}

const CACHE_KEY = "stocki_me_v2";

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

  const [profileRes, rolesRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("username, full_name, tenant_id, is_active")
      .eq("id", userId)
      .maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", userId),
  ]);

  if (profileRes.error || rolesRes.error) {
    const cached = readCache(userId);
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
  const blocked = !profile.is_active || (!isMaster && !tenant);

  const me: Me = {
    userId,
    username: profile.username,
    fullName: profile.full_name,
    roles,
    tenant,
    isMaster,
    isManager,
    blocked,
    homePath: isMaster ? "/admin" : isManager ? "/dashboard" : "/scan",
  };
  localStorage.setItem(CACHE_KEY, JSON.stringify(me));
  return me;
}

export const meQueryOptions = queryOptions({
  queryKey: ["me"],
  queryFn: fetchMe,
  staleTime: 5 * 60 * 1000,
});

export const ROLE_LABEL: Record<Role, string> = {
  master: "المدير العام",
  manager: "مسير المتجر",
  worker: "عامل جرد",
};
