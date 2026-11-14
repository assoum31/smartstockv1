import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type OnlineOrder = Tables<"online_orders"> & { items: Tables<"online_order_items">[] };

export const onlineOrdersQuery = (tenantId: string) =>
  queryOptions({
    queryKey: ["online-orders", tenantId],
    queryFn: async (): Promise<OnlineOrder[]> => {
      const { data, error } = await supabase
        .from("online_orders")
        .select("*, items:online_order_items(*)")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw new Error(error.message);
      return data as OnlineOrder[];
    },
  });

export const ORDER_STATUS: Record<string, string> = { new: "جديدة", confirmed: "مؤكدة", done: "مسلّمة", cancelled: "ملغاة" };

/** wa.me needs international digits; Algerian 0XXXXXXXXX becomes 213XXXXXXXXX. */
export function waLink(num: string) {
  let d = num.replace(/\D/g, "");
  if (d.startsWith("0")) d = "213" + d.slice(1);
  return `https://wa.me/${d}`;
}
