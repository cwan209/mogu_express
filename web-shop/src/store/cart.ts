// store/cart.ts - 购物车,游客也能加(localStorage 持久化)
//
// items 用 tuanItemId 作主键(一个商品在不同团里可不同价,所以以 tuanItemId 区分)
// 同时保留 productId / tuanId / 商品快照(title/price/cover),离线显示

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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

  // 增 / 改数量(quantity ≤ 0 时移除)
  setItem: (snapshot: Omit<CartItem, 'addedAt' | 'quantity'>, quantity: number) => void;
  remove: (tuanItemId: string) => void;
  clear: () => void;

  // 派生
  totalQty: () => number;
  totalCents: () => number;
  getQty: (tuanItemId: string) => number;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],

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

      totalQty: () => get().items.reduce((s, it) => s + it.quantity, 0),
      totalCents: () => get().items.reduce((s, it) => s + it.price * it.quantity, 0),
      getQty: (id) => get().items.find((it) => it.tuanItemId === id)?.quantity || 0,
    }),
    {
      name: 'web-shop.cart.v1',
      partialize: (s) => ({ items: s.items }),  // 只持久化 items
    },
  ),
);
