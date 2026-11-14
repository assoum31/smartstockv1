import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { productRowForUpdate } from "@/lib/product-form-rules";

const migration = readFileSync(
  new URL("../../drizzle/migrations/0027_security_hardening_step_3.sql", import.meta.url),
  "utf8",
);

describe("seller product update separation", () => {
  it("keeps purchase price 100 and stock 5 unchanged in a seller's direct update", () => {
    const row = { name: "Updated", purchase_price: 125, system_quantity: 99 };
    expect(productRowForUpdate(row, { purchase_price: 100, system_quantity: 5 }, false)).toEqual({
      name: "Updated",
      purchase_price: 100,
      system_quantity: 5,
    });
  });

  it("lets a manager update purchase price to 125 and stock to 99 directly", () => {
    const row = { name: "Updated", purchase_price: 125, system_quantity: 99 };
    expect(productRowForUpdate(row, { purchase_price: 100, system_quantity: 5 }, true)).toEqual(row);
  });
});

describe("database security rules", () => {
  it("limits a phone to 3 orders per 10 minutes and a store to 60 per hour", () => {
    expect(migration).toMatch(/_recent_count >= 3/);
    expect(migration).toContain("interval '10 minutes'");
    expect(migration).toMatch(/_recent_count >= 60/);
    expect(migration).toContain("interval '1 hour'");
  });

  it("guards stock, purchase price and tenant only for direct non-manager API updates", () => {
    expect(migration).toContain("current_user = 'authenticated' AND NOT public.is_manager()");
    expect(migration).toContain("NEW.system_quantity IS DISTINCT FROM OLD.system_quantity");
    expect(migration).toContain("NEW.purchase_price IS DISTINCT FROM OLD.purchase_price");
    expect(migration).toContain("NEW.tenant_id IS DISTINCT FROM OLD.tenant_id");
  });

  it("requires counted_by and session_id to match the existing inventory row for non-managers", () => {
    expect(migration).toContain("counted_by IS NOT DISTINCT FROM _counted_by");
    expect(migration).toContain("session_id IS NOT DISTINCT FROM _session_id");
    expect(migration).toContain("public.inventory_log_update_identity_ok(id, counted_by, session_id)");
  });
});
