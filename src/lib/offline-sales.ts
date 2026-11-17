import { useSyncExternalStore } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { isNetworkError, openDb, flushQueue } from './offline';

export interface DeviceSale {
  client_id: string;
  tenant_id: string;
  user_id: string;
  session_id: string | null;
  cash_id: string;
  items: { barcode: string; product_name: string; quantity: number; unit_price: number }[];
  payment: 'cash' | 'card' | 'credit';
  customer_id?: string | null | undefined;
  discount: number;
  sold_at: string;
  status: 'pending' | 'failed';
  error?: string | undefined;
}

export function pendingStock(sales: DeviceSale[], barcode: string) {
  return sales.reduce((sum, sale) => sum + sale.items.filter(item => item.barcode === barcode).reduce((n, item) => n + item.quantity, 0), 0);
}

let state: { sales: DeviceSale[]; syncing: boolean; lastSyncedAt: string | null } = { sales: [], syncing: false, lastSyncedAt: null };
const serverState = state;
const listeners = new Set<() => void>();
const notify = (patch: Partial<typeof state>) => { state = { ...state, ...patch }; listeners.forEach(fn => fn()); };
export function useDeviceSales() {
  return useSyncExternalStore(fn => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => state, () => serverState);
}

async function transaction<T>(action: (store: IDBObjectStore) => IDBRequest<T>) {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction('cache', 'readwrite');
    const request = action(tx.objectStore('cache'));
    tx.oncomplete = () => resolve(request.result);
    tx.onabort = () => reject(tx.error);
    request.onerror = () => reject(request.error);
  });
}
async function reload() {
  const records = await transaction(store => store.getAll()) as unknown[];
  const { data: { session } } = await supabase.auth.getSession();
  notify({ sales: records.filter((record): record is DeviceSale => !!record && typeof record === 'object' && 'client_id' in record && 'cash_id' in record && 'user_id' in record && record.user_id === session?.user.id).sort((a,b) => a.sold_at.localeCompare(b.sold_at)) });
}
export async function saveDeviceSale(sale: DeviceSale) {
  await transaction(store => store.put(sale, `sale:${sale.client_id}`));
  await reload();
}
export async function retryDeviceSale(sale: DeviceSale, cashId?: string) {
  await saveDeviceSale({ ...sale, ...(cashId ? { cash_id: cashId, sold_at: new Date().toISOString() } : {}), status: 'pending', error: undefined });
  await syncDeviceSales();
}
let running: Promise<void> | null = null;
export function syncDeviceSales(): Promise<void> {
  if (running) return running;
  if (!navigator.onLine) return Promise.resolve();
  running = (async () => {
    await reload();
    notify({ syncing: true });
    try {
      await flushQueue();
      for (const sale of state.sales.filter(sale => sale.status === 'pending')) {
        const { error } = await supabase.rpc('sync_offline_sale', {
          _client_id: sale.client_id, _session_id: sale.session_id as never, _cash_id: sale.cash_id,
          _items: sale.items, _payment: sale.payment, _discount: sale.discount, _sold_at: sale.sold_at,
        });
        if (error) {
          if (isNetworkError(error.message)) break;
          await saveDeviceSale({ ...sale, status: 'failed', error: error.message });
          continue;
        }
        if (sale.customer_id) {
          const { data: link } = await supabase.from('offline_sales_sync').select('ticket_id').eq('client_id', sale.client_id).maybeSingle();
          if (link) await supabase.rpc('set_ticket_customer', { _ticket_id: link.ticket_id, _customer_id: sale.customer_id });
        }
        await transaction(store => store.delete(`sale:${sale.client_id}`));
        notify({ lastSyncedAt: new Date().toISOString() });
      }
    } finally { await reload(); notify({ syncing: false }); }
  })().finally(() => { running = null; });
  return running;
}
let started = false;
export function startSalesSync() {
  if (started) return;
  started = true;
  void reload().then(syncDeviceSales).catch(console.error);
  window.addEventListener('online', () => { void syncDeviceSales().catch(console.error); });
  supabase.auth.onAuthStateChange(event => {
    if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') void reload().catch(console.error);
  });
  window.setInterval(() => { if (state.sales.some(sale => sale.status === 'pending')) void syncDeviceSales().catch(console.error); }, 15_000);
}