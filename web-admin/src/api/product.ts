import { callCloud } from './client';
import type { Product } from '../types';

export async function listProducts(filter?: { tuanId?: string; categoryId?: string }): Promise<Product[]> {
  const r = await callCloud<{ items: Product[] }>('_admin/productCRUD', {
    action: 'list',
    ...(filter?.tuanId ? { tuanId: filter.tuanId } : {}),
    ...(filter?.categoryId ? { categoryId: filter.categoryId } : {}),
  });
  return r.items;
}

export async function getProduct(id: string): Promise<Product> {
  const items = await listProducts();
  const p = items.find((x) => x._id === id);
  if (!p) throw new Error('商品不存在');
  return p;
}

export async function createProduct(
  input: Omit<Product, '_id' | 'sold' | 'participantCount' | 'createdAt' | 'updatedAt'>
): Promise<{ _id: string }> {
  return callCloud('_admin/productCRUD', { action: 'create', payload: input });
}

export async function updateProduct(id: string, patch: Partial<Product>): Promise<void> {
  await callCloud('_admin/productCRUD', { action: 'update', id, patch });
}

export async function deleteProduct(id: string): Promise<void> {
  await callCloud('_admin/productCRUD', { action: 'delete', id });
}
