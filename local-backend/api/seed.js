// seed.js - 把种子数据灌入 MongoDB
// 数据模型(新):
//   products      — 商品库(目录),独立于团。只含 title/desc/图/分类
//   tuan_items    — 团内商品实例。承载 price/stock/sold/sort/section/participantCount
//   tuans         — 团本身
//
// 每个原始"商品"拆成 (product + tuan_item) 两条记录,product _id 保留;
// tuan_item _id 取 `ti_{productId}_{tuanId}`,稳定可预测便于 seed 回放。

const { MongoClient } = require('mongodb');
const crypto = require('crypto');

const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017/mogu_express?replicaSet=rs0';
const DB_NAME   = new URL(MONGO_URL).pathname.slice(1) || 'mogu_express';

const reset = process.argv.includes('--reset');

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const now = Date.now();
const iso = (off) => new Date(now + off);

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
  fresh:      'https://images.unsplash.com/photo-1757627550652-30788bfce978?w=800&h=450&fit=crop',
  bbq:        'https://images.unsplash.com/photo-1558030137-d464dd688b00?w=800&h=450&fit=crop',
  dairy:      'https://images.unsplash.com/photo-1552767059-ce182ead6c1b?w=800&h=450&fit=crop',
};

const categories = [
  { _id: 'cat_fresh',  name: '生鲜蔬果', sort: 1, isActive: true, createdAt: iso(-30 * DAY) },
  { _id: 'cat_meat',   name: '肉类海鲜', sort: 2, isActive: true, createdAt: iso(-30 * DAY) },
  { _id: 'cat_dairy',  name: '乳制品',   sort: 3, isActive: true, createdAt: iso(-30 * DAY) },
  { _id: 'cat_snack',  name: '零食点心', sort: 4, isActive: true, createdAt: iso(-30 * DAY) },
  { _id: 'cat_daily',  name: '日用百货', sort: 5, isActive: true, createdAt: iso(-30 * DAY) },
];

const tuans = [
  { _id: 'tuan_001', title: '本周生鲜团 · 墨尔本周三截团',
    description: '澳洲本地产地直供,当周采摘。周三 18:00 截团,周五起自送上门。',
    announcement: '【本周公告】\n1. 周三 18:00 准时截团,过时不候\n2. 冷链运费必拍,墨尔本市区配送\n3. 蓝莓本周限量 30 盒,先到先得\n4. 有问题加客服微信:mogu_admin',
    coverFileId: IMG.fresh,
    startAt: iso(-2 * DAY), endAt: iso(2 * DAY), status: 'on_sale',
    productCount: 8, createdAt: iso(-3 * DAY), updatedAt: iso(-1 * HOUR) },
  { _id: 'tuan_002', title: '周末烧烤肉类团',
    description: '澳洲和牛 / 羊排 / 鸡翅,周六前截团。',
    announcement: '周六 12:00 截团,周日发货。和牛冷冻保存,收货后请尽快放冰箱。',
    coverFileId: IMG.bbq,
    startAt: iso(-1 * DAY), endAt: iso(5 * DAY), status: 'on_sale',
    productCount: 5, createdAt: iso(-2 * DAY), updatedAt: iso(-1 * HOUR) },
  { _id: 'tuan_003', title: '下周乳制品预订团(即将开团)',
    description: 'A2 牛奶、Pauls 酸奶、手工奶酪。下周一开团。',
    announcement: '',
    coverFileId: IMG.dairy,
    startAt: iso(2 * DAY), endAt: iso(9 * DAY), status: 'scheduled',
    productCount: 5, createdAt: iso(-1 * HOUR), updatedAt: iso(-1 * HOUR) },
];

const DEFAULTS = { createdAt: iso(-2 * DAY), updatedAt: iso(-1 * HOUR) };

