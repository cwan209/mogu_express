// 全项目共享数据模型。与云函数返回保持一致。
// 金额单位:分(整数,CNY),前端显示时 / 100 保留两位。

export type TuanStatus =
  | 'draft'       // 草稿,未定时间
  | 'scheduled'   // 已安排,未到开始时间
  | 'on_sale'     // 开团中
  | 'closed'      // 已截团
  | 'archived';   // 归档(不在前台展示)

export interface Tuan {
  _id: string;
  title: string;
  description: string;
  announcement?: string;  // 团公告(进入团详情时弹窗显示)
  coverFileId: string;
  startAt: string;        // ISO
  endAt: string;          // ISO
  status: TuanStatus;
  productCount: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * 商品库(catalog)— 独立于团。只有稳定属性。
 * price/stock/sort/section 不在这里,而在 TuanItem 上。
 */
export interface CatalogProduct {
  _id: string;
  title: string;
  description: string;
  coverFileId: string;
  imageFileIds: string[];
  categoryIds: string[];
  createdAt: string;
  updatedAt: string;
  // 扩展字段(D3 引入)— 后端 productCRUD list 模式直接返回 products 文档
  brand?: string;
  spec?: string;
  basePrice?: number;        // cents
  englishName?: string;
  courierName?: string;
  courierFactor?: number;
  secondaryImages?: Array<{ url: string; caption: string }>;
}

/**
 * 团内商品实例 — 商品挂到某个团的价格/库存/分组。
 */
export interface TuanItem {
  _id: string;
  tuanId: string;
  productId: string;
  price: number;          // cents
  stock: number;
  sold: number;
  sort: number;
  section?: string | null;
  tags?: string[];
  participantCount: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Joined view:后端 listProducts({tuanId})/getTuanDetail 返回的扁平形态。
 * _id = tuanItemId(兼容旧 UI 以 _id 做主键的习惯)。
 * 保留 "Product" 这个类型名避免波及所有页面代码。
 */
export interface Product {
  _id: string;                // = tuanItemId
  tuanItemId: string;
  productId: string;
  tuanId: string;
  title: string;
  description: string;
  coverFileId: string;
  imageFileIds: string[];
  categoryIds: string[];
  section?: string | null;
  tags?: string[];
  price: number;
  stock: number;
  sold: number;
  sort: number;
  participantCount: number;
  // 扩展字段(catalog 上的稳定属性,join 进来)
  brand?: string;
  spec?: string;
  basePrice?: number;        // cents
  englishName?: string;
  courierName?: string;
  courierFactor?: number;
  secondaryImages?: Array<{ url: string; caption: string }>;
}

export interface Category {
  _id: string;
  name: string;
  sort: number;
  isActive: boolean;
  createdAt: string;
}

export interface Announcement {
  _id: string;
  image: string;
  link: string;
  sortOrder: number;
  active: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface Participant {
  // 脱敏过的公开快照,不暴露 openid
  id: string;
  nickName: string;
  avatar: string;
  quantity: number;
  paidAt: string;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
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
  tuanItemId?: string;    // 新模型加的快照字段
  productId: string;
  tuanId: string;
  title: string;
  price: number;     // cents
  quantity: number;
  subtotal: number;  // cents
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

export interface ShippingFee {
  amount: number;            // cents
  outTradeNo: string;        // SHIP 前缀
  payStatus: 'pending' | 'paid' | 'failed';
  setAt: string;
  paidAt: string | null;
}

export interface Order {
  _id: string;
  orderNo: string;
  outTradeNo: string;
  openid: string;
  userSnapshot: {
    nickname?: string;
    avatar?: string | null;
    groupId?: string | null;
    name?: string;        // legacy
    phone?: string;       // legacy
  };
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
  shippingFee?: ShippingFee;
  notes?: {
    buyer?: string;
    seller?: string;
  };
  tracking?: {
    weight?: number | null;
    courierName?: string | null;
    courierNo?: string | null;
    setAt?: string | null;
  };
  createdAt: string;
  updatedAt: string;
}
