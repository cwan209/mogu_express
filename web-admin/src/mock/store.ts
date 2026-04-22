// Mock 存储 — 用 localStorage 持久化,刷新不丢
//
// 数据模型(与后端对齐):
//   catalog     — CatalogProduct[](商品库)
//   tuanItems   — TuanItem[](团内实例)
//   tuans / categories / orders
//
// 对外暴露的 listProducts({tuanId}) / getProduct() 返回 "joined view"(Product 类型),
// 这样 UI 代码不需要关心底层是两张表。
import type {
  Tuan, CatalogProduct, TuanItem, Product, Category, Order, OrderStatus,
} from '../types';
import {
  seedTuans, seedCatalog, seedTuanItems, seedCategories, seedOrders,
} from './seed';

const KEY = 'mogu_express_mock_db_v3';

interface DB {
  tuans: Tuan[];
  catalog: CatalogProduct[];
  tuanItems: TuanItem[];
  categories: Category[];
  orders: Order[];
}

function load(): DB {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {
    tuans: [...seedTuans],
    catalog: [...seedCatalog],
    tuanItems: [...seedTuanItems],
    categories: [...seedCategories],
    orders: [...seedOrders],
  };
}

function persist(db: DB) { localStorage.setItem(KEY, JSON.stringify(db)); }
let db: DB = load();

function joinTuanItems(items: TuanItem[]): Product[] {
  const cmap = new Map(db.catalog.map((c) => [c._id, c]));
  return items.map((ti) => {
    const c = cmap.get(ti.productId);
    return {
      _id: ti._id,
      tuanItemId: ti._id,
      productId: ti.productId,
      tuanId: ti.tuanId,
      title: c?.title || '',
      description: c?.description || '',
      coverFileId: c?.coverFileId || '',
      imageFileIds: c?.imageFileIds || [],
      categoryIds: c?.categoryIds || [],
      section: ti.section ?? null,
      price: ti.price,
      stock: ti.stock,
      sold: ti.sold,
      sort: ti.sort,
      participantCount: ti.participantCount,
    };
  });
}

