// Seed 数据 — 首次加载 mock 存储时写入 localStorage,后续仅用内存副本
//
// 数据模型:
//   seedCatalog  — 商品库(CatalogProduct)
//   seedTuanItems — 团内实例(TuanItem)
//   seedOrders   — 订单快照里 items 仍是旧形态(order 历史不迁移)
import type { Tuan, CatalogProduct, TuanItem, Category, Participant, Order } from '../types';

const now = Date.now();
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

const isoOffset = (offsetMs: number) => new Date(now + offsetMs).toISOString();

const IMG = {
  broccoli:   'https://images.unsplash.com/photo-1518164147695-36c13dd568f5?w=600&h=600&fit=crop',
  spinach:    'https://images.unsplash.com/photo-1576045057995-568f588f82fb?w=600&h=600&fit=crop',
  tomato:     'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=600&h=600&fit=crop',
  blueberry:  'https://images.unsplash.com/photo-1502741338009-cac2772e18bc?w=600&h=600&fit=crop',
  strawberry: 'https://images.unsplash.com/photo-1587393855524-087f83d95c9f?w=600&h=600&fit=crop',
  honeydew:   'https://images.unsplash.com/photo-1773487743024-756afae04b87?w=600&h=600&fit=crop',
  avocado:    'https://images.unsplash.com/photo-1523049673857-eb18f1d7b578?w=600&h=600&fit=crop',
  wagyu:      'https://images.unsplash.com/photo-1625604086988-6e41981275fa?w=600&h=600&fit=crop',
  steak:      'https://images.unsplash.com/photo-1546964124-0cce460f38ef?w=600&h=600&fit=crop',
  lamb:       'https://images.unsplash.com/photo-1602470520998-f4a52199a3d6?w=600&h=600&fit=crop',
  lambroll:   'https://images.unsplash.com/photo-1603048297172-c92544798d5a?w=600&h=600&fit=crop',
  chicken:    'https://images.unsplash.com/photo-1527477396000-e27163b481c2?w=600&h=600&fit=crop',
  milk:       'https://images.unsplash.com/photo-1557759171-258278b1578b?w=600&h=600&fit=crop',
  skim:       'https://images.unsplash.com/photo-1563636619-e9143da7973b?w=600&h=600&fit=crop',
  oatmilk:    'https://images.unsplash.com/photo-1617622141533-c2f51a3b9cc7?w=600&h=600&fit=crop',
  yogurt:     'https://images.unsplash.com/photo-1571212515416-fef01fc43637?w=600&h=600&fit=crop',
  greekyogurt:'https://images.unsplash.com/photo-1488477181946-6428a0291777?w=600&h=600&fit=crop',
  shipping:   'https://images.unsplash.com/photo-1566576912321-d58ddd7a6088?w=600&h=600&fit=crop',
  gift:       'https://images.unsplash.com/photo-1549465220-1a8b9238cd48?w=600&h=600&fit=crop',
  fresh:      'https://images.unsplash.com/photo-1757627550652-30788bfce978?w=800&h=450&fit=crop',
  bbq:        'https://images.unsplash.com/photo-1558030137-d464dd688b00?w=800&h=450&fit=crop',
  dairy:      'https://images.unsplash.com/photo-1552767059-ce182ead6c1b?w=800&h=450&fit=crop',
  cny:        'https://images.unsplash.com/photo-1549465220-1a8b9238cd48?w=800&h=450&fit=crop',
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
  { _id: 'tuan_001', title: '本周生鲜团 · 墨尔本周三截团',
    description: '澳洲本地产地直供,当周采摘。周三 18:00 截团,周五起自送上门。',
    coverFileId: IMG.fresh,
    startAt: isoOffset(-2 * DAY), endAt: isoOffset(2 * DAY),
    status: 'on_sale', productCount: 8,
    createdAt: isoOffset(-3 * DAY), updatedAt: isoOffset(-1 * HOUR) },
  { _id: 'tuan_002', title: '周末烧烤肉类团',
    description: '澳洲和牛 / 羊排 / 鸡翅,周六前截团。',
    coverFileId: IMG.bbq,
    startAt: isoOffset(-1 * DAY), endAt: isoOffset(5 * DAY),
    status: 'on_sale', productCount: 5,
    createdAt: isoOffset(-2 * DAY), updatedAt: isoOffset(-1 * HOUR) },
  { _id: 'tuan_003', title: '下周乳制品预订团(即将开团)',
    description: 'A2 牛奶、Pauls 酸奶、手工奶酪。下周一开团。',
    coverFileId: IMG.dairy,
    startAt: isoOffset(2 * DAY), endAt: isoOffset(9 * DAY),
    status: 'scheduled', productCount: 5,
    createdAt: isoOffset(-1 * HOUR), updatedAt: isoOffset(-1 * HOUR) },
  { _id: 'tuan_004', title: '已结束 · 上周年货团',
    description: '历史归档团,不在前台展示。',
    coverFileId: IMG.cny,
    startAt: isoOffset(-10 * DAY), endAt: isoOffset(-3 * DAY),
    status: 'closed', productCount: 1,
    createdAt: isoOffset(-12 * DAY), updatedAt: isoOffset(-3 * DAY) },
];

