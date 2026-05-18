import { callCloud } from './client';
import type { Announcement } from '../types';

export async function listAnnouncements(): Promise<Announcement[]> {
  const r = await callCloud<{ items: Announcement[] }>('_admin/announcementCRUD', { action: 'list' });
  return r.items;
}

export async function createAnnouncement(payload: {
  image: string;
  link: string;
  sortOrder?: number;
  active?: boolean;
}): Promise<string> {
  const r = await callCloud<{ _id: string }>('_admin/announcementCRUD', { action: 'create', payload });
  return r._id;
}

export async function updateAnnouncement(id: string, patch: Partial<Announcement>): Promise<void> {
  await callCloud('_admin/announcementCRUD', { action: 'update', id, patch });
}

export async function deleteAnnouncement(id: string): Promise<void> {
  await callCloud('_admin/announcementCRUD', { action: 'delete', id });
}
