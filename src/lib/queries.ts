import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { cacheGet, cacheSet } from "./offline";

export type InventorySession = Tables<"inventory_sessions">;
export type InventoryLog = Tables<"inventory_logs">;
export type Product = Tables<"products">;
export type SnapshotRow = Tables<"session_stock_snapshots">;

const PAGE = 1000;

/** Read every row, 1000 at a time (the server returns at most 1000 per request). */
async function fetchAll<T>(
  build: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
) {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

/** Try the network, keep a copy for offline use, fall back to the copy. */
async function withOfflineCopy<T>(key: string, load: () => Promise<T>): Promise<T> {
  try {
    const value = await load();
    void cacheSet(key, value);
    return value;
  } catch (e) {
    const cached = await cacheGet<T>(key);
    if (cached !== undefined) return cached;
    throw e;
  }
}

export const activeSessionQuery = (tenantId: string) =>
  queryOptions({
    queryKey: ["active-session", tenantId],
    queryFn: () =>
      withOfflineCopy(`active-session:${tenantId}`, async () => {
        const { data, error } = await supabase
          .from("inventory_sessions")
          .select("*")
          .eq("tenant_id", tenantId)
          .eq("status", "active")
          .maybeSingle();
        if (error) throw new Error(error.message);
        return data;
      }),
  });

export const sessionsQuery = (tenantId: string) =>
  queryOptions({
    queryKey: ["sessions", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_sessions")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("started_at", { ascending: false })
        .limit(50);
      if (error) throw new Error(error.message);
      return data;
    },
  });

export const sessionLogsQuery = (sessionId: string | null) =>
  queryOptions({
    queryKey: ["session-logs", sessionId],
    queryFn: () =>
      sessionId
        ? withOfflineCopy(`session-logs:${sessionId}`, () =>
            fetchAll<InventoryLog>((from, to) =>
              supabase
                .from("inventory_logs")
                .select("*")
                .eq("session_id", sessionId)
                .order("counted_at", { ascending: false })
                .range(from, to),
            ),
          )
        : Promise.resolve([] as InventoryLog[]),
  });

export const snapshotQuery = (sessionId: string | null) =>
  queryOptions({
    queryKey: ["snapshot", sessionId],
    queryFn: () =>
      sessionId
        ? fetchAll<SnapshotRow>((from, to) =>
            supabase
              .from("session_stock_snapshots")
              .select("*")
              .eq("session_id", sessionId)
              .order("barcode")
              .range(from, to),
          )
        : Promise.resolve([] as SnapshotRow[]),
  });

export const productsQuery = (tenantId: string) =>
  queryOptions({
    queryKey: ["products", tenantId],
    queryFn: () =>
      withOfflineCopy(`products:${tenantId}`, () =>
        fetchAll<Product>((from, to) =>
          supabase
            .from("products")
            .select("*")
            .eq("tenant_id", tenantId)
            .order("name")
            .range(from, to),
        ),
      ),
  });

export interface TeamMember {
  id: string;
  username: string;
  full_name: string;
  is_active: boolean;
  must_activate: boolean;
  created_at: string;
  tenant_id: string | null;
  roles: string[];
}

export const teamQuery = (tenantId: string) =>
  queryOptions({
    queryKey: ["team", tenantId],
    queryFn: async (): Promise<TeamMember[]> => {
      const { data: people, error } = await supabase
        .from("profiles")
        .select("id, username, full_name, is_active, must_activate, created_at, tenant_id")
        .eq("tenant_id", tenantId)
        .order("created_at");
      if (error) throw new Error(error.message);
      const ids = (people ?? []).map((p) => p.id);
      const { data: roles } = ids.length
        ? await supabase.from("user_roles").select("user_id, role").in("user_id", ids)
        : { data: [] as { user_id: string; role: string }[] };
      return (people ?? []).map((p) => ({
        ...p,
        roles: (roles ?? []).filter((r) => r.user_id === p.id).map((r) => r.role),
      }));
    },
  });

export interface StoreSummary {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
  created_at: string;
  members: TeamMember[];
}

export const storesQuery = () =>
  queryOptions({
    queryKey: ["stores"],
    queryFn: async (): Promise<StoreSummary[]> => {
      const [{ data: stores, error }, { data: people }, { data: roles }] = await Promise.all([
        supabase.from("tenants").select("*").order("created_at", { ascending: false }),
        supabase
          .from("profiles")
          .select("id, username, full_name, is_active, must_activate, created_at, tenant_id")
          .not("tenant_id", "is", null),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      if (error) throw new Error(error.message);
      const members: TeamMember[] = (people ?? []).map((p) => ({
        ...p,
        roles: (roles ?? []).filter((r) => r.user_id === p.id).map((r) => r.role),
      }));
      return (stores ?? []).map((s) => ({
        ...s,
        members: members.filter((m) => m.tenant_id === s.id),
      }));
    },
  });

export type SalesTicket = Tables<"sales_tickets">;
export type SalesTicketItem = Tables<"sales_ticket_items">;

export const salesTicketsQuery = (sessionId: string) =>
  queryOptions({
    queryKey: ["sales-tickets", sessionId],
    queryFn: async () => {
      const [t, i] = await Promise.all([
        supabase
          .from("sales_tickets")
          .select("*")
          .eq("session_id", sessionId)
          .order("ticket_number", { ascending: false }),
        supabase.from("sales_ticket_items").select("*").eq("session_id", sessionId),
      ]);
      if (t.error) throw t.error;
      if (i.error) throw i.error;
      return { tickets: t.data, items: i.data };
    },
  });
