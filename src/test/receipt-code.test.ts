import { describe, expect, it } from "vitest";
import { parseTicketCode, ticketCode } from "@/lib/receipt-code";

describe("ticket code", () => {
  it("prints ticket 12 as T0012", () => expect(ticketCode(12)).toBe("T0012"));
  it("reads scanned or typed codes back to the number", () => {
    expect(parseTicketCode("T0012")).toBe(12);
    expect(parseTicketCode(" 12 ")).toBe(12);
    expect(parseTicketCode("RC0003")).toBeNull();
  });
});
