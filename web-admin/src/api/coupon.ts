import { callCloud } from './client';
import type { Coupon, CouponStatus } from '../types';

export async function listCoupons(filter?: {
  status?: CouponStatus;
  openid?: string;
}): Promise<Coupon[]> {
  const r = await callCloud<{ items: Coupon[] }>('_admin/listCoupons', {
    ...(filter?.status ? { status: filter.status } : {}),
    ...(filter?.openid ? { openid: filter.openid } : {}),
  });
  return r.items;
}

export async function issueCoupon(input: {
  openid: string;
  amount: number;   // cents
  reason: string;
  validFrom?: string;
  validTo?: string;
}): Promise<string> {
  const r = await callCloud<{ _id: string }>('_admin/issueCoupon', input);
  return r._id;
}
