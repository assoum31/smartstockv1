import { money, type SaleTicket } from "@/lib/pos-queries";
import { codesHtml, ticketCode } from "@/lib/receipt-code";

export function printTicket(storeName: string, t: SaleTicket) {
  const w = window.open("", "_blank", "width=380,height=600");
  if (!w) return;
  const rows = t.items
    .map((l) => `<tr><td>${l.product_name}<br/><small>${l.quantity} × ${money(Number(l.unit_price))}</small></td><td style="text-align:left">${money(Number(l.quantity) * Number(l.unit_price))}</td></tr>`)
    .join("");
  w.document.write(`<html dir="rtl"><head><meta charset="utf-8"/><title>Ticket</title><style>
    body{font-family:sans-serif;width:72mm;margin:0 auto;font-size:12px}table{width:100%;border-collapse:collapse}
    td{padding:3px 0;border-bottom:1px dashed #999}h2,p{text-align:center;margin:4px 0}</style></head><body>
    <h2>${storeName}</h2><p>بون رقم ${String(t.ticket_number).padStart(4, "0")} (نسخة)</p>
    <p>${new Date(t.created_at).toLocaleString("fr-FR")}</p><table>${rows}</table>
    <h2>المجموع: ${money(Number(t.total_amount))} دج</h2>${codesHtml(ticketCode(t.ticket_number))}<p>شكراً لزيارتكم</p></body></html>`);
  w.document.close();
  w.focus();
  w.print();
}

