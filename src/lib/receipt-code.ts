import JsBarcode from "jsbarcode";
import QRCode from "qrcode";

/** Code printed on a sale ticket: "T" + 4-digit number (e.g. T0012). */
export const ticketCode = (n: number | string) => `T${String(n).padStart(4, "0")}`;
export const returnCode = (kind: "customer" | "supplier", n: number | string) =>
  `${kind === "customer" ? "RC" : "RF"}${String(n).padStart(4, "0")}`;

/** Reads a typed/scanned value ("T0012", "t12", "0012", "12") into a ticket number. */
export function parseTicketCode(raw: string): number | null {
  const m = raw.trim().toUpperCase().match(/^T?0*(\d{1,9})$/);
  return m ? Number(m[1]) : null;
}

function qrSvg(text: string, size = 90): string {
  const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
  const n = qr.modules.size;
  let d = "";
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.modules.get(x, y)) d += `M${x} ${y}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 ${n + 4} ${n + 4}" width="${size}" height="${size}"><rect x="-2" y="-2" width="${n + 4}" height="${n + 4}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}

/** HTML block with a Code128 barcode and a QR code for a printed slip. */
export function codesHtml(code: string): string {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  try {
    JsBarcode(svg, code, { format: "CODE128", height: 40, width: 1.6, fontSize: 12, margin: 0 });
  } catch {
    /* ignore */
  }
  return `<div style="display:flex;align-items:center;justify-content:center;gap:8px;margin-top:8px">${svg.outerHTML}${qrSvg(code)}</div>`;
}
