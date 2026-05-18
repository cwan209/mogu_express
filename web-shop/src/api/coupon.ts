import { callCloud } from './client';
import type { Coupon, CouponStatus } from '../types';

export async function listMyCoupons(status?: CouponStatus): Promise<Coupon[]> {
  const r = await callCloud<{ items: Coupon[] }>(
    'listMyCoupons',
    status ? { status } : {},
  );
  return r.items || [];
}
