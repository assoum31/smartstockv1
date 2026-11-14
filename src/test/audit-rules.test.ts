import { describe, expect, it } from "vitest";
import { auditSearchIndex, filterAuditIndex, normalizeAuditCode } from "../lib/audit-rules";

const logs = [
  { barcode: "MAIN", product_name: "Milk", location: "A1", audit_code: "0012", audited_at: "2026-11-14" },
  { barcode: "OTHER", product_name: "Rice", location: "B2", audit_code: null, audited_at: null },
];
const index = auditSearchIndex(logs, [{ barcode: "MAIN", name: "Milk", alt_barcodes: ["SECOND", "THIRD"] }]);
describe("auditor search and IDs", () => {
  it("searches shelves", () => expect(filterAuditIndex(index, "a1")).toEqual([logs[0]]));
  it("searches every alternative barcode", () => {
    expect(filterAuditIndex(index, "SECOND")).toEqual([logs[0]]);
    expect(filterAuditIndex(index, "THIRD")).toEqual([logs[0]]);
  });
  it("searches product names", () => expect(filterAuditIndex(index, "rice")).toEqual([logs[1]]));
  it("finds 0012 by typing 12 or Arabic digits", () => {
    expect(filterAuditIndex(index, "12")).toEqual([logs[0]]);
    expect(filterAuditIndex(index, "١٢")).toEqual([logs[0]]);
  });
  it("formats a manually typed 12 as 0012", () => expect(normalizeAuditCode("12")).toBe("0012"));
  it("leaves optional IDs blank", () => expect(normalizeAuditCode(" ")).toBe(""));
  it("never truncates IDs above 9999", () => expect(normalizeAuditCode("10000")).toBe("10000"));
  it("shows only unaudited products when enabled", () => expect(filterAuditIndex(index, "", "", true)).toEqual([logs[1]]));
  it("combines shelf and text filters", () => expect(filterAuditIndex(index, "Milk", "B2")).toEqual([]));
});