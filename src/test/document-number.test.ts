import { describe, expect, it } from "vitest";
import { documentNumber, formatDocumentNumber, parseAnnualSaleNumber } from "@/lib/document-number";

describe("annual per-type document references", () => {
  it("uses the requested seven-digit BR format", () => expect(formatDocumentNumber("receipt", 1, 2026)).toBe("BR 0000001/2026"));
  it("uses the requested invoice format", () => expect(formatDocumentNumber("invoice", 1, 2026)).toBe("F N 0000001/2026"));
  it("separates sales and each return kind", () => {
    expect(formatDocumentNumber("sale", 1, 2026)).toBe("BV 0000001/2026");
    expect(formatDocumentNumber("customer_return", 1, 2026)).toBe("RC 0000001/2026");
    expect(formatDocumentNumber("supplier_return", 1, 2026)).toBe("RF 0000001/2026");
  });
  it("selects the independent invoice sequence", () => expect(documentNumber("invoice", {document_year: 2026, document_sequence: 7, invoice_sequence: 2}, 98)).toBe("F N 0000002/2026"));
  it("does not invent annual references for old device caches", () => expect(documentNumber("sale", {}, 12)).toBe("BV-0012"));
  it("parses the annual sale reference including its year", () => expect(parseAnnualSaleNumber("BV 0000001/2026")).toEqual({sequence: 1, year: 2026}));
  it("rejects other documents and zero references in sale lookup", () => {
    expect(parseAnnualSaleNumber("BR 0000001/2026")).toBeNull();
    expect(parseAnnualSaleNumber("BV 0000000/2026")).toBeNull();
  });
});