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
  amount: number;
  payParams: PayParams;
}

export async function createOrder(payload: {
  items: CreateOrderItem[];
  addressId: string;
  remark?: string;
}): Promise<CreateOrderRes> {
  // 后端返 { order: {_id, orderNo, outTradeNo, amount, ...}, payParams }
  // 这里扁平化方便前端用
  const r = await callCloud<any>('createOrder', payload);
  return {
    code: 0,
    orderId: r.order._id,
    orderNo: r.order.orderNo,
    outTradeNo: r.order.outTradeNo,
    amount: r.order.amount,
    payParams: r.payParams,
  };
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

export interface PendingOrder {
  _id: string;
  orderNo: string;
  items: Array<{ title: string; quantity: number }>;
  shippingFee: {
    amount: number;
    payStatus: 'pending';
    setAt: string;
    outTradeNo: string;
    paidAt: string | null;
  };
}

export async function getPendingOrders(): Promise<PendingOrder[]> {
  const r = await callCloud<{ orders: PendingOrder[] }>('getPendingOrders', {});
  return r.orders;
}
