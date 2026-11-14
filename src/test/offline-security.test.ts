import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: { user: { id: "user-a" } } as { user: { id: string } } | null,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: mocks.session } }) } },
}));

import {
  cacheGet,
  cacheSet,
  clearLocalSignOutData,
  openDb,
  scopedCacheKey,
  withOfflineCopy,
} from "@/lib/offline";

async function put(storeName: string, key: string, value: unknown) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).put(value, key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

async function keys(storeName: string) {
  const db = await openDb();
  return new Promise<string[]>((resolve, reject) => {
    const request = db.transaction(storeName).objectStore(storeName).getAllKeys();
    request.onsuccess = () => resolve(request.result.map(String));
    request.onerror = () => reject(request.error);
  });
}

describe("offline data separation and sign-out cleanup", () => {
  beforeEach(async () => {
    mocks.session = { user: { id: "user-a" } };
    localStorage.clear();
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(["cache", "queue"], "readwrite");
      transaction.objectStore("cache").clear();
      transaction.objectStore("queue").clear();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  });

  it("uses different cache keys and values for user-a and user-b in the same store", async () => {
    const key = "products:tenant-1";
    expect(scopedCacheKey(key, "user-a")).not.toBe(scopedCacheKey(key, "user-b"));

    await cacheSet(key, ["product-A"]);
    mocks.session = { user: { id: "user-b" } };
    await cacheSet(key, ["product-B"]);

    expect(await cacheGet(key)).toEqual(["product-B"]);
    mocks.session = { user: { id: "user-a" } };
    expect(await cacheGet(key)).toEqual(["product-A"]);
  });

  it("does not serve an old unscoped entry when there is no session", async () => {
    await put("cache", "products:tenant-1", ["old-product"]);
    mocks.session = null;
    const load = vi.fn();

    await expect(withOfflineCopy("products:tenant-1", load)).rejects.toThrow("لا توجد نسخة محفوظة");
    expect(load).not.toHaveBeenCalled();
  });

  it("removes only the identity key and smartstock_cart_ localStorage keys", async () => {
    localStorage.setItem("stocki_me_v5", "remove");
    localStorage.setItem("smartstock_cart_store-a", "remove");
    localStorage.setItem("smartstock_cart_store-b", "remove");
    localStorage.setItem("stocki_me_v4", "keep");
    localStorage.setItem("smartstock_cart", "keep");
    localStorage.setItem("unrelated", "keep");

    await clearLocalSignOutData();

    expect(localStorage.getItem("stocki_me_v5")).toBeNull();
    expect(localStorage.getItem("smartstock_cart_store-a")).toBeNull();
    expect(localStorage.getItem("smartstock_cart_store-b")).toBeNull();
    expect(localStorage.getItem("stocki_me_v4")).toBe("keep");
    expect(localStorage.getItem("smartstock_cart")).toBe("keep");
    expect(localStorage.getItem("unrelated")).toBe("keep");
  });

  it("clears cached catalogs but preserves pending/failed sales and the count queue", async () => {
    await put("cache", "sale:pending", { status: "pending" });
    await put("cache", "sale:failed", { status: "failed" });
    await put("cache", "user:user-a:products:tenant-1", ["cached"]);
    await put("cache", "products:tenant-1", ["old"]);
    await put("queue", "count-1", { client_id: "count-1", status: "pending" });

    await clearLocalSignOutData();

    expect((await keys("cache")).sort()).toEqual(["sale:failed", "sale:pending"]);
    expect(await keys("queue")).toEqual(["count-1"]);
  });
});