const D  = { createdAt: isoOffset(-2 * DAY), updatedAt: isoOffset(-1 * HOUR) };
const DN = { createdAt: isoOffset(-1 * HOUR), updatedAt: isoOffset(-1 * HOUR) };

// ────── 商品库 ──────
export const seedCatalog: CatalogProduct[] = [
  { _id: 'prod_100', title: '冷链运费(必拍)',
    description: '墨尔本市区冷链配送,每单 1 份。非配送区域请勿下单。',
    coverFileId: IMG.shipping, imageFileIds: [], categoryIds: [], ...D },
  { _id: 'prod_101', title: '澳洲本地有机西兰花',
    description: '昆士兰产地直送,每袋约 500g。',
    coverFileId: IMG.broccoli, imageFileIds: [IMG.broccoli, IMG.fresh],
    categoryIds: ['cat_fresh'], ...D },
  { _id: 'prod_104', title: '有机菠菜',
    description: '本地农场有机种植,200g 袋装,嫩叶。',
    coverFileId: IMG.spinach, imageFileIds: [], categoryIds: ['cat_fresh'], ...D },
  { _id: 'prod_105', title: '樱桃番茄',
    description: '500g,皮薄汁多,孩子爱吃。',
    coverFileId: IMG.tomato, imageFileIds: [], categoryIds: ['cat_fresh'], ...D },
  { _id: 'prod_102', title: '塔斯马尼亚蓝莓',
    description: '125g 一盒,果大味甜,空运直达。',
    coverFileId: IMG.blueberry, imageFileIds: [IMG.blueberry],
    categoryIds: ['cat_fresh'], ...D },
  { _id: 'prod_106', title: '本地有机草莓',
    description: '250g 盒装,维州当季新摘。',
    coverFileId: IMG.strawberry, imageFileIds: [], categoryIds: ['cat_fresh'], ...D },
  { _id: 'prod_103', title: '新西兰蜜瓜',
    description: '一整颗,约 2kg。',
    coverFileId: IMG.honeydew, imageFileIds: [], categoryIds: ['cat_fresh'], ...D },
  { _id: 'prod_107', title: 'Hass 牛油果 4 个',
    description: '即食熟度,软硬适中。',
    coverFileId: IMG.avocado, imageFileIds: [], categoryIds: ['cat_fresh'], ...D },

  { _id: 'prod_201', title: '澳洲 M5 和牛肩肉 500g',
    description: '冷冻真空包装,BBQ 佳选。',
    coverFileId: IMG.wagyu, imageFileIds: [], categoryIds: ['cat_meat'], ...D },
  { _id: 'prod_203', title: 'M5 和牛西冷 300g',
    description: '雪花分布均匀,适合煎牛排。',
    coverFileId: IMG.steak, imageFileIds: [], categoryIds: ['cat_meat'], ...D },
  { _id: 'prod_202', title: '腌制羊排 6 根',
    description: '预腌制好,开袋即烤。',
    coverFileId: IMG.lamb, imageFileIds: [], categoryIds: ['cat_meat'], ...D },
  { _id: 'prod_204', title: '新西兰羊肉卷 500g',
    description: '火锅涮煮首选,切片厚度适中。',
    coverFileId: IMG.lambroll, imageFileIds: [], categoryIds: ['cat_meat'], ...D },
  { _id: 'prod_205', title: 'BBQ 烤翅 1kg',
    description: '秘制腌料,开袋即烤。',
    coverFileId: IMG.chicken, imageFileIds: [], categoryIds: ['cat_meat'], ...D },

  { _id: 'prod_301', title: 'A2 全脂牛奶 2L',
    description: '', coverFileId: IMG.milk, imageFileIds: [],
    categoryIds: ['cat_dairy'], ...DN },
  { _id: 'prod_303', title: '脱脂牛奶 2L',
    description: '低脂健康,早餐搭配首选。',
    coverFileId: IMG.skim, imageFileIds: [], categoryIds: ['cat_dairy'], ...DN },
  { _id: 'prod_304', title: '燕麦奶 1L',
    description: '植物基,无乳糖。',
    coverFileId: IMG.oatmilk, imageFileIds: [], categoryIds: ['cat_dairy'], ...DN },
  { _id: 'prod_302', title: 'Pauls 希腊酸奶 1kg',
    description: '', coverFileId: IMG.yogurt, imageFileIds: [],
    categoryIds: ['cat_dairy'], ...DN },
  { _id: 'prod_305', title: 'Chobani 酸奶 6 连杯',
    description: '低脂草莓/蓝莓混合。',
    coverFileId: IMG.greekyogurt, imageFileIds: [], categoryIds: ['cat_dairy'], ...DN },

  { _id: 'prod_401', title: '(已结束)年货礼盒',
    description: '', coverFileId: IMG.gift, imageFileIds: [], categoryIds: ['cat_snack'],
    createdAt: isoOffset(-12 * DAY), updatedAt: isoOffset(-3 * DAY) },
];

