import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { errorText } from "@/lib/messages";

type Req = { id: string; log_id: string | null; barcode: string; product_name: string; requested_by_name: string };

/** Top-of-screen alert for recounts the manager asked this worker to redo. */
export function RecountBanner({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const key = ["recounts", userId];
  const { data: reqs = [] } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recount_requests")
        .select("id, log_id, barcode, product_name, requested_by_name")
        .eq("assigned_to", userId)
        .eq("status", "pending")
        .order("created_at");
      if (error) throw error;
      return data as Req[];
    },
  });
  useEffect(() => {
    const ch = supabase
      .channel(`recounts-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "recount_requests" }, () => {
        void qc.invalidateQueries({ queryKey: key });
      })
      .subscribe();
    return () => void supabase.removeChannel(ch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const [open, setOpen] = useState<Req | null>(null);
  const [f, setF] = useState({ barcode: "", name: "", qty: "", location: "", notes: "" });
  const [busy, setBusy] = useState(false);

  const start = async (r: Req) => {
    let location = "", notes = "", qty = "";
    if (r.log_id) {
      const { data } = await supabase.from("inventory_logs").select("location, notes, counted_quantity").eq("id", r.log_id).maybeSingle();
      location = data?.location ?? ""; notes = data?.notes ?? ""; qty = data ? String(data.counted_quantity) : "";
    }
    setF({ barcode: r.barcode, name: r.product_name, qty, location, notes });
    setOpen(r);
  };

  const save = async () => {
    if (!open) return;
    const qty = Number(f.qty.replace(",", "."));
    if (!f.barcode.trim()) return void toast.error("الباركود إجباري");
    if (!Number.isFinite(qty) || qty < 0) return void toast.error("كمية غير صالحة");
    setBusy(true);
    const { error } = await supabase.rpc("complete_recount", {
      _req_id: open.id, _barcode: f.barcode, _name: f.name, _qty: qty, _location: f.location, _notes: f.notes,
    });
    setBusy(false);
    if (error) return void toast.error(errorText(error));
    toast.success("تم حفظ إعادة العد");
    setOpen(null);
    void qc.invalidateQueries();
  };

  if (reqs.length === 0) return null;
  return (
    <>
      <div className="sticky top-0 z-40 space-y-1 bg-warning px-3 py-2 text-warning-foreground shadow-lift">
        {reqs.map((r) => (
          <div key={r.id} className="mx-auto flex max-w-7xl items-center gap-2 text-sm">
            <RotateCcw className="h-4 w-4 shrink-0 animate-pulse" />
            <p className="min-w-0 flex-1 truncate font-bold">
              أعد عدّ: {r.product_name} <span className="font-mono text-xs opacity-80">{r.barcode}</span>
              {r.requested_by_name && <span className="text-xs font-normal opacity-80"> — طلب {r.requested_by_name}</span>}
            </p>
            <Button size="sm" variant="secondary" className="h-8 shrink-0" onClick={() => start(r)}>أعد العد</Button>
          </div>
        ))}
      </div>
      <Dialog open={Boolean(open)} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="text-right sm:text-right"><DialogTitle>إعادة العد</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>الباركود *</Label><Input dir="ltr" value={f.barcode} onChange={(e) => setF({ ...f, barcode: e.target.value })} /></div>
            <div><Label>التسمية</Label><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
            <div><Label>الكمية *</Label><Input inputMode="decimal" autoFocus value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} className="font-mono text-lg" /></div>
            <div><Label>الموقع</Label><Input value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} /></div>
            <div><Label>ملاحظة</Label><Input value={f.notes} placeholder="اختياري" onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
            <Button className="w-full" disabled={busy} onClick={save}>حفظ العد الجديد</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