// ─────────── 商品库(catalog) ───────────
// 独立于团,只含稳定属性。price/stock 下放到 tuan_items。
const products = [
  { _id: 'prod_100', title: '冷链运费(必拍)',
    description: '墨尔本市区冷链配送,每单 1 份。非配送区域请勿下单。',
    coverFileId: IMG.shipping, imageFileIds: [], categoryIds: [], ...DEFAULTS },
  { _id: 'prod_101', title: '澳洲本地有机西兰花',
    description: '昆士兰产地直送,每袋约 500g。',
    coverFileId: IMG.broccoli, imageFileIds: [IMG.broccoli, IMG.fresh],
    categoryIds: ['cat_fresh'], ...DEFAULTS },
  { _id: 'prod_104', title: '有机菠菜',
    description: '本地农场有机种植,200g 袋装,嫩叶。',
    coverFileId: IMG.spinach, imageFileIds: [], categoryIds: ['cat_fresh'], ...DEFAULTS },
  { _id: 'prod_105', title: '樱桃番茄',
    description: '500g,皮薄汁多,孩子爱吃。',
    coverFileId: IMG.tomato, imageFileIds: [], categoryIds: ['cat_fresh'], ...DEFAULTS },
  { _id: 'prod_102', title: '塔斯马尼亚蓝莓',
    description: '125g 一盒,果大味甜,空运直达。',
    coverFileId: IMG.blueberry, imageFileIds: [IMG.blueberry],
    categoryIds: ['cat_fresh'], ...DEFAULTS },
  { _id: 'prod_106', title: '本地有机草莓',
    description: '250g 盒装,维州当季新摘。',
    coverFileId: IMG.strawberry, imageFileIds: [], categoryIds: ['cat_fresh'], ...DEFAULTS },
  { _id: 'prod_103', title: '新西兰蜜瓜',
    description: '一整颗,约 2kg。',
    coverFileId: IMG.honeydew, imageFileIds: [],
    categoryIds: ['cat_fresh'], ...DEFAULTS },
  { _id: 'prod_107', title: 'Hass 牛油果 4 个',
    description: '即食熟度,软硬适中。',
    coverFileId: IMG.avocado, imageFileIds: [], categoryIds: ['cat_fresh'], ...DEFAULTS },

  { _id: 'prod_201', title: '澳洲 M5 和牛肩肉 500g',
    description: '冷冻真空包装,BBQ 佳选。',
    coverFileId: IMG.wagyu, imageFileIds: [], categoryIds: ['cat_meat'], ...DEFAULTS },
  { _id: 'prod_203', title: 'M5 和牛西冷 300g',
    description: '雪花分布均匀,适合煎牛排。',
    coverFileId: IMG.steak, imageFileIds: [], categoryIds: ['cat_meat'], ...DEFAULTS },
  { _id: 'prod_202', title: '腌制羊排 6 根',
    description: '预腌制好,开袋即烤。',
    coverFileId: IMG.lamb, imageFileIds: [], categoryIds: ['cat_meat'], ...DEFAULTS },
  { _id: 'prod_204', title: '新西兰羊肉卷 500g',
    description: '火锅涮煮首选,切片厚度适中。',
    coverFileId: IMG.lambroll, imageFileIds: [], categoryIds: ['cat_meat'], ...DEFAULTS },
  { _id: 'prod_205', title: 'BBQ 烤翅 1kg',
    description: '秘制腌料,开袋即烤。',
    coverFileId: IMG.chicken, imageFileIds: [], categoryIds: ['cat_meat'], ...DEFAULTS },

  { _id: 'prod_301', title: 'A2 全脂牛奶 2L',
    description: '', coverFileId: IMG.milk, imageFileIds: [],
    categoryIds: ['cat_dairy'], ...DEFAULTS },
  { _id: 'prod_303', title: '脱脂牛奶 2L',
    description: '低脂健康,早餐搭配首选。',
    coverFileId: IMG.skim, imageFileIds: [], categoryIds: ['cat_dairy'], ...DEFAULTS },
  { _id: 'prod_304', title: '燕麦奶 1L',
    description: '植物基,无乳糖。',
    coverFileId: IMG.oatmilk, imageFileIds: [], categoryIds: ['cat_dairy'], ...DEFAULTS },
  { _id: 'prod_302', title: 'Pauls 希腊酸奶 1kg',
    description: '', coverFileId: IMG.yogurt, imageFileIds: [],
    categoryIds: ['cat_dairy'], ...DEFAULTS },
  { _id: 'prod_305', title: 'Chobani 酸奶 6 连杯',
    description: '低脂草莓/蓝莓混合。',
    coverFileId: IMG.greekyogurt, imageFileIds: [], categoryIds: ['cat_dairy'], ...DEFAULTS },
];