export const mockDb = {
  // ---- 读 ----
  listTuans(filter?: { status?: string }): Tuan[] {
    return db.tuans
      .filter((t) => (filter?.status ? t.status === filter.status : true))
      .sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));
  },
  getTuan(id: string): Tuan | undefined { return db.tuans.find((t) => t._id === id); },

  listCatalog(filter?: { categoryId?: string }): CatalogProduct[] {
    return db.catalog
      .filter((p) => (filter?.categoryId ? p.categoryIds.includes(filter.categoryId) : true))
      .sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));
  },
  getCatalog(id: string): CatalogProduct | undefined { return db.catalog.find((p) => p._id === id); },

  /**
   * 返回 joined view。
   *   - tuanId 指定  → 团内实例(含 price/stock/section)
   *   - 不传 tuanId → 商品库每项 map 成 "伪 joined"(price/stock=0,用于目录展示场景)
   */
  listProducts(filter?: { tuanId?: string; categoryId?: string }): Product[] {
    if (filter?.tuanId) {
      const items = db.tuanItems
        .filter((i) => i.tuanId === filter.tuanId)
        .sort((a, b) => a.sort - b.sort);
      let joined = joinTuanItems(items);
      if (filter.categoryId) joined = joined.filter((j) => j.categoryIds.includes(filter.categoryId!));
      return joined;
    }
    // catalog fallback — 用 catalog 生成无价实例占位
    return db.catalog
      .filter((p) => (filter?.categoryId ? p.categoryIds.includes(filter.categoryId) : true))
      .map((p) => ({
        _id: p._id, tuanItemId: '', productId: p._id, tuanId: '',
        title: p.title, description: p.description,
        coverFileId: p.coverFileId, imageFileIds: p.imageFileIds,
        categoryIds: p.categoryIds, section: null,
        price: 0, stock: 0, sold: 0, sort: 0, participantCount: 0,
      }));
  },
  getProduct(tuanItemId: string): Product | undefined {
    const ti = db.tuanItems.find((i) => i._id === tuanItemId);
    if (!ti) return undefined;
    return joinTuanItems([ti])[0];
  },
  /** 团内商品实例列表(只返回 TuanItem,不 join) */
  listTuanItems(tuanId: string): TuanItem[] {
    return db.tuanItems.filter((i) => i.tuanId === tuanId).sort((a, b) => a.sort - b.sort);
  },
  getTuanItem(id: string): TuanItem | undefined { return db.tuanItems.find((i) => i._id === id); },

  listCategories(): Category[] {
    return db.categories.filter((c) => c.isActive).sort((a, b) => a.sort - b.sort);
  },

  // ---- 写:团 ----
  createTuan(input: Omit<Tuan, '_id' | 'productCount' | 'createdAt' | 'updatedAt'>): Tuan {
    const now = new Date().toISOString();
    const tuan: Tuan = { _id: 'tuan_' + Date.now(), productCount: 0, createdAt: now, updatedAt: now, ...input };
    db.tuans.unshift(tuan); persist(db); return tuan;
  },
  updateTuan(id: string, patch: Partial<Tuan>): Tuan | undefined {
    const i = db.tuans.findIndex((t) => t._id === id);
    if (i < 0) return undefined;
    db.tuans[i] = { ...db.tuans[i], ...patch, updatedAt: new Date().toISOString() };
    persist(db); return db.tuans[i];
  },
  deleteTuan(id: string): boolean {
    if (db.tuanItems.some((i) => i.tuanId === id)) throw new Error('团下还有商品,请先移除');
    const before = db.tuans.length;
    db.tuans = db.tuans.filter((t) => t._id !== id);
    persist(db); return db.tuans.length < before;
  },

  // ---- 写:商品库 ----
  createCatalog(input: Omit<CatalogProduct, '_id' | 'createdAt' | 'updatedAt'>): CatalogProduct {
    const now = new Date().toISOString();
    const p: CatalogProduct = { _id: 'prod_' + Date.now(), createdAt: now, updatedAt: now, ...input };
    db.catalog.unshift(p); persist(db); return p;
  },
  updateCatalog(id: string, patch: Partial<CatalogProduct>): CatalogProduct | undefined {
    const i = db.catalog.findIndex((p) => p._id === id);
    if (i < 0) return undefined;
    db.catalog[i] = { ...db.catalog[i], ...patch, updatedAt: new Date().toISOString() };
    persist(db); return db.catalog[i];
  },
  deleteCatalog(id: string): boolean {
    const instances = db.tuanItems.filter((i) => i.productId === id);
    if (instances.some((i) => i.sold > 0)) throw new Error('商品已在某团中成交,不能从商品库删除');
    db.tuanItems = db.tuanItems.filter((i) => i.productId !== id);
    // 更新 productCount
    const tuanCount = new Map<string, number>();
    for (const i of instances) tuanCount.set(i.tuanId, (tuanCount.get(i.tuanId) || 0) + 1);
    for (const [tid, n] of tuanCount) {
      const t = db.tuans.find((x) => x._id === tid);
      if (t) { t.productCount = Math.max(0, t.productCount - n); t.updatedAt = new Date().toISOString(); }
    }
    const before = db.catalog.length;
    db.catalog = db.catalog.filter((p) => p._id !== id);
    persist(db);
    return db.catalog.length < before;
  },

  // ---- 写:团内实例 ----
  createTuanItem(input: Omit<TuanItem, '_id' | 'sold' | 'participantCount' | 'createdAt' | 'updatedAt'>): TuanItem {
    if (db.tuanItems.some((i) => i.tuanId === input.tuanId && i.productId === input.productId)) {
      throw new Error('该商品已在此团中');
    }
    const now = new Date().toISOString();
    const ti: TuanItem = {
      _id: 'ti_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      sold: 0, participantCount: 0, createdAt: now, updatedAt: now, ...input,
      section: (input.section || '').toString().trim() || null,
    };
    db.tuanItems.push(ti);
    const t = db.tuans.find((x) => x._id === ti.tuanId);
    if (t) { t.productCount++; t.updatedAt = now; }
    persist(db);
    return ti;
  },
  updateTuanItem(id: string, patch: Partial<TuanItem>): TuanItem | undefined {
    const i = db.tuanItems.findIndex((x) => x._id === id);
    if (i < 0) return undefined;
    const next = { ...db.tuanItems[i], ...patch, updatedAt: new Date().toISOString() };
    if ('section' in patch) {
      const s = (patch.section || '').toString().trim();
      next.section = s || null;
    }
    db.tuanItems[i] = next; persist(db); return next;
  },
  deleteTuanItem(id: string): boolean {
    const ti = db.tuanItems.find((i) => i._id === id);
    if (!ti) return false;
    if (ti.sold > 0) throw new Error('已有下单记录,不能从团中移除');
    db.tuanItems = db.tuanItems.filter((x) => x._id !== id);
    const t = db.tuans.find((x) => x._id === ti.tuanId);
    if (t) { t.productCount = Math.max(0, t.productCount - 1); t.updatedAt = new Date().toISOString(); }
    persist(db); return true;
  },

  /** 从源团批量复制 tuan_items 到目标团。重复的 productId 跳过。返回 {copied, skipped} */
  copyTuanItems(sourceTuanId: string, targetTuanId: string): { copied: number; skipped: number } {
    const src = db.tuanItems.filter((i) => i.tuanId === sourceTuanId);
    const existing = new Set(db.tuanItems.filter((i) => i.tuanId === targetTuanId).map((i) => i.productId));
    const now = new Date().toISOString();
    let copied = 0, skipped = 0;
    for (const ti of src) {
      if (existing.has(ti.productId)) { skipped++; continue; }
      db.tuanItems.push({
        _id: 'ti_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        tuanId: targetTuanId,
        productId: ti.productId,
        price: ti.price, stock: ti.stock, sold: 0, sort: ti.sort,
        section: ti.section ?? null,
        participantCount: 0,
        createdAt: now, updatedAt: now,
      });
      copied++;
    }
    if (copied) {
      const t = db.tuans.find((x) => x._id === targetTuanId);
      if (t) { t.productCount += copied; t.updatedAt = now; }
    }
    persist(db);
    return { copied, skipped };
  },

  // ---- 写:分类 ----
  createCategory(name: string, sort: number): Category {
    const c: Category = { _id: 'cat_' + Date.now(), name, sort, isActive: true, createdAt: new Date().toISOString() };
    db.categories.push(c); persist(db); return c;
  },
  updateCategory(id: string, patch: Partial<Category>): Category | undefined {
    const i = db.categories.findIndex((c) => c._id === id);
    if (i < 0) return undefined;
    db.categories[i] = { ...db.categories[i], ...patch }; persist(db); return db.categories[i];
  },
  deleteCategory(id: string): boolean {
    if (db.catalog.some((p) => p.categoryIds.includes(id))) throw new Error('该分类下还有商品,不能删除');
    const before = db.categories.length;
    db.categories = db.categories.filter((c) => c._id !== id);
    persist(db); return db.categories.length < before;
  },

  // ---- 订单 ----
  listOrders(filter?: { status?: OrderStatus; tuanId?: string; dateFrom?: string; dateTo?: string; keyword?: string }): Order[] {
    return db.orders
      .filter((o) => (filter?.status ? o.status === filter.status : true))
      .filter((o) => (filter?.tuanId ? o.items.some((it) => it.tuanId === filter.tuanId) : true))
      .filter((o) => (filter?.dateFrom ? o.createdAt >= filter.dateFrom : true))
      .filter((o) => (filter?.dateTo ? o.createdAt <= filter.dateTo : true))
      .filter((o) => {
        if (!filter?.keyword) return true;
        const k = filter.keyword.toLowerCase();
        return o.orderNo.toLowerCase().includes(k) ||
          o.userSnapshot.name.toLowerCase().includes(k) ||
          o.userSnapshot.phone.includes(k) ||
          o.items.some((it) => it.title.toLowerCase().includes(k));
      })
      .sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));
  },
  getOrder(id: string): Order | undefined { return db.orders.find((o) => o._id === id); },
  updateOrderStatus(id: string, status: OrderStatus): Order | undefined {
    const i = db.orders.findIndex((o) => o._id === id);
    if (i < 0) return undefined;
    const now = new Date().toISOString();
    db.orders[i] = { ...db.orders[i], status, updatedAt: now, ...(status === 'shipped' ? { shippedAt: now } : {}) };
    persist(db); return db.orders[i];
  },

  // ---- 统计 ----
  stats() {
    const activeTuans = db.tuans.filter((t) => t.status === 'on_sale').length;
    const activeProducts = db.tuanItems.filter((ti) => {
      const t = db.tuans.find((x) => x._id === ti.tuanId);
      return t?.status === 'on_sale' && ti.stock > ti.sold;
    }).length;
    const todayStart = new Date().setHours(0, 0, 0, 0);
    const paidToday = db.orders.filter(
      (o) => (o.status === 'paid' || o.status === 'shipped' || o.status === 'completed') &&
        o.paidAt && new Date(o.paidAt).getTime() >= todayStart,
    );
    return {
      activeTuans, activeProducts,
      orderCount: paidToday.length,
      gmvCents: paidToday.reduce((s, o) => s + o.amount, 0),
    };
  },

  reset() {
    db = {
      tuans: [...seedTuans], catalog: [...seedCatalog], tuanItems: [...seedTuanItems],
      categories: [...seedCategories], orders: [...seedOrders],
    };
    persist(db);
  },
};
