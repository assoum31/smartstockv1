import { describe, expect, it } from "vitest";
import {
  chunk,
  computeVariances,
  normalizeBarcode,
  parseProductRows,
  workerProgress,
} from "@/lib/inventory-rules";
import {
  accountEmail,
  isDefaultMasterLogin,
  isValidStoreCode,
  isValidUsername,
  portalAccepts,
} from "@/lib/identity";

describe("variance is per product, not per line", () => {
  it("sums counts of the same barcode on several shelves before comparing to system stock", () => {
    const rows = computeVariances(
      [{ barcode: "111", product_name: "Huile", system_quantity: 10 }],
      [
        { barcode: "111", product_name: "Huile", counted_quantity: 3, location: "A1" },
        { barcode: "111", product_name: "Huile", counted_quantity: 4, location: "B2" },
        { barcode: "111", product_name: "Huile", counted_quantity: 1, location: "C3" },
      ],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ counted_quantity: 8, variance: 8, entries: 3 });
    expect(rows[0]!.locations).toEqual(["A1", "B2", "C3"]);
  });

  it("shows an uncounted catalog product as fully missing", () => {
    const [row] = computeVariances(
      [{ barcode: "222", product_name: "Sucre", system_quantity: 5 }],
      [],
    );
    expect(row).toMatchObject({ counted_quantity: 0, variance: 0, in_snapshot: true, entries: 0 });
  });

  it("variance = counted − sales: counted 90, sold 20 gives 70", () => {
    const [row] = computeVariances(
      [{ barcode: "9", product_name: "P", system_quantity: 100 }],
      [{ barcode: "9", product_name: "P", counted_quantity: 90, location: null }],
      [{ barcode: "9", product_name: "P", quantity: 20 }],
    );
    expect(row!.variance).toBe(70);
  });

  it("treats sales stored as negative (-20) the same as 20", () => {
    const [row] = computeVariances(
      [],
      [{ barcode: "9", product_name: "P", counted_quantity: 90, location: null }],
      [{ barcode: "9", product_name: "P", quantity: -20 }],
    );
    expect(row).toMatchObject({ sold_quantity: 20, variance: 70 });
  });

  it("treats a counted product missing from the catalog as surplus against zero", () => {
    const [row] = computeVariances(
      [],
      [{ barcode: "333", product_name: "X", counted_quantity: 2, location: null }],
    );
    expect(row).toMatchObject({ system_quantity: 0, variance: 2, in_snapshot: false });
  });
});

describe("barcodes stay text", () => {
  it("keeps leading zeros", () => {
    expect(normalizeBarcode("000123")).toBe("000123");
  });
  it("writes long numeric cells in full, never in scientific notation", () => {
    expect(normalizeBarcode(6111245780031)).toBe("6111245780031");
  });
  it("rejects rows without barcode or name and keeps the last duplicate", () => {
    const res = parseProductRows([
      { barcode: "0012", name: "A", system_quantity: "3" },
      { barcode: "", name: "B" },
      { barcode: "0099", name: "" },
      { barcode: "0012", name: "A bis", system_quantity: "4,5" },
    ]);
    expect(res.rows).toEqual([
      { barcode: "0012", name: "A bis", default_location: null, system_quantity: 4.5, purchase_price: 0, selling_price: 0 },
    ]);
    expect(res.errors.map((e) => e.line)).toEqual([3, 4]);
  });
  it("imports in batches of 500", () => {
    expect(chunk(Array.from({ length: 1201 }), 500).map((c) => c.length)).toEqual([500, 500, 201]);
  });
});

describe("accounts", () => {
  it("lets the same username exist in two stores", () => {
    expect(accountEmail("oran", "Ahmed")).not.toBe(accountEmail("alger", "ahmed"));
    expect(accountEmail("oran", " Ahmed ")).toBe("ahmed@oran.stockipro.app");
  });
  it("reserves the admin store code for the master admin", () => {
    expect(isValidStoreCode("admin")).toBe(false);
    expect(isValidStoreCode("magasin-oran")).toBe(true);
  });
  it("refuses usernames with spaces or symbols", () => {
    expect(isValidUsername("ahmed")).toBe(true);
    expect(isValidUsername("ah med")).toBe(false);
  });
});

describe("master first sign-in", () => {
  it("accepts admin / admin as the first master login", () => {
    expect(isDefaultMasterLogin("admin", "admin")).toBe(true);
    expect(isDefaultMasterLogin(" Admin ", "admin")).toBe(true);
  });
  it("rejects anything else", () => {
    expect(isDefaultMasterLogin("admin", "Admin")).toBe(false);
    expect(isDefaultMasterLogin("omar", "admin")).toBe(false);
  });
});

