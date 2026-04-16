// Seed 数据 — 首次加载 mock 存储时写入 localStorage,后续仅用内存副本
import type { Tuan, Product, Category, Participant, Order } from '../types';

const now = Date.now();
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

const isoOffset = (offsetMs: number) => new Date(now + offsetMs).toISOString();

// Mock 封面图:真实 Unsplash 免费商用图片;上线前换商家上传的真图
const IMG = {
  broccoli:  'https://images.unsplash.com/photo-1518164147695-36c13dd568f5?w=600&h=600&fit=crop',
  blueberry: 'https://images.unsplash.com/photo-1502741338009-cac2772e18bc?w=600&h=600&fit=crop',
  honeydew:  'https://images.unsplash.com/photo-1773487743024-756afae04b87?w=600&h=600&fit=crop',
  wagyu:     'https://images.unsplash.com/photo-1625604086988-6e41981275fa?w=600&h=600&fit=crop',
  lamb:      'https://images.unsplash.com/photo-1602470520998-f4a52199a3d6?w=600&h=600&fit=crop',
  milk:      'https://images.unsplash.com/photo-1557759171-258278b1578b?w=600&h=600&fit=crop',
  yogurt:    'https://images.unsplash.com/photo-1571212515416-fef01fc43637?w=600&h=600&fit=crop',
  gift:      'https://images.unsplash.com/photo-1549465220-1a8b9238cd48?w=600&h=600&fit=crop',
  fresh:     'https://images.unsplash.com/photo-1757627550652-30788bfce978?w=800&h=450&fit=crop',
  bbq:       'https://images.unsplash.com/photo-1558030137-d464dd688b00?w=800&h=450&fit=crop',
  dairy:     'https://images.unsplash.com/photo-1552767059-ce182ead6c1b?w=800&h=450&fit=crop',
  cny:       'https://images.unsplash.com/photo-1549465220-1a8b9238cd48?w=800&h=450&fit=crop',
};
const avatar = (seed: string) => {
  const colors = ['F59E0B', '10B981', '3B82F6', '8B5CF6', 'EC4899', 'F97316'];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return `https://placehold.co/80x80/${colors[h % colors.length]}/ffffff?text=${encodeURIComponent(seed)}`;
};

export const seedCategories: Category[] = [
  { _id: 'cat_fresh',  name: '生鲜蔬果', sort: 1, isActive: true, createdAt: isoOffset(-30 * DAY) },
  { _id: 'cat_meat',   name: '肉类海鲜', sort: 2, isActive: true, createdAt: isoOffset(-30 * DAY) },
  { _id: 'cat_dairy',  name: '乳制品',   sort: 3, isActive: true, createdAt: isoOffset(-30 * DAY) },
  { _id: 'cat_snack',  name: '零食点心', sort: 4, isActive: true, createdAt: isoOffset(-30 * DAY) },
  { _id: 'cat_daily',  name: '日用百货', sort: 5, isActive: true, createdAt: isoOffset(-30 * DAY) },
];

export const seedTuans: Tuan[] = [
  {
    _id: 'tuan_001',
    title: '本周生鲜团 · 墨尔本周三截团',
    description: '澳洲本地产地直供,当周采摘。周三 18:00 截团,周五起自送上门。',
    coverFileId: IMG.fresh,
    startAt: isoOffset(-2 * DAY),
    endAt: isoOffset(2 * DAY),
    status: 'on_sale',
    productCount: 3,
    createdAt: isoOffset(-3 * DAY),
    updatedAt: isoOffset(-1 * HOUR),
  },
  {
    _id: 'tuan_002',
    title: '周末烧烤肉类团',
    description: '澳洲和牛 / 羊排 / 鸡翅,周六前截团。',
    coverFileId: IMG.bbq,
    startAt: isoOffset(-1 * DAY),
    endAt: isoOffset(5 * DAY),
    status: 'on_sale',
    productCount: 2,
    createdAt: isoOffset(-2 * DAY),
    updatedAt: isoOffset(-1 * HOUR),
  },
  {
    _id: 'tuan_003',
    title: '下周乳制品预订团(即将开团)',
    description: 'A2 牛奶、Pauls 酸奶、手工奶酪。下周一开团。',
    coverFileId: IMG.dairy,
    startAt: isoOffset(2 * DAY),
    endAt: isoOffset(9 * DAY),
    status: 'scheduled',
    productCount: 2,
    createdAt: isoOffset(-1 * HOUR),
    updatedAt: isoOffset(-1 * HOUR),
  },
  {
    _id: 'tuan_004',
    title: '已结束 · 上周年货团',
    description: '历史归档团,不在前台展示。',
    coverFileId: IMG.cny,
    startAt: isoOffset(-10 * DAY),
    endAt: isoOffset(-3 * DAY),
    status: 'closed',
    productCount: 1,
    createdAt: isoOffset(-12 * DAY),
    updatedAt: isoOffset(-3 * DAY),
  },
];

