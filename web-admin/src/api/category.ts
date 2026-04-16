import { callCloud } from './client';
import type { Category } from '../types';

export async function listCategories(): Promise<Category[]> {
  const r = await callCloud<{ items: Category[] }>('_admin/categoryCRUD', { action: 'list' });
  return r.items;
}

export async function createCategory(name: string, sort: number): Promise<{ _id: string }> {
  return callCloud('_admin/categoryCRUD', { action: 'create', payload: { name, sort } });
}

export async function updateCategory(id: string, patch: Partial<Category>): Promise<void> {
  await callCloud('_admin/categoryCRUD', { action: 'update', id, patch });
}

export async function deleteCategory(id: string): Promise<void> {
  await callCloud('_admin/categoryCRUD', { action: 'delete', id });
}
