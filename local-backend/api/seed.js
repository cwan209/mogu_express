// seed.js - 把 web-admin/src/mock/seed.ts 里的数据灌入 MongoDB
// 由于是 TS,我们在这里复制一份 JS 版(避免引 tsc)
// 保持与 web-admin 的 mock 数据一致即可;不一致不影响功能

const { MongoClient } = require('mongodb');
const crypto = require('crypto');

const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017/mogu_express?replicaSet=rs0';
const DB_NAME   = new URL(MONGO_URL).pathname.slice(1) || 'mogu_express';

const reset = process.argv.includes('--reset');

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const now = Date.now();
const iso = (off) => new Date(now + off);

// 真实 Unsplash 图(与 miniprogram/utils/mock.js 同步)
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
    coverFileId: IMG.fresh,
    startAt: iso(-2 * DAY), endAt: iso(2 * DAY), status: 'on_sale',
    productCount: 8, createdAt: iso(-3 * DAY), updatedAt: iso(-1 * HOUR) },
  { _id: 'tuan_002', title: '周末烧烤肉类团',
    description: '澳洲和牛 / 羊排 / 鸡翅,周六前截团。',
    coverFileId: IMG.bbq,
    startAt: iso(-1 * DAY), endAt: iso(5 * DAY), status: 'on_sale',
    productCount: 5, createdAt: iso(-2 * DAY), updatedAt: iso(-1 * HOUR) },
  { _id: 'tuan_003', title: '下周乳制品预订团(即将开团)',
    description: 'A2 牛奶、Pauls 酸奶、手工奶酪。下周一开团。',
    coverFileId: IMG.dairy,
    startAt: iso(2 * DAY), endAt: iso(9 * DAY), status: 'scheduled',
    productCount: 5, createdAt: iso(-1 * HOUR), updatedAt: iso(-1 * HOUR) },
];