export const seedProducts: Product[] = [
  // tuan_001 · 生鲜
  {
    _id: 'prod_101', tuanId: 'tuan_001',
    title: '澳洲本地有机西兰花',
    description: '昆士兰产地直送,每袋约 500g。',
    coverFileId: IMG.broccoli,
    imageFileIds: [IMG.broccoli, IMG.fresh],
    categoryIds: ['cat_fresh'],
    price: 599, stock: 50, sold: 12, sort: 1, participantCount: 8,
    createdAt: isoOffset(-3 * DAY), updatedAt: isoOffset(-1 * HOUR),
  },
  {
    _id: 'prod_102', tuanId: 'tuan_001',
    title: '塔斯马尼亚蓝莓',
    description: '125g 一盒,果大味甜,空运直达。',
    coverFileId: IMG.blueberry,
    imageFileIds: [IMG.blueberry],
    categoryIds: ['cat_fresh'],
    price: 899, stock: 30, sold: 18, sort: 2, participantCount: 14,
    createdAt: isoOffset(-3 * DAY), updatedAt: isoOffset(-1 * HOUR),
  },
  {
    _id: 'prod_103', tuanId: 'tuan_001',
    title: '新西兰蜜瓜',
    description: '一整颗,约 2kg。',
    coverFileId: IMG.honeydew,
    imageFileIds: [],
    categoryIds: ['cat_fresh'],
    price: 1280, stock: 20, sold: 5, sort: 3, participantCount: 5,
    createdAt: isoOffset(-3 * DAY), updatedAt: isoOffset(-1 * HOUR),
  },

  // tuan_002 · 肉类
  {
    _id: 'prod_201', tuanId: 'tuan_002',
    title: '澳洲 M5 和牛肩肉 500g',
    description: '冷冻真空包装,BBQ 佳选。',
    coverFileId: IMG.wagyu,
    imageFileIds: [],
    categoryIds: ['cat_meat'],
    price: 3880, stock: 15, sold: 6, sort: 1, participantCount: 4,
    createdAt: isoOffset(-2 * DAY), updatedAt: isoOffset(-1 * HOUR),
  },
  {
    _id: 'prod_202', tuanId: 'tuan_002',
    title: '腌制羊排 6 根',
    description: '预腌制好,开袋即烤。',
    coverFileId: IMG.lamb,
    imageFileIds: [],
    categoryIds: ['cat_meat'],
    price: 2580, stock: 25, sold: 9, sort: 2, participantCount: 7,
    createdAt: isoOffset(-2 * DAY), updatedAt: isoOffset(-1 * HOUR),
  },

  // tuan_003 · 乳制品(scheduled)
  {
    _id: 'prod_301', tuanId: 'tuan_003',
    title: 'A2 全脂牛奶 2L',
    description: '',
    coverFileId: IMG.milk,
    imageFileIds: [],
    categoryIds: ['cat_dairy'],
    price: 680, stock: 100, sold: 0, sort: 1, participantCount: 0,
    createdAt: isoOffset(-1 * HOUR), updatedAt: isoOffset(-1 * HOUR),
  },
  {
    _id: 'prod_302', tuanId: 'tuan_003',
    title: 'Pauls 希腊酸奶 1kg',
    description: '',
    coverFileId: IMG.yogurt,
    imageFileIds: [],
    categoryIds: ['cat_dairy'],
    price: 780, stock: 80, sold: 0, sort: 2, participantCount: 0,
    createdAt: isoOffset(-1 * HOUR), updatedAt: isoOffset(-1 * HOUR),
  },

  // tuan_004 · 已关闭
  {
    _id: 'prod_401', tuanId: 'tuan_004',
    title: '(已结束)年货礼盒',
    description: '',
    coverFileId: IMG.gift,
    imageFileIds: [],
    categoryIds: ['cat_snack'],
    price: 5888, stock: 40, sold: 40, sort: 1, participantCount: 35,
    createdAt: isoOffset(-12 * DAY), updatedAt: isoOffset(-3 * DAY),
  },
];

const AVATARS = [
  avatar('小明'), avatar('阿华'), avatar('周'), avatar('李'), avatar('E'), avatar('J'),
];