// ────── 团内实例 ──────
const TI = (productId: string, tuanId: string, price: number, stock: number, sold: number, sort: number, section: string | null, participantCount = 0): TuanItem => ({
  _id: `ti_${productId}_${tuanId}`,
  tuanId, productId,
  price, stock, sold, sort, section,
  participantCount,
  ...D,
});

export const seedTuanItems: TuanItem[] = [
  // tuan_001 生鲜
  TI('prod_100', 'tuan_001', 1500, 999, 42,  0, '运费必拍项', 42),
  TI('prod_101', 'tuan_001',  599,  50, 12, 10, '蔬菜',         8),
  TI('prod_104', 'tuan_001',  450,  40,  8, 11, '蔬菜',         6),
  TI('prod_105', 'tuan_001',  520,  60, 20, 12, '蔬菜',        15),
  TI('prod_102', 'tuan_001',  899,  30, 18, 20, '浆果',        14),
  TI('prod_106', 'tuan_001',  680,  40, 22, 21, '浆果',        18),
  TI('prod_103', 'tuan_001', 1280,  20,  5, 30, '水果',         5),
  TI('prod_107', 'tuan_001',  980,  35, 11, 31, '水果',         9),

  // tuan_002 肉类
  TI('prod_201', 'tuan_002', 3880, 15,  6, 10, '牛肉',  4),
  TI('prod_203', 'tuan_002', 4880, 12,  3, 11, '牛肉',  3),
  TI('prod_202', 'tuan_002', 2580, 25,  9, 20, '羊肉',  7),
  TI('prod_204', 'tuan_002', 1880, 30, 14, 21, '羊肉', 11),
  TI('prod_205', 'tuan_002', 1680, 40, 17, 30, '禽类', 13),

  // tuan_003 乳制品
  TI('prod_301', 'tuan_003', 680, 100, 0, 10, '液态奶', 0),
  TI('prod_303', 'tuan_003', 580, 100, 0, 11, '液态奶', 0),
  TI('prod_304', 'tuan_003', 720,  60, 0, 12, '液态奶', 0),
  TI('prod_302', 'tuan_003', 780,  80, 0, 20, '发酵乳', 0),
  TI('prod_305', 'tuan_003', 880,  70, 0, 21, '发酵乳', 0),

  // tuan_004(archived)
  { _id: 'ti_prod_401_tuan_004', tuanId: 'tuan_004', productId: 'prod_401',
    price: 5888, stock: 40, sold: 40, sort: 1, section: null,
    participantCount: 35,
    createdAt: isoOffset(-12 * DAY), updatedAt: isoOffset(-3 * DAY) },
];