const DEFAULTS = { createdAt: iso(-2 * DAY), updatedAt: iso(-1 * HOUR) };
const products = [
  // ═══ tuan_001 · 本周生鲜团 ═══
  { _id: 'prod_100', tuanId: 'tuan_001', title: '冷链运费(必拍)',
    description: '墨尔本市区冷链配送,每单 1 份。非配送区域请勿下单。',
    coverFileId: IMG.shipping, imageFileIds: [], categoryIds: [],
    section: '运费必拍项',
    price: 1500, stock: 999, sold: 42, sort: 0, participantCount: 42, ...DEFAULTS },
  { _id: 'prod_101', tuanId: 'tuan_001', title: '澳洲本地有机西兰花',
    description: '昆士兰产地直送,每袋约 500g。',
    coverFileId: IMG.broccoli, imageFileIds: [IMG.broccoli, IMG.fresh],
    categoryIds: ['cat_fresh'], section: '蔬菜',
    price: 599, stock: 50, sold: 12, sort: 10, participantCount: 8, ...DEFAULTS },
  { _id: 'prod_104', tuanId: 'tuan_001', title: '有机菠菜',
    description: '本地农场有机种植,200g 袋装,嫩叶。',
    coverFileId: IMG.spinach, imageFileIds: [], categoryIds: ['cat_fresh'],
    section: '蔬菜',
    price: 450, stock: 40, sold: 8, sort: 11, participantCount: 6, ...DEFAULTS },
  { _id: 'prod_105', tuanId: 'tuan_001', title: '樱桃番茄',
    description: '500g,皮薄汁多,孩子爱吃。',
    coverFileId: IMG.tomato, imageFileIds: [], categoryIds: ['cat_fresh'],
    section: '蔬菜',
    price: 520, stock: 60, sold: 20, sort: 12, participantCount: 15, ...DEFAULTS },
  { _id: 'prod_102', tuanId: 'tuan_001', title: '塔斯马尼亚蓝莓',
    description: '125g 一盒,果大味甜,空运直达。',
    coverFileId: IMG.blueberry, imageFileIds: [IMG.blueberry],
    categoryIds: ['cat_fresh'], section: '浆果',
    price: 899, stock: 30, sold: 18, sort: 20, participantCount: 14, ...DEFAULTS },
  { _id: 'prod_106', tuanId: 'tuan_001', title: '本地有机草莓',
    description: '250g 盒装,维州当季新摘。',
    coverFileId: IMG.strawberry, imageFileIds: [], categoryIds: ['cat_fresh'],
    section: '浆果',
    price: 680, stock: 40, sold: 22, sort: 21, participantCount: 18, ...DEFAULTS },
  { _id: 'prod_103', tuanId: 'tuan_001', title: '新西兰蜜瓜',
    description: '一整颗,约 2kg。',
    coverFileId: IMG.honeydew, imageFileIds: [],
    categoryIds: ['cat_fresh'], section: '水果',
    price: 1280, stock: 20, sold: 5, sort: 30, participantCount: 5, ...DEFAULTS },
  { _id: 'prod_107', tuanId: 'tuan_001', title: 'Hass 牛油果 4 个',
    description: '即食熟度,软硬适中。',
    coverFileId: IMG.avocado, imageFileIds: [], categoryIds: ['cat_fresh'],
    section: '水果',
    price: 980, stock: 35, sold: 11, sort: 31, participantCount: 9, ...DEFAULTS },

  // ═══ tuan_002 · 周末烧烤肉类团 ═══
  { _id: 'prod_201', tuanId: 'tuan_002', title: '澳洲 M5 和牛肩肉 500g',
    description: '冷冻真空包装,BBQ 佳选。',
    coverFileId: IMG.wagyu, imageFileIds: [], categoryIds: ['cat_meat'],
    section: '牛肉',
    price: 3880, stock: 15, sold: 6, sort: 10, participantCount: 4, ...DEFAULTS },
  { _id: 'prod_203', tuanId: 'tuan_002', title: 'M5 和牛西冷 300g',
    description: '雪花分布均匀,适合煎牛排。',
    coverFileId: IMG.steak, imageFileIds: [], categoryIds: ['cat_meat'],
    section: '牛肉',
    price: 4880, stock: 12, sold: 3, sort: 11, participantCount: 3, ...DEFAULTS },
  { _id: 'prod_202', tuanId: 'tuan_002', title: '腌制羊排 6 根',
    description: '预腌制好,开袋即烤。',
    coverFileId: IMG.lamb, imageFileIds: [], categoryIds: ['cat_meat'],
    section: '羊肉',
    price: 2580, stock: 25, sold: 9, sort: 20, participantCount: 7, ...DEFAULTS },
  { _id: 'prod_204', tuanId: 'tuan_002', title: '新西兰羊肉卷 500g',
    description: '火锅涮煮首选,切片厚度适中。',
    coverFileId: IMG.lambroll, imageFileIds: [], categoryIds: ['cat_meat'],
    section: '羊肉',
    price: 1880, stock: 30, sold: 14, sort: 21, participantCount: 11, ...DEFAULTS },
  { _id: 'prod_205', tuanId: 'tuan_002', title: 'BBQ 烤翅 1kg',
    description: '秘制腌料,开袋即烤。',
    coverFileId: IMG.chicken, imageFileIds: [], categoryIds: ['cat_meat'],
    section: '禽类',
    price: 1680, stock: 40, sold: 17, sort: 30, participantCount: 13, ...DEFAULTS },

  // ═══ tuan_003 · 下周乳制品预订团 ═══
  { _id: 'prod_301', tuanId: 'tuan_003', title: 'A2 全脂牛奶 2L',
    description: '', coverFileId: IMG.milk, imageFileIds: [],
    categoryIds: ['cat_dairy'], section: '液态奶',
    price: 680, stock: 100, sold: 0, sort: 10, participantCount: 0,
    createdAt: iso(-1 * HOUR), updatedAt: iso(-1 * HOUR) },
  { _id: 'prod_303', tuanId: 'tuan_003', title: '脱脂牛奶 2L',
    description: '低脂健康,早餐搭配首选。',
    coverFileId: IMG.skim, imageFileIds: [], categoryIds: ['cat_dairy'],
    section: '液态奶',
    price: 580, stock: 100, sold: 0, sort: 11, participantCount: 0,
    createdAt: iso(-1 * HOUR), updatedAt: iso(-1 * HOUR) },
  { _id: 'prod_304', tuanId: 'tuan_003', title: '燕麦奶 1L',
    description: '植物基,无乳糖。',
    coverFileId: IMG.oatmilk, imageFileIds: [], categoryIds: ['cat_dairy'],
    section: '液态奶',
    price: 720, stock: 60, sold: 0, sort: 12, participantCount: 0,
    createdAt: iso(-1 * HOUR), updatedAt: iso(-1 * HOUR) },
  { _id: 'prod_302', tuanId: 'tuan_003', title: 'Pauls 希腊酸奶 1kg',
    description: '', coverFileId: IMG.yogurt, imageFileIds: [],
    categoryIds: ['cat_dairy'], section: '发酵乳',
    price: 780, stock: 80, sold: 0, sort: 20, participantCount: 0,
    createdAt: iso(-1 * HOUR), updatedAt: iso(-1 * HOUR) },
  { _id: 'prod_305', tuanId: 'tuan_003', title: 'Chobani 酸奶 6 连杯',
    description: '低脂草莓/蓝莓混合。',
    coverFileId: IMG.greekyogurt, imageFileIds: [], categoryIds: ['cat_dairy'],
    section: '发酵乳',
    price: 880, stock: 70, sold: 0, sort: 21, participantCount: 0,
    createdAt: iso(-1 * HOUR), updatedAt: iso(-1 * HOUR) },
];

