import { callCloud } from './client';
import type { Order } from '../types';

export interface CreateOrderItem {
  tuanItemId: string;
  quantity: number;
}

export interface PayParams {
  __stub?: boolean;
  // 真实模式 HuePay 网页通道:redirectUrl 指 HuePay 收银台
  redirectUrl?: string;
  // JSAPI 兼容字段(stub 模式有,真实模式可能也有)
  timeStamp?: string;
  nonceStr?: string;
  package?: string;
  signType?: string;
  paySign?: string;
}

export interface CreateOrderRes {
  code: 0;
  orderId: string;
  orderNo: string;
  outTradeNo: string;
  payParams: PayParams;
}

export async function createOrder(payload: {
  items: CreateOrderItem[];
  addressId: string;
  remark?: string;
}): Promise<CreateOrderRes> {
  return callCloud('createOrder', payload);
}

export async function simulatePay(orderId: string): Promise<{ code: 0 }> {
  return callCloud('_dev/simulatePay', { orderId });
}

export async function listMyOrders(filter?: { status?: string }): Promise<Order[]> {
  const r = await callCloud<{ items: Order[] }>('listMyOrders', filter || {});
  return r.items;
}

export async function getOrderDetail(orderId: string): Promise<Order> {
  const r = await callCloud<{ order: Order }>('getOrderDetail', { orderId });
  return r.order;
}

export async function cancelOrder(orderId: string): Promise<{ code: 0 }> {
  return callCloud('cancelOrder', { orderId });
}

export async function requestRefund(orderId: string): Promise<{ code: 0 }> {
  return callCloud('requestRefund', { orderId });
}

export async function mergeCart(
  items: { tuanItemId: string; quantity: number; addedAt?: string }[],
): Promise<{ code: 0 }> {
  return callCloud('upsertCart', { items, merge: true });
}