describe("separate sign-in pages", () => {
  it("sends a manager account only to the manager page", () => {
    expect(portalAccepts("manager", ["manager"])).toBe(true);
    expect(portalAccepts("worker", ["manager"])).toBe(false);
  });

  it("sends a worker account only to the worker page", () => {
    expect(portalAccepts("worker", ["worker"])).toBe(true);
    expect(portalAccepts("manager", ["worker"])).toBe(false);
  });

  it("never lets the master in through a store page", () => {
    expect(portalAccepts("manager", ["master"])).toBe(false);
    expect(portalAccepts("worker", ["master"])).toBe(false);
  });
});

describe("worker progress in a session", () => {
  const now = new Date("2026-11-05T12:00:00Z").getTime();
  const members = [
    { id: "u1", full_name: "Ahmed", username: "ahmed" },
    { id: "u2", full_name: "Sara", username: "sara" },
  ];

  it("totals lines, pieces and distinct products per worker", () => {
    const [ahmed] = workerProgress(
      [
        {
          barcode: "1",
          counted_quantity: 3,
          counted_by: "u1",
          counted_by_name: "Ahmed",
          counted_at: "2026-11-05T11:00:00Z",
        },
        {
          barcode: "1",
          counted_quantity: 2,
          counted_by: "u1",
          counted_by_name: "Ahmed",
          counted_at: "2026-11-05T11:05:00Z",
        },
        {
          barcode: "2",
          counted_quantity: 5,
          counted_by: "u1",
          counted_by_name: "Ahmed",
          counted_at: "2026-11-05T11:10:00Z",
        },
      ],
      members,
      now,
    );
    expect(ahmed).toMatchObject({
      id: "u1",
      lines: 3,
      quantity: 10,
      products: 2,
      lastScanAt: "2026-11-05T11:10:00Z",
    });
  });

  it("lists a worker who has not scanned yet with zero lines", () => {
    const rows = workerProgress([], members, now);
    expect(rows.find((r) => r.id === "u2")).toMatchObject({
      lines: 0,
      lastScanAt: null,
      active: false,
    });
  });

  it("marks a worker as working now only if they scanned in the last 10 minutes", () => {
    const rows = workerProgress(
      [
        {
          barcode: "1",
          counted_quantity: 1,
          counted_by: "u1",
          counted_by_name: "Ahmed",
          counted_at: "2026-11-05T11:51:00Z",
        },
        {
          barcode: "1",
          counted_quantity: 1,
          counted_by: "u2",
          counted_by_name: "Sara",
          counted_at: "2026-11-05T11:49:00Z",
        },
      ],
      members,
      now,
    );
    expect(rows.find((r) => r.id === "u1")?.active).toBe(true);
    expect(rows.find((r) => r.id === "u2")?.active).toBe(false);
  });
});

describe("session sales", () => {
  it("counted product with sales (no time): variance = counted − sold", () => {
    const [row] = computeVariances(
      [{ barcode: "1", product_name: "A", system_quantity: 10 }],
      [{ barcode: "1", product_name: "A", counted_quantity: 7, location: null }],
      [{ barcode: "1", product_name: "A", quantity: 3 }],
    );
    expect(row!.sold_quantity).toBe(3);
    expect(row!.expected_quantity).toBe(7);
    expect(row!.variance).toBe(4);
  });
});

describe("sales vs count time", () => {
  const snap = [{ barcode: "9", product_name: "P", system_quantity: 100 }];
  const count = [{ barcode: "9", product_name: "P", counted_quantity: 90, location: "A", counted_at: "2026-11-08T10:00:00Z" }];
  it("uncounted product: sales are not deducted", () => {
    const [row] = computeVariances(snap, [], [{ barcode: "9", product_name: "P", quantity: 20, sold_at: "2026-11-08T11:00:00Z" }]);
    expect(row).toMatchObject({ sold_quantity: 20, deducted_quantity: 0, variance: 0 });
  });
  it("sold after the count: 90 − 20 = 70", () => {
    const [row] = computeVariances(snap, count, [{ barcode: "9", product_name: "P", quantity: 20, sold_at: "2026-11-08T11:00:00Z" }]);
    expect(row!.variance).toBe(70);
  });
  it("sold before the count: not deducted again", () => {
    const [row] = computeVariances(snap, count, [{ barcode: "9", product_name: "P", quantity: 20, sold_at: "2026-11-08T09:00:00Z" }]);
    expect(row!.variance).toBe(90);
  });
  it("reads purchase and selling prices from Excel", () => {
    const res = parseProductRows([{ barcode: "1", name: "A", "سعر الشراء": "80", "سعر البيع": "120,5" }]);
    expect(res.rows[0]).toMatchObject({ purchase_price: 80, selling_price: 120.5 });
  });
});
