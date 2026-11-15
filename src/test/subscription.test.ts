import { describe, expect, it } from "vitest";
import { daysLeft, extendSubscription, g50Summary, isExpired, memberLimitReason, normalizeFeatures } from "@/lib/subscription";

const now = new Date("2026-11-15T00:00:00Z");
describe("subscription rules", () => {
  it("extends from today when expired", () => {
    expect(extendSubscription("2026-11-01T00:00:00Z", 30, now)).toBe("2026-12-15T00:00:00.000Z");
  });
  it("extends from current end when still active", () => {
    expect(extendSubscription("2026-11-20T00:00:00Z", 10, now)).toBe("2026-11-30T00:00:00.000Z");
  });
  it("expiry and days left", () => {
    expect(isExpired("2026-11-14T00:00:00Z", now)).toBe(true);
    expect(isExpired(null, now)).toBe(false);
    expect(daysLeft("2026-11-20T00:00:00Z", now)).toBe(5);
  });
  it("missing features default to on", () => {
    expect(normalizeFeatures({ sales: false }).sales).toBe(false);
    expect(normalizeFeatures({}).inventory).toBe(true);
  });
  it("member limits", () => {
    expect(memberLimitReason({ managers: 1, total: 3 }, { max_managers: 1, max_members: 10 }, "manager")).toBe("limit_managers");
    expect(memberLimitReason({ managers: 1, total: 3 }, { max_managers: 1, max_members: 10 }, "cashier")).toBeNull();
    expect(memberLimitReason({ managers: 0, total: 5 }, { max_managers: null, max_members: 5 }, "worker")).toBe("limit_members");
  });
  it("G50 at 19% TVA", () => {
    const s = g50Summary({ salesTtc: 119000, purchasesTtc: 59500, tvaRate: 19, tapRate: 0 });
    expect(s.salesHt).toBe(100000);
    expect(s.tvaCollected).toBe(19000);
    expect(s.tvaDeductible).toBe(9500);
    expect(s.tvaDue).toBe(9500);
  });
});
