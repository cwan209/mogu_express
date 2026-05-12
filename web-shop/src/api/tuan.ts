import { callCloud } from './client';
import type { Tuan, Product, Participant } from '../types';

export async function listTuans(): Promise<Tuan[]> {
  const r = await callCloud<{ items: Tuan[] }>('listTuans');
  return r.items;
}

export async function getTuanDetail(id: string): Promise<{ tuan: Tuan; products: Product[] }> {
  return callCloud('getTuanDetail', { tuanId: id });
}

export async function getProductDetail(
  tuanItemId: string,
): Promise<{ product: Product; tuan: Tuan; participants: Participant[] }> {
  return callCloud('getProductDetail', { tuanItemId });
}

export interface HomeBanner {
  enabled: boolean;
  title: string;
  content: string;
  updatedAt?: string;
}

export async function getHomeBanner(): Promise<HomeBanner | null> {
  const r = await callCloud<{ banner: HomeBanner | null }>('getHomeBanner');
  return r.banner;
}
