import { callCloud, USE_MOCK } from './client';
import { mockDb } from '../mock/store';

export interface Stats {
  gmvToday: number;     // cents
  ordersToday: number;
  gmv7d: number;
  orders7d: number;
  gmv30d: number;
  orders30d: number;
  activeTuans: number;
  activeProducts: number;
  topProducts: Array<{ productId: string; title: string; qty: number; amount: number }>;
  tuanSummary: Array<{ tuanId: string; orders: number; amount: number }>;
}

export async function getStats(): Promise<Stats> {
  if (USE_MOCK) {
    // Mock 版本:从 mockDb 拼
    const orders = mockDb.listOrders();
    const todayStart = new Date().setHours(0, 0, 0, 0);
    const paidToday = orders.filter(
      (o) => ['paid', 'shipped', 'completed'].includes(o.status) &&
             o.paidAt && new Date(o.paidAt).getTime() >= todayStart
    );
    const d7  = Date.now() - 7  * 86400e3;
    const d30 = Date.now() - 30 * 86400e3;
    const paid7d  = orders.filter((o) => ['paid','shipped','completed'].includes(o.status) && new Date(o.createdAt).getTime() >= d7);
    const paid30d = orders.filter((o) => ['paid','shipped','completed'].includes(o.status) && new Date(o.createdAt).getTime() >= d30);
    const s = mockDb.stats();

    const prodAgg = new Map<string, { productId: string; title: string; qty: number; amount: number }>();
    for (const o of paid30d) {
      for (const it of o.items) {
        const cur = prodAgg.get(it.productId) || { productId: it.productId, title: it.title, qty: 0, amount: 0 };
        cur.qty += it.quantity;
        cur.amount += it.subtotal;
        prodAgg.set(it.productId, cur);
      }
    }
    const tuanAgg = new Map<string, { tuanId: string; orders: number; amount: number }>();
    for (const o of paid30d) {
      const tuanIds = new Set(o.items.map(it => it.tuanId).filter(Boolean));
      for (const tid of tuanIds) {
        const cur = tuanAgg.get(tid) || { tuanId: tid, orders: 0, amount: 0 };
        cur.orders += 1;
        cur.amount += o.items.filter(it => it.tuanId === tid).reduce((s, it) => s + it.subtotal, 0);
        tuanAgg.set(tid, cur);
      }
    }

    return {
      gmvToday:   paidToday.reduce((s, o) => s + o.amount, 0),
      ordersToday: paidToday.length,
      gmv7d:  paid7d.reduce((s, o) => s + o.amount, 0),
      orders7d: paid7d.length,
      gmv30d: paid30d.reduce((s, o) => s + o.amount, 0),
      orders30d: paid30d.length,
      activeTuans: s.activeTuans,
      activeProducts: s.activeProducts,
      topProducts: [...prodAgg.values()].sort((a, b) => b.qty - a.qty).slice(0, 10),
      tuanSummary: [...tuanAgg.values()].sort((a, b) => b.amount - a.amount),
    };
  }
  const r = await callCloud<any>('_admin/orderStats');
  return r;
}
