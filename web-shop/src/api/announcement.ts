import { callCloud } from './client';

export interface Announcement {
  _id: string;
  image: string;
  link: string;
  sortOrder: number;
  active: boolean;
  createdAt: string;
  updatedAt?: string;
}

export async function listAnnouncements(): Promise<Announcement[]> {
  const r = await callCloud<{ items: Announcement[] }>('listAnnouncements');
  return r.items || [];
}
