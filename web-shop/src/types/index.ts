// web-shop 共享类型 — 跟 web-admin/src/types.ts 保持同步
// 临时单独维护一份(避免引入 TS path 跨包配置复杂度);后续可考虑抽 packages/types

export type TuanStatus = 'draft' | 'scheduled' | 'on_sale' | 'closed' | 'archived';

export interface Tuan {
  _id: string;
  title: string;
  description: string;
  announcement?: string;
  coverFileId: string;
  startAt: string;
  endAt: string;
  status: TuanStatus;
  productCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Product {
  _id: string;
  tuanItemId: string;
  productId: string;
  tuanId: string;
  title: string;
  description: string;
  coverFileId: string;
  imageFileIds: string[];
  categoryIds: string[];
  section?: string | null;
  price: number;
  stock: number;
  sold: number;
  sort: number;
  participantCount: number;
}

export interface Category {
  _id: string;
  name: string;
  sort: number;
  isActive: boolean;
  createdAt: string;
}

export interface Participant {
  id: string;
  nickName: string;
  avatar: string;
  quantity: number;
  paidAt: string;
}

export type OrderStatus =
  | 'pending_pay'
  | 'paid'
  | 'refund_requested'
  | 'shipped'
  | 'completed'
  | 'cancelled'
  | 'refunded';

export type PayStatus = 'none' | 'pending' | 'paid' | 'failed' | 'refunded';

export interface OrderItem {
  tuanItemId?: string;
  productId: string;
  tuanId: string;
  title: string;
  price: number;
  quantity: number;
  subtotal: number;
  coverFileId: string;
  section?: string | null;
}

export interface ShippingAddress {
  recipient: string;
  phone: string;
  line1: string;
  line2?: string;
  suburb: string;
  state: string;
  postcode: string;
}

export interface Order {
  _id: string;
  orderNo: string;
  outTradeNo: string;
  openid: string;
  userSnapshot: { name: string; phone: string };
  items: OrderItem[];
  amount: number;
  shipping: ShippingAddress;
  remark: string;
  status: OrderStatus;
  payStatus: PayStatus;
  paidAt?: string;
  shippedAt?: string;
  refundRequestedAt?: string;
  refundedAt?: string;
  refundId?: string;
  refundRejectReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserProfile {
  openid: string;
  name?: string;
  phone?: string;
  defaultAddressId?: string;
  registeredAt?: string;
}

export interface CartItem {
  productId: string;
  tuanItemId: string;
  tuanId: string;
  quantity: number;
  addedAt: string;
}
