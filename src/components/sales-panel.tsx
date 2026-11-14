import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Camera, Download, Plus, Printer, Receipt, Trash2, Upload, X } from "lucide-react";
import { downloadWorkbook, readSheetAsText } from "@/lib/excel";
import { parseSalesRows } from "@/lib/inventory-rules";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BarcodeScanner } from "@/components/barcode-scanner";
import {
  productsQuery,
  salesTicketsQuery,
  type InventorySession,
  type SalesTicket,
  type SalesTicketItem,
  type SnapshotRow,
} from "@/lib/queries";
import { errorText, formatDateTime, formatQty } from "@/lib/messages";

const money = (n: number) =>
  new Intl.NumberFormat("fr-DZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

interface DraftLine {
  barcode: string;
  product_name: string;
  quantity: number;
  unit_price: number;
}

export function useSalesTickets(session: InventorySession) {
  const queryClient = useQueryClient();
  const query = useSuspenseQuery(salesTicketsQuery(session.id));
  const isActive = session.status === "active";
  useEffect(() => {
    if (!isActive) return;
    const channel = supabase
      .channel(`sales-${session.id}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "sales_tickets",
          filter: `session_id=eq.${session.id}`,
        },
        () => void queryClient.invalidateQueries({ queryKey: ["sales-tickets", session.id] }),
      )
      .subscribe();
    return () => void supabase.removeChannel(channel);
  }, [isActive, session.id, queryClient]);
  return query.data;
}

export function SalesPanel({
  session,
  snapshot,
  storeName,
  tickets,
  items,
  canSell,
}: {
  session: InventorySession;
  snapshot: SnapshotRow[];
  storeName: string;
  tickets: SalesTicket[];
  items: SalesTicketItem[];
  canSell: boolean;
}) {
  const [creating, setCreating] = useState(false);
  const [viewing, setViewing] = useState<SalesTicket | null>(null);
  const itemsByTicket = useMemo(() => {
    const m = new Map<string, SalesTicketItem[]>();
    for (const i of items) m.set(i.ticket_id, [...(m.get(i.ticket_id) ?? []), i]);
    return m;
  }, [items]);
  const totalAmount = tickets.reduce((n, t) => n + Number(t.total_amount), 0);
  const totalQty = items.reduce((n, i) => n + Number(i.quantity), 0);

  return (
    <div className="space-y-4">
      <div className="surface-card flex flex-wrap items-center gap-4 p-4">
        <div>
          <p className="text-xs text-muted-foreground">عدد البونات</p>
          <p className="font-mono text-xl font-bold">{tickets.length}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">القطع المباعة</p>
          <p className="font-mono text-xl font-bold">{formatQty(totalQty)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">مجموع المبيعات</p>
          <p className="font-mono text-xl font-bold">{money(totalAmount)} دج</p>
        </div>
        {canSell && <ImportSalesButtons session={session} />}
        {canSell && (
          <Button onClick={() => setCreating(true)}>
            <Plus />
            بون بيع جديد
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        تُخصم المبيعات من المحسوب فقط إذا كان المنتج قد عُدّ وبيع بعد عدّه. المنتج غير المحسوب لا
        يُخصم منه شيء. في ملف Excel، الأسطر التي تحمل نفس رقم البون تصبح بوناً واحداً.
      </p>

      <div className="surface-card divide-y">
        {tickets.length === 0 && (
          <p className="p-10 text-center text-muted-foreground">لا توجد مبيعات في هذه الجلسة.</p>
        )}
        {tickets.map((t) => {
          const lines = itemsByTicket.get(t.id) ?? [];
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setViewing(t)}
              className="flex w-full items-center gap-3 p-4 text-start hover:bg-muted/40"
            >
              <Receipt className="h-5 w-5 text-primary" />
              <div className="flex-1">
                <p className="font-bold">بون رقم {String(t.ticket_number).padStart(4, "0")}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDateTime(t.created_at)} · {t.created_by_name} · {lines.length} منتج
                </p>
              </div>
              <span className="font-mono font-bold">{money(Number(t.total_amount))} دج</span>
            </button>
          );
        })}
      </div>

      {creating && (
        <NewTicketDialog session={session} snapshot={snapshot} onClose={() => setCreating(false)} />
      )}
      {viewing && (
        <TicketDialog
          ticket={viewing}
          lines={itemsByTicket.get(viewing.id) ?? []}
          storeName={storeName}
          canDelete={canSell}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
}

function NewTicketDialog({
  session,
  snapshot,
  onClose,
}: {
  session: InventorySession;
  snapshot: SnapshotRow[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [barcode, setBarcode] = useState("");
  const [name, setName] = useState("");
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("");
  const [notes, setNotes] = useState("");
  const [camera, setCamera] = useState(false);
  const [saving, setSaving] = useState(false);
  const byBarcode = useMemo(() => new Map(snapshot.map((s) => [s.barcode, s])), [snapshot]);

  const pick = (code: string) => {
    const c = code.trim();
    setBarcode(c);
    const p = byBarcode.get(c);
    if (p) setName(p.product_name);
  };

  const add = () => {
    const q = Number(qty.replace(",", "."));
    const pr = Number((price || "0").replace(",", "."));
    if (!barcode.trim()) return void toast.error("أدخل الباركود");
    if (!Number.isFinite(q) || q <= 0) return void toast.error("كمية غير صالحة");
    if (!Number.isFinite(pr) || pr < 0) return void toast.error("سعر غير صالح");
    setLines((l) => [
      ...l,
      {
        barcode: barcode.trim(),
        product_name: name.trim() || barcode.trim(),
        quantity: q,
        unit_price: pr,
      },
    ]);
    setBarcode("");
    setName("");
    setQty("1");
    setPrice("");
  };

  const total = lines.reduce((n, l) => n + l.quantity * l.unit_price, 0);

  const save = async () => {
    if (lines.length === 0) return void toast.error("البون فارغ");
    setSaving(true);
    const { error } = await supabase.rpc("create_sales_ticket", {
      _session_id: session.id,
      _items: lines as never,
      _notes: notes,
    });
    setSaving(false);
    if (error) return void toast.error(errorText(error));
    toast.success("تم حفظ البون");
    void queryClient.invalidateQueries({ queryKey: ["sales-tickets", session.id] });
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>بون بيع جديد (Bon de sortie)</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {camera && (
            <BarcodeScanner
              onDetected={(c) => {
                pick(c);
                setCamera(false);
              }}
            />
          )}
          <div className="flex gap-2">
            <Input
              placeholder="الباركود"
              value={barcode}
              onChange={(e) => pick(e.target.value)}
              className="font-mono"
              dir="ltr"
            />
            <Button
              variant="outline"
              size="icon"
              onClick={() => setCamera((c) => !c)}
              aria-label="الكاميرا"
            >
              <Camera />
            </Button>
          </div>
          <Input placeholder="اسم المنتج" value={name} onChange={(e) => setName(e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">الكمية</Label>
              <Input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">سعر الوحدة (دج)</Label>
              <Input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
          </div>
          <Button variant="outline" className="w-full" onClick={add}>
            <Plus />
            إضافة للبون
          </Button>

          {lines.length > 0 && (
            <div className="divide-y rounded-lg border">
              {lines.map((l, i) => (
                <div key={i} className="flex items-center gap-2 p-2 text-sm">
                  <div className="flex-1">
                    <p className="font-bold">{l.product_name}</p>
                    <p className="font-mono text-xs text-muted-foreground" dir="ltr">
                      {l.barcode} · {formatQty(l.quantity)} × {money(l.unit_price)}
                    </p>
                  </div>
                  <span className="font-mono">{money(l.quantity * l.unit_price)}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}
                    aria-label="حذف"
                  >
                    <X />
                  </Button>
                </div>
              ))}
              <div className="flex justify-between p-2 font-bold">
                <span>المجموع</span>
                <span className="font-mono">{money(total)} دج</span>
              </div>
            </div>
          )}
          <Input
            placeholder="ملاحظة (اسم الزبون...)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <Button className="w-full" disabled={saving || lines.length === 0} onClick={save}>
            <Receipt />
            حفظ البون
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TicketDialog({
  ticket,
  lines,
  storeName,
  canDelete,
  onClose,
}: {
  ticket: SalesTicket;
  lines: SalesTicketItem[];
  storeName: string;
  canDelete: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const remove = async () => {
    if (!confirm("حذف هذا البون؟ ستعود كمياته إلى المخزون المتوقع.")) return;
    const { error } = await supabase.rpc("delete_sales_ticket", { _ticket_id: ticket.id });
    if (error) return void toast.error(errorText(error));
    void queryClient.invalidateQueries({ queryKey: ["sales-tickets", ticket.session_id] });
    onClose();
  };
  const d = new Date(ticket.created_at);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="sr-only">بون</DialogTitle>
        </DialogHeader>
        <div
          id="ticket-print"
          className="rounded-md border border-dashed bg-card p-4 font-mono text-sm"
        >
          <p className="text-center font-sans text-lg font-bold">{storeName}</p>
          <p className="text-center font-sans text-xs text-muted-foreground">
            بون خروج — Bon de sortie
          </p>
          <div className="my-3 border-t border-dashed" />
          <div className="flex justify-between text-xs">
            <span>رقم: {String(ticket.ticket_number).padStart(4, "0")}</span>
            <span dir="ltr">
              {d.toLocaleDateString("fr-FR")}{" "}
              {d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
          <p className="font-sans text-xs">البائع: {ticket.created_by_name}</p>
          <div className="my-3 border-t border-dashed" />
          {lines.map((l) => (
            <div key={l.id} className="mb-2">
              <p className="font-sans font-bold">{l.product_name}</p>
              <div className="flex justify-between text-xs" dir="ltr">
                <span>
                  {formatQty(Number(l.quantity))} × {money(Number(l.unit_price))}
                </span>
                <span>{money(Number(l.quantity) * Number(l.unit_price))}</span>
              </div>
              <p className="text-[10px] text-muted-foreground" dir="ltr">
                {l.barcode}
              </p>
            </div>
          ))}
          <div className="my-3 border-t border-dashed" />
          <div className="flex justify-between font-sans text-base font-bold">
            <span>المجموع</span>
            <span className="font-mono">{money(Number(ticket.total_amount))} دج</span>
          </div>
          {ticket.notes && <p className="mt-2 font-sans text-xs">ملاحظة: {ticket.notes}</p>}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => window.print()}>
            <Printer />
            طباعة
          </Button>
          {canDelete && (
            <Button variant="outline" className="text-destructive" onClick={remove}>
              <Trash2 />
              حذف
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ImportSalesButtons({ session }: { session: InventorySession }) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const { data: products = [] } = useQuery(productsQuery(session.tenant_id));

  const onFile = async (file: File) => {
    setBusy(true);
    try {
      const raw = await readSheetAsText(file);
      const prices = new Map(
        products.map((p) => [p.barcode, { name: p.name, price: Number(p.selling_price) || 0 }]),
      );
      const { tickets, errors } = parseSalesRows(raw, prices);
      if (errors.length) toast.warning(`${errors.length} سطر مرفوض (السطر ${errors[0]!.line}: ${errors[0]!.message})`);
      let done = 0;
      for (const t of tickets) {
        const { error } = await supabase.rpc("import_sales_ticket", {
          _session_id: session.id,
          _items: t.items as never,
          _notes: t.notes ?? (t.ref.startsWith("__") ? "" : `Excel bon ${t.ref}`),
          ...(t.sold_at ? { _sold_at: t.sold_at } : {}),
        });
        if (error) {
          toast.error(`توقف بعد ${done} بون: ${errorText(error)}`);
          break;
        }
        done++;
      }
      if (done) toast.success(`تم استيراد ${done} بون`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذرت قراءة الملف.");
    } finally {
      setBusy(false);
      void queryClient.invalidateQueries({ queryKey: ["sales-tickets", session.id] });
    }
  };

  return (
    <div className="ms-auto flex flex-wrap gap-2">
      <Button
        variant="outline"
        onClick={() =>
          downloadWorkbook("smartstock-modele-ventes.xlsx", [
            {
              name: "ventes",
              headers: ["ticket", "date", "barcode", "name", "quantity", "unit_price", "note"],
              rows: [
                [1, "2026-11-08 10:30", "0061112457800", "زيت زيتون 1L", 2, 1000, "زبون 1"],
                [1, "2026-11-08 10:30", "0061112457801", "سكر 1kg", 1, 150, ""],
                [2, "2026-11-08 11:05", "0061112457800", "زيت زيتون 1L", 1, 1000, ""],
              ],
              textColumns: [2],
            },
          ])
        }
      >
        <Download />
        نموذج المبيعات
      </Button>
      <Button variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}>
        <Upload />
        {busy ? "جارٍ الاستيراد..." : "استيراد مبيعات Excel"}
      </Button>
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onFile(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}
