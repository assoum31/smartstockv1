import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

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
