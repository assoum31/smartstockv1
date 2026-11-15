export type DocumentKind = "receipt" | "invoice" | "sale" | "customer_return" | "supplier_return";

const prefixes: Record<DocumentKind, string> = {
  receipt: "BR", invoice: "F N", sale: "BV", customer_return: "RC", supplier_return: "RF",
};

export interface NumberedDocument {
  document_year?: number | null;
  document_sequence?: number | null;
  invoice_sequence?: number | null;
}

export function formatDocumentNumber(kind: DocumentKind, sequence: number, year: number): string {
  return `${prefixes[kind]} ${String(sequence).padStart(7, "0")}/${year}`;
}

export function documentNumber(kind: DocumentKind, row: NumberedDocument, legacy: number): string {
  const sequence = kind === "invoice" ? row.invoice_sequence : row.document_sequence;
  if (sequence != null && row.document_year != null) return formatDocumentNumber(kind, sequence, row.document_year);
  // Legacy offline caches and unsynchronized tickets must not invent an official number.
  return `${prefixes[kind]}-${String(legacy).padStart(4, "0")}`;
}

export function parseAnnualSaleNumber(raw: string): { sequence: number; year: number } | null {
  const match = raw.trim().toUpperCase().match(/^BV\s+(\d{1,7})\/(\d{4})$/);
  if (!match) return null;
  const sequence = Number(match[1]);
  return sequence > 0 ? { sequence, year: Number(match[2]) } : null;
}