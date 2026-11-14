import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), session: { user: { id: 'seller-a' } } }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: mocks.session } }) }, rpc: mocks.rpc } }));
import { saveDeviceSale, syncDeviceSales, pendingStock, type DeviceSale } from '@/lib/offline-sales';
import { openDb, cacheSet, withOfflineCopy, enqueueCount, flushQueue } from '@/lib/offline';

const sale: DeviceSale = { client_id: 'sale-one', user_id: 'seller-a', tenant_id: 'store-a', session_id: null, cash_id: 'cash-one', payment: 'cash', discount: 10, sold_at: '2026-11-14T16:00:00Z', status: 'pending', items: [{ barcode: '001', product_name: 'Item', quantity: 2, unit_price: 50 }] };
async function records() {
  const db = await openDb();
  return new Promise<unknown[]>(resolve => { const request = db.transaction('cache').objectStore('cache').getAll(); request.onsuccess = () => resolve(request.result); });
}
describe('durable offline operations', () => {
  beforeEach(async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    const db = await openDb();
    await new Promise<void>(resolve => { const tx = db.transaction(['cache','queue'], 'readwrite'); tx.objectStore('cache').clear(); tx.objectStore('queue').clear(); tx.oncomplete = () => resolve(); });
    mocks.rpc.mockReset();
  });
  it('keeps an offline sale on disk without contacting the server', async () => {
    await saveDeviceSale(sale);
    await syncDeviceSales();
    expect(await records()).toEqual([sale]);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('keeps the original count time, quantity and note while offline', async () => {
    const count = { client_id: 'count-one', user_id: 'seller-a', op: 'insert' as const, status: 'pending' as const, created_at: '2026-11-14T16:00:00Z', payload: { session_id: 'inventory-one', barcode: '001', product_name: 'Item', counted_quantity: 90, location: 'A1', counted_by_name: 'Seller', counted_at: '2026-11-14T16:00:00Z', notes: 'Note' } };
    await enqueueCount(count);
    await flushQueue();
    const db = await openDb();
    const saved = await new Promise(resolve => { const request = db.transaction('queue').objectStore('queue').get('count-one'); request.onsuccess = () => resolve(request.result); });
    expect(saved).toEqual(count);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('preserves sale time, cash session, discount and items on synchronization', async () => {
    await saveDeviceSale(sale);
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    mocks.rpc.mockResolvedValue({ error: null, data: { id: 'ticket-one' } });
    await syncDeviceSales();
    expect(mocks.rpc).toHaveBeenCalledWith('sync_offline_sale', { _client_id: 'sale-one', _session_id: null, _cash_id: 'cash-one', _items: sale.items, _payment: 'cash', _discount: 10, _sold_at: '2026-11-14T16:00:00Z' });
    expect(await records()).toEqual([]);
  });
  it('retains the same unique sale ID after a lost response for safe retry', async () => {
    await saveDeviceSale(sale);
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    mocks.rpc.mockResolvedValue({ error: { message: 'Failed to fetch' } });
    await syncDeviceSales();
    expect(await records()).toEqual([sale]);
  });
  it('keeps a refused sale for review rather than deleting it', async () => {
    await saveDeviceSale(sale);
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    mocks.rpc.mockResolvedValue({ error: { message: 'cash_session_not_open' } });
    await syncDeviceSales();
    expect(await records()).toEqual([{ ...sale, status: 'failed', error: 'cash_session_not_open' }]);
  });
  it('subtracts locally sold units from available stock', () => {
    expect(pendingStock([sale], '001')).toBe(2);
    expect(pendingStock([sale], '002')).toBe(0);
  });
  it('loads cached products immediately without a network call', async () => {
    await cacheSet('products:store-a', [{ barcode: '001' }]);
    const load = vi.fn();
    expect(await withOfflineCopy('products:store-a', load)).toEqual([{ barcode: '001' }]);
    expect(load).not.toHaveBeenCalled();
  });
});