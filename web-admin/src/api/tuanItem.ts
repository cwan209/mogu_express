// 团内商品实例(tuan_items)API
import { callCloud } from './client';
import type { Product } from '../types';

export async function listTuanItems(tuanId: string): Promise<Product[]> {
  const r = await callCloud<{ items: Product[] }>('_admin/tuanItemCRUD', {
    action: 'list', tuanId,
  });
  return r.items || [];
}

export interface TuanItemPayload {
  tuanId: string;
  productId: string;
  price: number;
  stock: number;
  sort?: number;
  section?: string | null;
}

export async function createTuanItem(input: TuanItemPayload): Promise<{ _id: string }> {
  return callCloud('_admin/tuanItemCRUD', { action: 'create', ...input });
}

export async function updateTuanItem(id: string, patch: Partial<TuanItemPayload>): Promise<void> {
  await callCloud('_admin/tuanItemCRUD', { action: 'update', id, patch });
}

export async function deleteTuanItem(id: string): Promise<void> {
  await callCloud('_admin/tuanItemCRUD', { action: 'delete', id });
}

export async function copyTuanItems(sourceTuanId: string, targetTuanId: string): Promise<{ copied: number; skipped: number }> {
  return callCloud('_admin/tuanItemCRUD', { action: 'copyFromTuan', sourceTuanId, targetTuanId });
}
