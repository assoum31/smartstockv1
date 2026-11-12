import { queryOptions, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { money } from "@/lib/pos-queries";
import { codesHtml } from "@/lib/receipt-code";

export interface StoreSettings {
  tenant_id: string;
  company_name: string | null;
  logo: string | null;
  phone: string | null;
  address: string | null;
  email: string | null;
  rc: string | null;
  nif: string | null;
  nis: string | null;
  ai: string | null;
  ticket_footer: string | null;
  invoice_footer: string | null;
  ticket_width: number;
  label_width: number;
  label_height: number;
}

export const defaultSettings = (tenantId: string): StoreSettings => ({
  tenant_id: tenantId,
  company_name: null, logo: null, phone: null, address: null, email: null,
  rc: null, nif: null, nis: null, ai: null, ticket_footer: null, invoice_footer: null,
  ticket_width: 80, label_width: 40, label_height: 20,
});

export const storeSettingsQuery = (tenantId: string) =>
  queryOptions({
    queryKey: ["store-settings", tenantId],
    queryFn: async (): Promise<StoreSettings> => {
      const { data, error } = await supabase.from("store_settings").select("*").eq("tenant_id", tenantId).maybeSingle();
      if (error) throw error;
      return data ? ({ ...defaultSettings(tenantId), ...data, label_width: Number(data.label_width), label_height: Number(data.label_height) } as StoreSettings) : defaultSettings(tenantId);
    },
    staleTime: 60_000,
  });

export function useStoreSettings(tenantId: string | undefined) {
  return useQuery({ ...storeSettingsQuery(tenantId ?? "none"), enabled: !!tenantId }).data ?? defaultSettings(tenantId ?? "");
}

export const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Header block (logo + company + legal ids) shared by tickets and A4 documents. */
export function companyHeader(s: StoreSettings, fallbackName: string, compact: boolean) {
  const ids = [s.rc && `RC: ${s.rc}`, s.nif && `NIF: ${s.nif}`, s.nis && `NIS: ${s.nis}`, s.ai && `AI: ${s.ai}`].filter(Boolean).join(" · ");
  return `<div class="hdr">${s.logo ? `<img src="${s.logo}" class="logo"/>` : ""}<div><h2>${esc(s.company_name || fallbackName)}</h2>
  ${s.address ? `<p>${esc(s.address)}</p>` : ""}${s.phone || s.email ? `<p>${esc([s.phone, s.email].filter(Boolean).join(" · "))}</p>` : ""}
  ${ids ? `<p class="${compact ? "sm" : ""}">${esc(ids)}</p>` : ""}</div></div>`;
}

export interface TicketLine { product_name: string; quantity: number; unit_price: number }

/** Thermal ticket (58/60/80 mm) using the store's saved width. */
export function ticketHtml(s: StoreSettings, fallbackName: string, opts: {
  title: string; date: string; lines: TicketLine[]; extra?: string | undefined; total: number; code?: string | undefined;
}) {
  const w = s.ticket_width || 80;
  const inner = w - 6;
  const fs = w <= 60 ? 10 : 12;
  const rows = opts.lines.map((l) => `<tr><td>${esc(l.product_name)}<br/><small>${l.quantity} × ${money(l.unit_price)}</small></td><td class="r">${money(l.quantity * l.unit_price)}</td></tr>`).join("");
  return `<!doctype html><html dir="rtl"><head><meta charset="utf-8"/><title>${esc(opts.title)}</title><style>
  @page{size:${w}mm auto;margin:2mm 3mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;width:${inner}mm;margin:0 auto;font-size:${fs}px}
  table{width:100%;border-collapse:collapse}td{padding:2px 0;border-bottom:1px dashed #999;vertical-align:top;word-break:break-word}.r{text-align:left;white-space:nowrap}
  h2,p{text-align:center;margin:3px 0}h2{font-size:${fs + 3}px}.hdr{text-align:center}.logo{max-width:${Math.round(inner * 0.6)}mm;max-height:18mm}.sm{font-size:${fs - 2}px}
  svg{max-width:100%}</style></head><body>${companyHeader(s, fallbackName, true)}
  <p><b>${esc(opts.title)}</b></p><p>${esc(opts.date)}</p><table>${rows}</table>${opts.extra ?? ""}
  <h2>المجموع: ${money(opts.total)} دج</h2>${opts.code ? codesHtml(opts.code) : ""}<p>${esc(s.ticket_footer || "شكراً لزيارتكم")}</p></body></html>`;
}

/** Professional A4 document (goods receipt / invoice). */
export function a4DocHtml(s: StoreSettings, fallbackName: string, opts: {
  title: string; number: string; date: string; party?: string | null; reference?: string | null; notes?: string | null;
  lines: { barcode: string; product_name: string; quantity: number; price: number }[];
}) {
  const total = opts.lines.reduce((n, l) => n + l.quantity * l.price, 0);
  const rows = opts.lines.map((l, i) => `<tr><td>${i + 1}</td><td dir="ltr">${esc(l.barcode)}</td><td>${esc(l.product_name)}</td><td>${l.quantity}</td><td>${money(l.price)}</td><td>${money(l.quantity * l.price)}</td></tr>`).join("");
  return `<!doctype html><html dir="rtl"><head><meta charset="utf-8"/><title>${esc(opts.title)} ${esc(opts.number)}</title><style>
  @page{size:A4;margin:14mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:12px;color:#111}
  .hdr{display:flex;gap:14px;align-items:center;border-bottom:2px solid #111;padding-bottom:10px}.hdr h2{margin:0 0 4px;font-size:20px}.hdr p{margin:2px 0;color:#444}
  .logo{max-height:70px;max-width:160px}.meta{display:flex;justify-content:space-between;margin:16px 0}.box{border:1px solid #bbb;border-radius:6px;padding:8px 12px;min-width:45%}
  h1{text-align:center;font-size:18px;margin:16px 0 4px;letter-spacing:1px}table{width:100%;border-collapse:collapse;margin-top:8px}
  th{background:#eee;border:1px solid #999;padding:6px}td{border:1px solid #bbb;padding:5px 6px;text-align:center}td:nth-child(3){text-align:right}
  .tot{margin-top:10px;text-align:left;font-size:15px;font-weight:bold}.sig{display:flex;justify-content:space-between;margin-top:50px}
  .sig div{width:40%;border-top:1px solid #333;text-align:center;padding-top:6px}.foot{margin-top:30px;text-align:center;color:#555;font-size:11px}
  </style></head><body>${companyHeader(s, fallbackName, false)}
  <h1>${esc(opts.title)} N° ${esc(opts.number)}</h1>
  <div class="meta"><div class="box"><b>التاريخ:</b> ${esc(opts.date)}${opts.reference ? `<br/><b>المرجع:</b> ${esc(opts.reference)}` : ""}</div>
  <div class="box"><b>المورد:</b> ${esc(opts.party || "—")}${opts.notes ? `<br/><b>ملاحظات:</b> ${esc(opts.notes)}` : ""}</div></div>
  <table><thead><tr><th>#</th><th>الباركود</th><th>التسمية</th><th>الكمية</th><th>السعر</th><th>المجموع</th></tr></thead><tbody>${rows}</tbody></table>
  <p class="tot">المجموع الكلي: ${money(total)} دج</p>
  <div class="sig"><div>توقيع المستلم</div><div>توقيع المورد</div></div>
  ${s.invoice_footer ? `<p class="foot">${esc(s.invoice_footer)}</p>` : ""}</body></html>`;
}

export function openPrint(html: string, features = "") {
  const w = window.open("", "_blank", features);
  if (!w) return false;
  w.document.write(html.replace("</body>", `<script>window.onload=()=>{setTimeout(()=>window.print(),250)}</script></body>`));
  w.document.close();
  w.focus();
  return true;
}
