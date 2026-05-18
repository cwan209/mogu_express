// store/cart.ts - 购物车,游客也能加(localStorage 持久化)
//
// items 用 tuanItemId 作主键(一个商品在不同团里可不同价,所以以 tuanItemId 区分)
// 同时保留 productId / tuanId / 商品快照(title/price/cover),离线显示
//
// 登录后服务端同步策略 (Sprint 2-3):
// - App.tsx 在 token 0→1 时调 hydrateFromServer 把 server cart 覆盖 local
// - syncedFromServer=true 后,subscribe items 变化 → debounce 800ms → replaceCart 全量 push
// - syncedFromServer 不持久化(只持久化 items),浏览器重启需重新 hydrate

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { replaceCart, type ServerCartItem } from '../api/order';
import { useAuthStore } from './auth';

export interface CartItem {
  tuanItemId: string;       // 主键
  productId: string;
  tuanId: string;
  title: string;
  price: number;            // cents
  coverFileId: string;
  quantity: number;
  addedAt: string;          // ISO
}

interface CartState {
  items: CartItem[];
  /** 登录后,getCart 拉到 server cart 并覆盖 local 后置 true。
   *  仅在 true 时才把 local 改动 push 回 server,避免冷启动空 cart 把 server 清掉。 */
  syncedFromServer: boolean;

  // 增 / 改数量(quantity ≤ 0 时移除)
  setItem: (snapshot: Omit<CartItem, 'addedAt' | 'quantity'>, quantity: number) => void;
  remove: (tuanItemId: string) => void;
  clear: () => void;
  /** 登录后用 server cart 覆盖 local — server wins */
  hydrateFromServer: (serverItems: ServerCartItem[]) => void;

  // 派生
  totalQty: () => number;
  totalCents: () => number;
  getQty: (tuanItemId: string) => number;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      syncedFromServer: false,

      setItem: (snap, qty) =>
        set((s) => {
          const i = s.items.findIndex((it) => it.tuanItemId === snap.tuanItemId);
          if (qty <= 0) {
            if (i < 0) return s;
            return { items: s.items.filter((_, idx) => idx !== i) };
          }
          if (i < 0) {
            return {
              items: [...s.items, { ...snap, quantity: qty, addedAt: new Date().toISOString() }],
            };
          }
          const next = s.items.slice();
          next[i] = { ...next[i], ...snap, quantity: qty };
          return { items: next };
        }),

      remove: (id) => set((s) => ({ items: s.items.filter((it) => it.tuanItemId !== id) })),

      clear: () => set({ items: [] }),

      hydrateFromServer: (serverItems) => {
        const mapped = serverItems.map((s) => ({
          tuanItemId: s.tuanItemId,
          productId: s.product?._id || s.tuanItemId,
          tuanId: s.tuan?._id || '',
          title: s.product?.title || '',
          price: s.product?.price || 0,
          coverFileId: s.product?.coverFileId || '',
          quantity: s.quantity,
          addedAt: s.addedAt,
        }));
        set({ items: mapped });
        set({ syncedFromServer: true });
      },

      totalQty: () => get().items.reduce((s, it) => s + it.quantity, 0),
      totalCents: () => get().items.reduce((s, it) => s + it.price * it.quantity, 0),
      getQty: (id) => get().items.find((it) => it.tuanItemId === id)?.quantity || 0,
    }),
    {
      name: 'web-shop.cart.v1',
      partialize: (s) => ({ items: s.items }),  // 只持久化 items(syncedFromServer 不持久化)
    },
  ),
);

// ─── Debounced server push ──────────────────────────────────────────────────
// items 改 → 800ms 内无新改动 → replaceCart 全量推服务端。
// 仅在 syncedFromServer=true 时启动,避免冷启动 / 未登录场景误推。

let pushTimer: ReturnType<typeof setTimeout> | null = null;

function schedulePush(items: CartItem[]) {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    // 再次确认 logged in + synced(用户可能在 debounce 期间 logout)
    const token = useAuthStore.getState().token;
    const synced = useCartStore.getState().syncedFromServer;
    if (!token || !synced) return;
    replaceCart(
      items.map((it) => ({
        tuanItemId: it.tuanItemId,
        quantity: it.quantity,
        addedAt: it.addedAt,
      })),
    ).catch(() => {
      // 网络瞬断不致命,下次本地改 cart 时会再次 push
    });
  }, 800);
}

useCartStore.subscribe((state, prev) => {
  if (state.items !== prev.items && state.syncedFromServer) {
    schedulePush(state.items);
  }
});
