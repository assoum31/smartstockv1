import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { withOfflineCopy } from './offline';

export type Supplier = Tables<"suppliers">;
export type GoodsReceipt = Tables<"goods_receipts"> & { items: Tables<"goods_receipt_items">[] };
export type SaleTicket = Tables<"sales_tickets"> & { items: Tables<"sales_ticket_items">[] };

export const money = (n: number) =>
  new Intl.NumberFormat("fr-DZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

export const suppliersQuery = (tenantId: string) =>
  queryOptions({
    queryKey: ["suppliers", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

/** Last 500 sales of the store, newest first, with their lines. */
export const storeSalesQuery = (tenantId: string) =>
  queryOptions({
    queryKey: ["sales-tickets", "store", tenantId],
    queryFn: async (): Promise<SaleTicket[]> => {
      const { data, error } = await supabase
        .from("sales_tickets")
        .select("*, items:sales_ticket_items(*)")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data as SaleTicket[];
    },
  });

export const receiptsQuery = (tenantId: string) =>
  queryOptions({
    queryKey: ["goods-receipts", tenantId],
    queryFn: async (): Promise<GoodsReceipt[]> => {
      const { data, error } = await supabase
        .from("goods_receipts")
        .select("*, items:goods_receipt_items(*)")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return data as GoodsReceipt[];
    },
  });

export type StockReturn = Tables<"stock_returns"> & { items: Tables<"stock_return_items">[] };
export const returnsQuery = (tenantId: string) =>
  queryOptions({
    queryKey: ["stock-returns", tenantId],
    queryFn: async (): Promise<StockReturn[]> => {
      const { data, error } = await supabase
        .from("stock_returns")
        .select("*, items:stock_return_items(*)")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return data as StockReturn[];
    },
  });

export type CashSession = Tables<"cash_sessions">;
export const myCashSessionQuery = (tenantId: string, userId: string) =>
  queryOptions({
    queryKey: ["cash-session", tenantId, userId],
    queryFn: (): Promise<CashSession | null> => withOfflineCopy(`cash-session:${tenantId}:${userId}`, async () => {
      const { data, error } = await supabase
        .from("cash_sessions")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("opened_by", userId)
        .eq("status", "open")
        .maybeSingle();
      if (error) throw error;
      return data;
    }),
  });
