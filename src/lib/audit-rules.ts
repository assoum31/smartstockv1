import { findProductByBarcode } from "./inventory-rules";

/** Keep IDs optional; normalize numeric input without truncating long IDs. */
export function normalizeAuditCode(value: string): string {
  const code = value.trim().replace(/[٠-٩۰-۹]/g, (digit) =>
    String(digit.charCodeAt(0) - (digit <= "٩" ? 0x0660 : 0x06f0)),
  );
  return /^\d+$/.test(code) ? code.replace(/^0+(?=\d)/, "").padStart(4, "0") : code;
}

type AuditSearchLog = {
  barcode: string;
  product_name: string;
  audit_code: string | null;
  location: string | null;
  audited_at: string | null;
};
type AuditSearchProduct = {
  barcode: string;
  alt_barcodes?: string[] | null;
  name: string;
  famille?: string | null;
  model?: string | null;
};

export function auditSearchIndex<T extends AuditSearchLog>(logs: T[], products: AuditSearchProduct[]) {
  return logs.map((log) => {
    const product = findProductByBarcode(products, log.barcode);
    return {
      log,
      text: [log.barcode, log.product_name, log.location, log.audit_code, product?.name,
        product?.famille, product?.model, ...(product?.alt_barcodes ?? [])].join(" ").toLowerCase(),
    };
  });
}

export function filterAuditIndex<T extends AuditSearchLog>(
  index: { log: T; text: string }[], query: string, shelf = "", unauditedOnly = false,
): T[] {
  const search = query.trim().toLowerCase();
  const numericId = /^\d+$/.test(normalizeAuditCode(search)) && search !== "";
  return index.filter(({ log, text }) =>
    (!unauditedOnly || !log.audited_at) &&
    (!shelf || log.location === shelf) &&
    (!search || text.includes(search) ||
      (numericId && normalizeAuditCode(log.audit_code ?? "") === normalizeAuditCode(search))),
  ).map(({ log }) => log);
}