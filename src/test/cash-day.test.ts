import { describe, expect, it } from "vitest";
import { isFromPreviousDay } from "@/lib/cash-day";

describe("isFromPreviousDay", () => {
  const now = new Date(2026, 10, 17, 9, 30);
  it("flags a cash session opened yesterday", () => {
    expect(isFromPreviousDay(new Date(2026, 10, 16, 18, 0), now)).toBe(true);
  });
  it("does not flag a cash session opened earlier today", () => {
    expect(isFromPreviousDay(new Date(2026, 10, 17, 0, 5), now)).toBe(false);
  });
});
