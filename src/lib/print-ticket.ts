import { type SaleTicket } from "@/lib/pos-queries";
import { ticketCode } from "@/lib/receipt-code";
import { defaultSettings, openPrint, ticketHtml, type StoreSettings } from "@/lib/store-settings";

export function printTicket(storeName: string, t: SaleTicket, settings?: StoreSettings) {
  const s = settings ?? defaultSettings(t.tenant_id);
  openPrint(
    ticketHtml(s, storeName, {
      title: `بون رقم ${String(t.ticket_number).padStart(4, "0")} (نسخة)`,
      date: new Date(t.created_at).toLocaleString("fr-FR"),
      lines: t.items.map((l) => ({ product_name: l.product_name, quantity: Number(l.quantity), unit_price: Number(l.unit_price) })),
      total: Number(t.total_amount),
      code: ticketCode(t.ticket_number),
    }),
    "width=380,height=600",
  );
}