// ─────────── 团内商品实例(tuan_items) ───────────
// 每条 = 一个 product 挂到一个 tuan 下的实例。价格/库存/分组/排序都在这里。
const TI = (productId, tuanId, price, stock, sold, sort, section, participantCount = 0) => ({
  _id: `ti_${productId}_${tuanId}`,
  tuanId, productId,
  price, stock, sold, sort, section,
  participantCount,
  ...DEFAULTS,
});

const tuanItems = [
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
];

// PBKDF2 哈希(对齐 _lib/auth/jwt.js)
function hashPassword(plain, iterations = 100000) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.pbkdf2Sync(plain, salt, iterations, 32, 'sha256');
  return `pbkdf2$${iterations}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

const admins = [
  { _id: 'admin_owner_1', openid: 'local_owner_openid',
    username: 'admin', passwordHash: hashPassword('admin'), role: 'owner', createdAt: new Date() },
  { _id: 'admin_dev_mp',  openid: 'mp_test_user',
    username: 'dev',   passwordHash: hashPassword('dev'),   role: 'owner', createdAt: new Date() },
];

async function main() {
  const client = new MongoClient(MONGO_URL, { directConnection: true });
  await client.connect();
  const db = client.db(DB_NAME);

  const colls = {
    categories: db.collection('categories'),
    tuans:      db.collection('tuans'),
    products:   db.collection('products'),
    tuan_items: db.collection('tuan_items'),
    admins:     db.collection('admins'),
    users:      db.collection('users'),
    addresses:  db.collection('addresses'),
    carts:      db.collection('carts'),
    orders:     db.collection('orders'),
    settings:   db.collection('settings'),
  };

  if (reset) {
    console.log('[seed] --reset: 清空所有集合');
    await Promise.all(Object.values(colls).map((c) => c.deleteMany({})));
  }

  async function upsertMany(col, docs) {
    for (const doc of docs) {
      await col.replaceOne({ _id: doc._id }, doc, { upsert: true });
    }
  }

  await upsertMany(colls.categories, categories);
  await upsertMany(colls.tuans, tuans);
  await upsertMany(colls.products, products);
  await upsertMany(colls.tuan_items, tuanItems);
  await upsertMany(colls.admins, admins);
  await upsertMany(colls.settings, [{
    _id: 'home_banner',
    title: '接龙团购',
    subtitle: '本周进行中 · 尽快接龙抢货',
    updatedAt: new Date(),
  }]);

  // 索引
  await colls.users.createIndex({ _openid: 1 }, { unique: true });
  await colls.addresses.createIndex({ _openid: 1 });
  await colls.carts.createIndex({ _openid: 1 }, { unique: true });
  await colls.tuans.createIndex({ status: 1, endAt: 1 });
  // 新增 tuan_items 索引:团内排序、反查某个商品在哪些团、产品+团唯一
  await colls.tuan_items.createIndex({ tuanId: 1, sort: 1 });
  await colls.tuan_items.createIndex({ productId: 1 });
  await colls.tuan_items.createIndex({ tuanId: 1, productId: 1 }, { unique: true });
  // 老的 products.tuanId 索引不再需要,但如果存在也不致命(旧数据迁移兜底)
  await colls.orders.createIndex({ _openid: 1, createdAt: -1 });
  await colls.orders.createIndex({ outTradeNo: 1 }, { unique: true });
  await colls.admins.createIndex({ openid: 1 });
  await colls.admins.createIndex({ username: 1 }, { unique: true });

  console.log('[seed] done');
  console.log(`  categories: ${await colls.categories.countDocuments()}`);
  console.log(`  tuans:      ${await colls.tuans.countDocuments()}`);
  console.log(`  products:   ${await colls.products.countDocuments()}    (catalog)`);
  console.log(`  tuan_items: ${await colls.tuan_items.countDocuments()}`);
  console.log(`  admins:     ${await colls.admins.countDocuments()}  (user: admin / pass: admin)`);

  await client.close();
}

main().catch((err) => {
  console.error('[seed] fatal', err);
  process.exit(1);
});
