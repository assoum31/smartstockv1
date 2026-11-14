import { useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Globe } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { onlineOrdersQuery } from "@/lib/online-orders";

/** Live banner on the POS: new online orders appear instantly for every seller. */
export function OnlineOrdersAlert({ tenantId }: { tenantId: string }) {
  const qc = useQueryClient();
  const { data = [] } = useQuery(onlineOrdersQuery(tenantId));
  useEffect(() => {
    const ch = supabase
      .channel(`orders-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "online_orders", filter: `tenant_id=eq.${tenantId}` }, (p) => {
        if (p.eventType === "INSERT") toast.success("طلبية أونلاين جديدة!");
        void qc.invalidateQueries({ queryKey: ["online-orders", tenantId] });
      })
      .subscribe();
    return () => void supabase.removeChannel(ch);
  }, [tenantId, qc]);
  const n = data.filter((o) => o.status === "new").length;
  if (!n) return null;
  return (
    <Link to="/orders" className="surface-card flex items-center gap-3 border-primary/50 bg-primary/10 p-3 font-bold">
      <Globe className="h-5 w-5 text-primary" />
      <span className="flex-1">لديك {n} طلبية أونلاين جديدة — اتصل بالزبون وأكّدها</span>
    </Link>
  );
}
