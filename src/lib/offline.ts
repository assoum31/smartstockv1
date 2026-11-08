// Offline support for scanning: a small IndexedDB store keeps
//  - a queue of counts waiting to be sent, and
//  - cached copies of the catalog / session data for lookups without network.
// Everything here runs in the browser only (called from effects and handlers).
import { useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";

const DB_NAME = "stocki-offline";
const DB_VERSION = 1;

export interface QueuedCount {
  client_id: string;
  user_id: string;
  op: "insert" | "update";
  /** for updates: server id of the line when known */
  log_id?: string | null | undefined;
  payload: {
    session_id: string;
    barcode: string;
    product_name: string;
    counted_quantity: number;
    location: string;
    counted_by_name: string;
    counted_at: string;
    notes?: string | null;
  };
  created_at: string;
  status: "pending" | "failed";
  error?: string | undefined;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("queue"))
          db.createObjectStore("queue", { keyPath: "client_id" });
        if (!db.objectStoreNames.contains("cache")) db.createObjectStore("cache");
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function tx<T>(
  store: string,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
) {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function cacheSet(key: string, value: unknown) {
  try {
    await tx("cache", "readwrite", (s) => s.put(value, key));
  } catch {
    /* storage full or private mode: lookups just won't work offline */
  }
}

export async function cacheGet<T>(key: string): Promise<T | undefined> {
  try {
    return (await tx("cache", "readonly", (s) => s.get(key))) as T | undefined;
  } catch {
    return undefined;
  }
}

// ---------- queue state, shared with React ----------

type SyncState = {
  online: boolean;
  syncing: boolean;
  queue: QueuedCount[];
  lastSyncedAt: string | null;
};
let state: SyncState = { online: true, syncing: false, queue: [], lastSyncedAt: null };
const listeners = new Set<() => void>();
const serverState: SyncState = { online: true, syncing: false, queue: [], lastSyncedAt: null };

function setState(patch: Partial<SyncState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function useSyncState() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
    () => serverState,
  );
}

async function reloadQueue() {
  try {
    const all = (await tx("queue", "readonly", (s) => s.getAll())) as QueuedCount[];
    all.sort((a, b) => a.created_at.localeCompare(b.created_at));
    setState({ queue: all });
  } catch {
    /* ignore */
  }
}

export async function enqueueCount(item: QueuedCount) {
  // Editing a line that is still waiting? Merge into the waiting insert.
  const existing = state.queue.find((q) => q.client_id === item.client_id);
  const toStore: QueuedCount =
    existing && existing.op === "insert" && item.op === "update"
      ? { ...existing, payload: item.payload, status: "pending", error: undefined }
      : item;
  await tx("queue", "readwrite", (s) => s.put(toStore));
  await reloadQueue();
  void flushQueue();
}

export async function discardQueued(clientId: string) {
  await tx("queue", "readwrite", (s) => s.delete(clientId));
  await reloadQueue();
}

function isNetworkError(message: string) {
  return /fetch|network|load failed|timeout|offline/i.test(message);
}

let flushing: Promise<void> | null = null;

/** Send waiting counts in order. Network errors keep them; refusals mark them failed. */
export function flushQueue(): Promise<void> {
  if (flushing) return flushing;
  flushing = (async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const userId = session?.user.id;
    const mine = state.queue.filter((q) => q.status === "pending" && q.user_id === userId);
    if (!userId || mine.length === 0) return;
    setState({ syncing: true });
    try {
      for (const item of mine) {
        const res =
          item.op === "insert"
            ? await supabase
                .from("inventory_logs")
                .upsert(
                  { ...item.payload, client_id: item.client_id },
                  { onConflict: "client_id", ignoreDuplicates: true },
                )
            : await (item.log_id
                ? supabase
                    .from("inventory_logs")
                    .update({
                      product_name: item.payload.product_name,
                      counted_quantity: item.payload.counted_quantity,
                      location: item.payload.location,
                      counted_at: item.payload.counted_at,
                      notes: item.payload.notes ?? null,
                    })
                    .eq("id", item.log_id)
                : supabase
                    .from("inventory_logs")
                    .update({
                      product_name: item.payload.product_name,
                      counted_quantity: item.payload.counted_quantity,
                      location: item.payload.location,
                      counted_at: item.payload.counted_at,
                      notes: item.payload.notes ?? null,
                    })
                    .eq("client_id", item.client_id));
        if (res.error) {
          if (isNetworkError(res.error.message)) {
            setState({ online: false });
            break;
          }
          await tx("queue", "readwrite", (s) =>
            s.put({ ...item, status: "failed", error: res.error!.message } satisfies QueuedCount),
          );
          continue;
        }
        await tx("queue", "readwrite", (s) => s.delete(item.client_id));
        setState({ online: true, lastSyncedAt: new Date().toISOString() });
      }
    } catch {
      setState({ online: false });
    } finally {
      await reloadQueue();
      setState({ syncing: false });
    }
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}

let started = false;

/** Start listening for connectivity and retry sending in the background. */
export function startOfflineSync() {
  if (started || typeof window === "undefined") return;
  started = true;
  setState({ online: navigator.onLine });
  void reloadQueue().then(() => flushQueue());
  window.addEventListener("online", () => {
    setState({ online: true });
    void flushQueue();
  });
  window.addEventListener("offline", () => setState({ online: false }));
  window.setInterval(() => {
    if (state.queue.some((q) => q.status === "pending")) void flushQueue();
  }, 15_000);
}

export function newClientId() {
  return crypto.randomUUID();
}
