import { useEffect, useState } from "react";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const SEEN_KEY = "smartstock_notes_seen_at";

/** Worker notes written during counting, newest first. */
export const notesQuery = (tenantId: string) =>
  queryOptions({
    queryKey: ["notes", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_logs")
        .select("id, barcode, product_name, counted_quantity, location, counted_by_name, counted_at, notes, session_id")
        .eq("tenant_id", tenantId)
        .not("notes", "is", null)
        .neq("notes", "")
        .order("counted_at", { ascending: false })
        .limit(300);
      if (error) throw new Error(error.message);
      return data;
    },
  });

/** Keeps the notes list live. */
export function useLiveNotes(tenantId: string) {
  const queryClient = useQueryClient();
  useEffect(() => {
    const channel = supabase
      .channel(`notes-${tenantId}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "inventory_logs", filter: `tenant_id=eq.${tenantId}` },
        () => void queryClient.invalidateQueries({ queryKey: ["notes", tenantId] }),
      )
      .subscribe();
    return () => void supabase.removeChannel(channel);
  }, [tenantId, queryClient]);
  return useQuery(notesQuery(tenantId));
}

export function useSeenAt() {
  const [seenAt, setSeenAt] = useState<string>("");
  useEffect(() => setSeenAt(localStorage.getItem(SEEN_KEY) ?? ""), []);
  const markSeen = () => {
    const now = new Date().toISOString();
    localStorage.setItem(SEEN_KEY, now);
    setSeenAt(now);
  };
  return { seenAt, markSeen };
}
