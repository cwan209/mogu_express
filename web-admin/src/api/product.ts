// 商品库(CatalogProduct)相关 API。价格/库存走 tuanItem.ts。
import { callCloud } from './client';
import type { CatalogProduct, Product } from '../types';

export async function listProducts(filter?: { tuanId?: string; categoryId?: string }): Promise<Product[]> {
  const r = await callCloud<{ items: Product[] }>('_admin/productCRUD', {
    action: 'list',
    ...(filter?.tuanId ? { tuanId: filter.tuanId } : {}),
    ...(filter?.categoryId ? { categoryId: filter.categoryId } : {}),
  });
  return r.items;
}

/** 商品库列表(不限团) */
export async function listCatalog(filter?: { categoryId?: string }): Promise<CatalogProduct[]> {
  const r = await callCloud<{ items: CatalogProduct[] }>('_admin/productCRUD', {
    action: 'list',
    ...(filter?.categoryId ? { categoryId: filter.categoryId } : {}),
  });
  return r.items as any;
}

export async function getCatalog(id: string): Promise<CatalogProduct> {
  const items = await listCatalog();
  const p = items.find((x) => x._id === id);
  if (!p) throw new Error('商品库条目不存在');
  return p;
}

export interface ProductPayload {
  title: string;
  description?: string;
  coverFileId?: string;
  imageFileIds?: string[];
  categoryIds?: string[];
  // 兼容:若提供,createCatalog 同时创建 tuan_item
  tuanId?: string;
  price?: number;
  stock?: number;
  sort?: number;
  section?: string | null;
}

export async function createProduct(input: ProductPayload): Promise<{ _id: string; tuanItemId?: string }> {
  return callCloud('_admin/productCRUD', { action: 'create', payload: input });
}

export async function updateProduct(id: string, patch: Partial<ProductPayload>): Promise<void> {
  await callCloud('_admin/productCRUD', { action: 'update', id, patch });
}

export async function deleteProduct(id: string): Promise<void> {
  await callCloud('_admin/productCRUD', { action: 'delete', id });
}

/**
 * 便捷:通过 tuanItemId 读一个 Joined view(含 price/stock/section)。
 * 当页面需要编辑团内实例时用。
 */
export async function getProduct(tuanItemId: string): Promise<Product> {
  // 通过 getProductDetail 拿 joined view
  const r = await callCloud<{ product: Product }>('getProductDetail', { tuanItemId });
  return r.product;
}