// 种子订单 — 模拟已有顾客下单
export const seedOrders: Order[] = [
  {
    _id: 'order_seed_1',
    orderNo: 'MG20260414143012001',
    outTradeNo: 'TRADESEED1',
    openid: 'mock_customer_a',
    userSnapshot: { name: '王小姐', phone: '0412345678' },
    items: [
      { productId: 'prod_102', tuanId: 'tuan_001', title: '塔斯马尼亚蓝莓',
        price: 899, quantity: 2, subtotal: 1798,
        coverFileId: IMG.blueberry },
      { productId: 'prod_101', tuanId: 'tuan_001', title: '澳洲本地有机西兰花',
        price: 599, quantity: 1, subtotal: 599,
        coverFileId: IMG.broccoli },
    ],
    amount: 2397,
    shipping: {
      recipient: '王小姐', phone: '0412345678',
      line1: '12 Bridge Rd', line2: 'Unit 3',
      suburb: 'Richmond', state: 'VIC', postcode: '3121',
    },
    remark: '不要香菜,谢谢',
    status: 'paid', payStatus: 'paid',
    paidAt: isoOffset(-6 * HOUR), createdAt: isoOffset(-6 * HOUR), updatedAt: isoOffset(-6 * HOUR),
  },
  {
    _id: 'order_seed_2',
    orderNo: 'MG20260414150033002',
    outTradeNo: 'TRADESEED2',
    openid: 'mock_customer_b',
    userSnapshot: { name: 'John Smith', phone: '0478112233' },
    items: [
      { productId: 'prod_201', tuanId: 'tuan_002', title: '澳洲 M5 和牛肩肉 500g',
        price: 3880, quantity: 1, subtotal: 3880,
        coverFileId: IMG.wagyu },
    ],
    amount: 3880,
    shipping: {
      recipient: 'John Smith', phone: '0478112233',
      line1: '55 Chapel St', suburb: 'South Yarra',
      state: 'VIC', postcode: '3141',
    },
    remark: '',
    status: 'paid', payStatus: 'paid',
    paidAt: isoOffset(-3 * HOUR), createdAt: isoOffset(-3 * HOUR), updatedAt: isoOffset(-3 * HOUR),
  },
  {
    _id: 'order_seed_3',
    orderNo: 'MG20260413101523003',
    outTradeNo: 'TRADESEED3',
    openid: 'mock_customer_c',
    userSnapshot: { name: '阿华', phone: '0400888999' },
    items: [
      { productId: 'prod_202', tuanId: 'tuan_002', title: '腌制羊排 6 根',
        price: 2580, quantity: 2, subtotal: 5160,
        coverFileId: IMG.lamb },
      { productId: 'prod_103', tuanId: 'tuan_001', title: '新西兰蜜瓜',
        price: 1280, quantity: 1, subtotal: 1280,
        coverFileId: IMG.honeydew },
    ],
    amount: 6440,
    shipping: {
      recipient: '阿华', phone: '0400888999',
      line1: '8 Springvale Rd', suburb: 'Glen Waverley',
      state: 'VIC', postcode: '3150',
    },
    remark: '周五之前送到',
    status: 'shipped', payStatus: 'paid',
    paidAt: isoOffset(-2 * DAY), shippedAt: isoOffset(-1 * DAY),
    createdAt: isoOffset(-2 * DAY), updatedAt: isoOffset(-1 * DAY),
  },
  {
    _id: 'order_seed_4',
    orderNo: 'MG20260412083245004',
    outTradeNo: 'TRADESEED4',
    openid: 'mock_customer_d',
    userSnapshot: { name: 'Emma Zhang', phone: '0455999000' },
    items: [
      { productId: 'prod_102', tuanId: 'tuan_001', title: '塔斯马尼亚蓝莓',
        price: 899, quantity: 3, subtotal: 2697,
        coverFileId: IMG.blueberry },
    ],
    amount: 2697,
    shipping: {
      recipient: 'Emma Zhang', phone: '0455999000',
      line1: '21 Queens Rd', suburb: 'Melbourne',
      state: 'VIC', postcode: '3004',
    },
    remark: '',
    status: 'completed', payStatus: 'paid',
    paidAt: isoOffset(-4 * DAY), shippedAt: isoOffset(-3 * DAY),
    createdAt: isoOffset(-4 * DAY), updatedAt: isoOffset(-2 * DAY),
  },
  {
    _id: 'order_seed_5',
    orderNo: 'MG20260414163015005',
    outTradeNo: 'TRADESEED5',
    openid: 'mock_customer_e',
    userSnapshot: { name: '李太', phone: '0433111222' },
    items: [
      { productId: 'prod_101', tuanId: 'tuan_001', title: '澳洲本地有机西兰花',
        price: 599, quantity: 5, subtotal: 2995,
        coverFileId: IMG.broccoli },
    ],
    amount: 2995,
    shipping: {
      recipient: '李太', phone: '0433111222',
      line1: '9 Toorak Rd', suburb: 'Toorak',
      state: 'VIC', postcode: '3142',
    },
    remark: '',
    status: 'pending_pay', payStatus: 'pending',
    createdAt: isoOffset(-15 * 60 * 1000), updatedAt: isoOffset(-15 * 60 * 1000),
  },
];

// 每个商品的参与者名单(M1 用假数据;M3 由 payCallback 写入 participant_index)
export function generateParticipants(productId: string, count: number): Participant[] {
  const list: Participant[] = [];
  const names = ['小明', '阿华', '周先生', '李太', 'Emma', 'Jason', '王师傅', 'Lucy', 'Kiki', '阿龙', 'Grace', '张姐'];
  for (let i = 0; i < count && i < 12; i++) {
    list.push({
      id: `${productId}_p${i}`,
      nickName: names[i % names.length],
      avatar: AVATARS[i % AVATARS.length],
      quantity: 1 + (i % 3),
      paidAt: new Date(Date.now() - i * 3600 * 1000).toISOString(),
    });
  }
  return list;
}