// 初始管理员(PBKDF2 哈希 与 cloudfunctions/_lib/auth/jwt.js 对齐)
function hashPassword(plain, iterations = 100000) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.pbkdf2Sync(plain, salt, iterations, 32, 'sha256');
  return `pbkdf2$${iterations}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

const admins = [
  {
    _id: 'admin_owner_1',
    openid: 'local_owner_openid',
    username: 'admin',
    passwordHash: hashPassword('admin'),
    role: 'owner',
    createdAt: new Date(),
  },
  // 开发期:小程序 HTTP 后端模式下默认 openid = mp_test_user,
  // 加成 admin 让团长管理台不用额外登录就能用
  {
    _id: 'admin_dev_mp',
    openid: 'mp_test_user',
    username: 'dev',
    passwordHash: hashPassword('dev'),
    role: 'owner',
    createdAt: new Date(),
  },
];

async function main() {
  const client = new MongoClient(MONGO_URL, { directConnection: true });
  await client.connect();
  const db = client.db(DB_NAME);

  const colls = {
    categories: db.collection('categories'),
    tuans:      db.collection('tuans'),
    products:   db.collection('products'),
    admins:     db.collection('admins'),
    users:      db.collection('users'),
    addresses:  db.collection('addresses'),
    carts:      db.collection('carts'),
    orders:     db.collection('orders'),
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
  await upsertMany(colls.admins, admins);

  // 索引
  await colls.users.createIndex({ _openid: 1 }, { unique: true });
  await colls.addresses.createIndex({ _openid: 1 });
  await colls.carts.createIndex({ _openid: 1 }, { unique: true });
  await colls.tuans.createIndex({ status: 1, endAt: 1 });
  await colls.products.createIndex({ tuanId: 1, sort: 1 });
  await colls.orders.createIndex({ _openid: 1, createdAt: -1 });
  await colls.orders.createIndex({ outTradeNo: 1 }, { unique: true });
  await colls.admins.createIndex({ openid: 1 });
  await colls.admins.createIndex({ username: 1 }, { unique: true });

  console.log('[seed] done');
  console.log(`  categories: ${await colls.categories.countDocuments()}`);
  console.log(`  tuans:      ${await colls.tuans.countDocuments()}`);
  console.log(`  products:   ${await colls.products.countDocuments()}`);
  console.log(`  admins:     ${await colls.admins.countDocuments()}  (user: admin / pass: admin)`);

  await client.close();
}

main().catch((err) => {
  console.error('[seed] fatal', err);
  process.exit(1);
});