const AVATARS = [
  avatar('小明'), avatar('阿华'), avatar('周'), avatar('李'), avatar('E'), avatar('J'),
];

export const seedOrders: Order[] = [
  {
    _id: 'order_seed_1',
    orderNo: 'MG20260414143012001',
    outTradeNo: 'TRADESEED1',
    openid: 'mock_customer_a',
    userSnapshot: { name: '王小姐', phone: '0412345678' },
    items: [
      { tuanItemId: 'ti_prod_102_tuan_001', productId: 'prod_102', tuanId: 'tuan_001', title: '塔斯马尼亚蓝莓', price: 899, quantity: 2, subtotal: 1798, coverFileId: IMG.blueberry },
      { tuanItemId: 'ti_prod_101_tuan_001', productId: 'prod_101', tuanId: 'tuan_001', title: '澳洲本地有机西兰花', price: 599, quantity: 1, subtotal: 599, coverFileId: IMG.broccoli },
    ],
    amount: 2397,
    shipping: { recipient: '王小姐', phone: '0412345678', line1: '12 Bridge Rd', line2: 'Unit 3', suburb: 'Richmond', state: 'VIC', postcode: '3121' },
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
      { tuanItemId: 'ti_prod_201_tuan_002', productId: 'prod_201', tuanId: 'tuan_002', title: '澳洲 M5 和牛肩肉 500g', price: 3880, quantity: 1, subtotal: 3880, coverFileId: IMG.wagyu },
    ],
    amount: 3880,
    shipping: { recipient: 'John Smith', phone: '0478112233', line1: '55 Chapel St', suburb: 'South Yarra', state: 'VIC', postcode: '3141' },
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
      { tuanItemId: 'ti_prod_202_tuan_002', productId: 'prod_202', tuanId: 'tuan_002', title: '腌制羊排 6 根', price: 2580, quantity: 2, subtotal: 5160, coverFileId: IMG.lamb },
      { tuanItemId: 'ti_prod_103_tuan_001', productId: 'prod_103', tuanId: 'tuan_001', title: '新西兰蜜瓜', price: 1280, quantity: 1, subtotal: 1280, coverFileId: IMG.honeydew },
    ],
    amount: 6440,
    shipping: { recipient: '阿华', phone: '0400888999', line1: '8 Springvale Rd', suburb: 'Glen Waverley', state: 'VIC', postcode: '3150' },
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
      { tuanItemId: 'ti_prod_102_tuan_001', productId: 'prod_102', tuanId: 'tuan_001', title: '塔斯马尼亚蓝莓', price: 899, quantity: 3, subtotal: 2697, coverFileId: IMG.blueberry },
    ],
    amount: 2697,
    shipping: { recipient: 'Emma Zhang', phone: '0455999000', line1: '21 Queens Rd', suburb: 'Melbourne', state: 'VIC', postcode: '3004' },
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
      { tuanItemId: 'ti_prod_101_tuan_001', productId: 'prod_101', tuanId: 'tuan_001', title: '澳洲本地有机西兰花', price: 599, quantity: 5, subtotal: 2995, coverFileId: IMG.broccoli },
    ],
    amount: 2995,
    shipping: { recipient: '李太', phone: '0433111222', line1: '9 Toorak Rd', suburb: 'Toorak', state: 'VIC', postcode: '3142' },
    remark: '',
    status: 'pending_pay', payStatus: 'pending',
    createdAt: isoOffset(-15 * 60 * 1000), updatedAt: isoOffset(-15 * 60 * 1000),
  },
];

// 保留旧导出名以兼容老 import
export const seedProducts = seedCatalog;

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
