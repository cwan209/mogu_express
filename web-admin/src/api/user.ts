import { callCloud } from './client';
import type { UserAdminView } from '../types';

export async function listUsers(filter?: {
  page?: number;
  pageSize?: number;
  keyword?: string;
  hasNotes?: boolean;
  hasTag?: string;
}): Promise<{ items: UserAdminView[]; total: number; page: number; pageSize: number }> {
  const r = await callCloud<{
    items: UserAdminView[];
    total: number;
    page: number;
    pageSize: number;
  }>('_admin/userCRUD', { action: 'list', ...(filter || {}) });
  return r;
}

export async function updateUserAdmin(
  id: string,
  patch: { adminNotes?: string; adminTags?: string[] },
): Promise<void> {
  await callCloud('_admin/userCRUD', { action: 'update', id, patch });
}
