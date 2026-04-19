// api/client.ts - 云函数统一调用入口
//
// 环境:
//   VITE_USE_MOCK=true(默认)→ 走 localStorage mockDb
//   VITE_USE_MOCK=false + VITE_API_BASE=http://localhost:4000 → 走本地 Docker 后端
//
// 生产环境(M3+):VITE_USE_MOCK=false + VITE_API_BASE=云开发 HTTP 触发器入口

import axios from 'axios';
import { useAuthStore } from '../auth/store';
import { mockDb } from '../mock/store';
import { hashCheck } from './mock-pw';
import type { Tuan, Product, Category, Order } from '../types';

export const USE_MOCK =
  (import.meta.env.VITE_USE_MOCK ?? 'true').toString().toLowerCase() !== 'false';
export const API_BASE = (import.meta.env.VITE_API_BASE || 'http://localhost:4000').replace(/\/$/, '');

const http = axios.create({ timeout: 20_000 });

export async function callCloud<T = any>(name: string, data: any = {}): Promise<T> {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 120));
    const r = await mockDispatch(name, data);
    if (r && typeof r === 'object' && 'code' in r && r.code !== 0) {
      throw Object.assign(new Error((r as any).message || 'mock error'), { code: (r as any).code });
    }
    return r as T;
  }

  // Real HTTP backend
  const token = useAuthStore.getState().token;
  const body = token ? { ...data, token } : data;
  try {
    const res = await http.post(`${API_BASE}/cloud/${name}`, body);
    const r = res.data;
    if (r && typeof r === 'object' && 'code' in r && r.code !== 0) {
      throw Object.assign(new Error(r.message || 'cloud error'), { code: r.code });
    }
    return r as T;
  } catch (err: any) {
    if (err.response?.status === 401) {
      useAuthStore.getState().logout();
    }
    throw err;
  }
}

// ========= Mock dispatch =========
// 让 mock 模式对外表现与真实云函数完全一致

async function mockDispatch(name: string, data: any): Promise<any> {
  switch (name) {
    // ==== Admin ====
    case '_admin/adminLogin':    return mockAdminLogin(data);
    case '_admin/tuanCRUD':      return mockTuanCRUD(data);
    case '_admin/productCRUD':   return mockProductCRUD(data);
    case '_admin/categoryCRUD':  return mockCategoryCRUD(data);
    case '_admin/listAllOrders': return mockListAllOrders(data);
    case '_admin/markShipped':   return mockMarkShipped(data);
    case '_admin/markCompleted': return mockMarkCompleted(data);

    // ==== Public ====
    case 'listTuans':        return { code: 0, items: mockDb.listTuans() };
    case 'getTuanDetail':    return mockGetTuanDetail(data);
    case 'listProducts':     return { code: 0, items: mockDb.listProducts({ tuanId: data.tuanId, categoryId: data.categoryId }) };
    case 'getProductDetail': return mockGetProductDetail(data);
    case 'listCategories':   return { code: 0, items: mockDb.listCategories() };

    default:
      return { code: 404, message: `[mock] unknown cloud function: ${name}` };
  }
}

function mockAdminLogin({ username, password }: any) {
  // M1 一直接受 admin/admin。真实后端用 bcrypt
  if (!username || !password) return { code: 1, message: 'username/password required' };
  if (hashCheck(username, password)) {
    return {
      code: 0,
      token: 'mock-token-' + Date.now(),
      admin: { id: 'a1', username, role: 'owner' },
    };
  }
  return { code: 2, message: 'invalid credentials' };
}

function mockTuanCRUD({ action, payload, id, patch, status }: any) {
  switch (action) {
    case 'list': {
      const items = mockDb.listTuans(status ? { status } : undefined);
      return { code: 0, items };
    }
    case 'create': {
      const t = mockDb.createTuan({
        title: payload.title,
        description: payload.description || '',
        coverFileId: payload.coverFileId || '',
        startAt: payload.startAt,
        endAt: payload.endAt,
        status: payload.status || 'draft',
      });
      return { code: 0, _id: t._id };
    }
    case 'update': {
      const t = mockDb.updateTuan(id, patch);
      if (!t) return { code: 2, message: 'not found' };
      return { code: 0 };
    }
    case 'delete': {
      try { mockDb.deleteTuan(id); return { code: 0 }; }
      catch (e: any) { return { code: 1, message: e.message }; }
    }
    default: return { code: 1, message: 'unknown action' };
  }
}

