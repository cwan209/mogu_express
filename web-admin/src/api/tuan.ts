import { callCloud } from './client';
import type { Tuan, TuanStatus } from '../types';

export async function listTuans(filter?: { status?: TuanStatus }): Promise<Tuan[]> {
  const r = await callCloud<{ items: Tuan[] }>('_admin/tuanCRUD', {
    action: 'list',
    ...(filter?.status ? { status: filter.status } : {}),
  });
  return r.items;
}

export async function getTuan(id: string): Promise<Tuan> {
  // 用 list 再筛出(M1 数据量小,足够;后期加专门的 get action)
  const items = await listTuans();
  const t = items.find((x) => x._id === id);
  if (!t) throw new Error('团不存在');
  return t;
}

export async function createTuan(
  input: Omit<Tuan, '_id' | 'productCount' | 'createdAt' | 'updatedAt'>
): Promise<{ _id: string }> {
  return callCloud('_admin/tuanCRUD', { action: 'create', payload: input });
}

export async function updateTuan(id: string, patch: Partial<Tuan>): Promise<void> {
  await callCloud('_admin/tuanCRUD', { action: 'update', id, patch });
}

export async function deleteTuan(id: string): Promise<void> {
  await callCloud('_admin/tuanCRUD', { action: 'delete', id });
}
