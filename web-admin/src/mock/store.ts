// Mock 存储 — 用 localStorage 持久化,刷新不丢
// 仅在 M1 阶段使用;M3+ 接入真实云函数后本文件可删
import type { Tuan, Product, Category, Order, OrderStatus } from '../types';
import { seedTuans, seedProducts, seedCategories, seedOrders } from './seed';

const KEY = 'mogu_express_mock_db_v2';

interface DB {
  tuans: Tuan[];
  products: Product[];
  categories: Category[];
  orders: Order[];
}

function load(): DB {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // 向后兼容:旧版本没有 orders 字段
      if (!parsed.orders) parsed.orders = [...seedOrders];
      return parsed;
    }
  } catch {}
  return {
    tuans: [...seedTuans], products: [...seedProducts],
    categories: [...seedCategories], orders: [...seedOrders],
  };
}

function persist(db: DB) {
  localStorage.setItem(KEY, JSON.stringify(db));
}

let db: DB = load();

export const mockDb = {
  // ---- 读 ----
  listTuans(filter?: { status?: string }): Tuan[] {
    return db.tuans
      .filter((t) => (filter?.status ? t.status === filter.status : true))
      .sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));
  },
  getTuan(id: string): Tuan | undefined {
    return db.tuans.find((t) => t._id === id);
  },
  listProducts(filter?: { tuanId?: string; categoryId?: string }): Product[] {
    return db.products
      .filter((p) => (filter?.tuanId ? p.tuanId === filter.tuanId : true))
      .filter((p) => (filter?.categoryId ? p.categoryIds.includes(filter.categoryId) : true))
      .sort((a, b) => a.sort - b.sort);
  },
  getProduct(id: string): Product | undefined {
    return db.products.find((p) => p._id === id);
  },
  listCategories(): Category[] {
    return db.categories.filter((c) => c.isActive).sort((a, b) => a.sort - b.sort);
  },

  // ---- 写:团 ----
  createTuan(input: Omit<Tuan, '_id' | 'productCount' | 'createdAt' | 'updatedAt'>): Tuan {
    const now = new Date().toISOString();
    const tuan: Tuan = {
      _id: 'tuan_' + Date.now(),
      productCount: 0,
      createdAt: now,
      updatedAt: now,
      ...input,
    };
    db.tuans.unshift(tuan);
    persist(db);
    return tuan;
  },
  updateTuan(id: string, patch: Partial<Tuan>): Tuan | undefined {
    const i = db.tuans.findIndex((t) => t._id === id);
    if (i < 0) return undefined;
    db.tuans[i] = { ...db.tuans[i], ...patch, updatedAt: new Date().toISOString() };
    persist(db);
    return db.tuans[i];
  },
  deleteTuan(id: string): boolean {
    const hasProducts = db.products.some((p) => p.tuanId === id);
    if (hasProducts) throw new Error('团下还有商品,请先删除商品或改挂到其他团');
    const before = db.tuans.length;
    db.tuans = db.tuans.filter((t) => t._id !== id);
    persist(db);
    return db.tuans.length < before;
  },

  // ---- 写:商品 ----
  createProduct(input: Omit<Product, '_id' | 'sold' | 'participantCount' | 'createdAt' | 'updatedAt'>): Product {
    const now = new Date().toISOString();
    const product: Product = {
      _id: 'prod_' + Date.now(),
      sold: 0,
      participantCount: 0,
      createdAt: now,
      updatedAt: now,
      ...input,
    };
    db.products.push(product);
    // 维护 productCount
    const tuan = db.tuans.find((t) => t._id === product.tuanId);
    if (tuan) {
      tuan.productCount = db.products.filter((p) => p.tuanId === tuan._id).length;
      tuan.updatedAt = now;
    }
    persist(db);
    return product;
  },
  updateProduct(id: string, patch: Partial<Product>): Product | undefined {
    const i = db.products.findIndex((p) => p._id === id);
    if (i < 0) return undefined;
    db.products[i] = { ...db.products[i], ...patch, updatedAt: new Date().toISOString() };
    persist(db);
    return db.products[i];
  },
  deleteProduct(id: string): boolean {
    const prod = db.products.find((p) => p._id === id);
    if (!prod) return false;
    if (prod.sold > 0) throw new Error('已有顾客下单,不能删除。请下架或改为 stock=sold');
    db.products = db.products.filter((p) => p._id !== id);
    const tuan = db.tuans.find((t) => t._id === prod.tuanId);
    if (tuan) {
      tuan.productCount = db.products.filter((p) => p.tuanId === tuan._id).length;
      tuan.updatedAt = new Date().toISOString();
    }
    persist(db);
    return true;
  },

  // ---- 写:分类 ----
  createCategory(name: string, sort: number): Category {
    const c: Category = {
      _id: 'cat_' + Date.now(),
      name,
      sort,
      isActive: true,
      createdAt: new Date().toISOString(),
    };
    db.categories.push(c);
    persist(db);
    return c;
  },
  updateCategory(id: string, patch: Partial<Category>): Category | undefined {
    const i = db.categories.findIndex((c) => c._id === id);
    if (i < 0) return undefined;
    db.categories[i] = { ...db.categories[i], ...patch };
    persist(db);
    return db.categories[i];
  },
  deleteCategory(id: string): boolean {
    const used = db.products.some((p) => p.categoryIds.includes(id));
    if (used) throw new Error('该分类下还有商品,不能删除');
    const before = db.categories.length;
    db.categories = db.categories.filter((c) => c._id !== id);
    persist(db);
    return db.categories.length < before;
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
        return (
          o.orderNo.toLowerCase().includes(k) ||
          o.userSnapshot.name.toLowerCase().includes(k) ||
          o.userSnapshot.phone.includes(k) ||
          o.items.some((it) => it.title.toLowerCase().includes(k))
        );
      })
      .sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));
  },
  getOrder(id: string): Order | undefined {
    return db.orders.find((o) => o._id === id);
  },
  updateOrderStatus(id: string, status: OrderStatus): Order | undefined {
    const i = db.orders.findIndex((o) => o._id === id);
    if (i < 0) return undefined;
    const now = new Date().toISOString();
    db.orders[i] = {
      ...db.orders[i],
      status,
      updatedAt: now,
      ...(status === 'shipped' ? { shippedAt: now } : {}),
    };
    persist(db);
    return db.orders[i];
  },

  // ---- 统计 ----
  stats() {
    const activeTuans = db.tuans.filter((t) => t.status === 'on_sale').length;
    const activeProducts = db.products.filter((p) => {
      const t = db.tuans.find((x) => x._id === p.tuanId);
      return t?.status === 'on_sale' && p.stock > p.sold;
    }).length;
    // 今日订单
    const todayStart = new Date().setHours(0, 0, 0, 0);
    const paidToday = db.orders.filter(
      (o) => (o.status === 'paid' || o.status === 'shipped' || o.status === 'completed') &&
             o.paidAt && new Date(o.paidAt).getTime() >= todayStart
    );
    return {
      activeTuans,
      activeProducts,
      orderCount: paidToday.length,
      gmvCents: paidToday.reduce((s, o) => s + o.amount, 0),
    };
  },

  // ---- 调试 ----
  reset() {
    db = {
      tuans: [...seedTuans], products: [...seedProducts],
      categories: [...seedCategories], orders: [...seedOrders],
    };
    persist(db);
  },
};