function mockProductCRUD({ action, payload, id, patch, tuanId, categoryId }: any) {
  switch (action) {
    case 'list': {
      const items = mockDb.listProducts({ tuanId, categoryId });
      return { code: 0, items, total: items.length };
    }
    case 'create': {
      const p = mockDb.createProduct({
        tuanId: payload.tuanId,
        title: payload.title,
        description: payload.description || '',
        coverFileId: payload.coverFileId || '',
        imageFileIds: payload.imageFileIds || [],
        categoryIds: payload.categoryIds || [],
        section: (payload.section || '').trim() || null,
        price: payload.price | 0,
        stock: payload.stock | 0,
        sort: payload.sort | 0,
      });
      return { code: 0, _id: p._id };
    }
    case 'update': {
      // section 字段:trim 后空串存 null
      const normalized = { ...patch };
      if ('section' in normalized) {
        const s = (normalized.section || '').trim();
        normalized.section = s || null;
      }
      const p = mockDb.updateProduct(id, normalized);
      if (!p) return { code: 2, message: 'not found' };
      return { code: 0 };
    }
    case 'delete': {
      try { mockDb.deleteProduct(id); return { code: 0 }; }
      catch (e: any) { return { code: 1, message: e.message }; }
    }
    default: return { code: 1, message: 'unknown action' };
  }
}

function mockCategoryCRUD({ action, payload, id, patch }: any) {
  switch (action) {
    case 'list': return { code: 0, items: mockDb.listCategories() };
    case 'create': {
      const c = mockDb.createCategory(payload.name, payload.sort || 0);
      return { code: 0, _id: c._id };
    }
    case 'update': {
      const c = mockDb.updateCategory(id, patch);
      if (!c) return { code: 2, message: 'not found' };
      return { code: 0 };
    }
    case 'delete': {
      try { mockDb.deleteCategory(id); return { code: 0 }; }
      catch (e: any) { return { code: 1, message: e.message }; }
    }
    default: return { code: 1, message: 'unknown action' };
  }
}

function mockListAllOrders({ status, tuanId, dateFrom, dateTo, keyword }: any) {
  const items = mockDb.listOrders({ status, tuanId, dateFrom, dateTo, keyword });
  return { code: 0, items, total: items.length };
}

function mockMarkShipped({ orderId, orderIds }: any) {
  const ids: string[] = orderIds && orderIds.length ? orderIds : orderId ? [orderId] : [];
  if (!ids.length) return { code: 1, message: 'orderIds required' };
  let ok = 0;
  for (const id of ids) {
    const o = mockDb.getOrder(id);
    if (o && o.status === 'paid') {
      mockDb.updateOrderStatus(id, 'shipped');
      ok++;
    }
  }
  return { code: 0, updated: ok };
}

function mockMarkCompleted({ orderId, orderIds }: any) {
  const ids: string[] = orderIds && orderIds.length ? orderIds : orderId ? [orderId] : [];
  if (!ids.length) return { code: 1, message: 'orderIds required' };
  let ok = 0;
  for (const id of ids) {
    const o = mockDb.getOrder(id);
    if (o && o.status === 'shipped') {
      mockDb.updateOrderStatus(id, 'completed');
      ok++;
    }
  }
  return { code: 0, updated: ok };
}

function mockGetTuanDetail({ tuanId }: any) {
  const tuan = mockDb.getTuan(tuanId);
  if (!tuan) return { code: 2, message: 'not found' };
  const products = mockDb.listProducts({ tuanId });
  return { code: 0, tuan, products };
}

function mockGetProductDetail({ productId }: any) {
  const product = mockDb.getProduct(productId);
  if (!product) return { code: 2, message: 'not found' };
  const tuan = mockDb.getTuan(product.tuanId);
  return { code: 0, product, tuan, participants: [] };
}

// type re-exports for convenience
export type { Tuan, Product, Category, Order };
