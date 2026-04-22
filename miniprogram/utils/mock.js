// utils/mock.js - 小程序 M1 阶段的本地假数据
// 与 web-admin/src/mock/seed.ts 数据形态保持一致
// 拿到云环境 ID 并部署云函数后,本文件不再被引用

const now = Date.now();
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const iso = (offset) => new Date(now + offset).toISOString();

const CATEGORIES = [
  { _id: 'cat_fresh',  name: '生鲜蔬果', sort: 1, isActive: true },
  { _id: 'cat_meat',   name: '肉类海鲜', sort: 2, isActive: true },
  { _id: 'cat_dairy',  name: '乳制品',   sort: 3, isActive: true },
  { _id: 'cat_snack',  name: '零食点心', sort: 4, isActive: true },
  { _id: 'cat_daily',  name: '日用百货', sort: 5, isActive: true },
];

// Mock 封面图:真实 Unsplash 免费商用图片(CDN 加 w/h/fit 参数裁剪)
// 上线前换成商家上传的真实产品图
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
  // 团封面用 16:9
  fresh:      'https://images.unsplash.com/photo-1757627550652-30788bfce978?w=800&h=450&fit=crop',
  bbq:        'https://images.unsplash.com/photo-1558030137-d464dd688b00?w=800&h=450&fit=crop',
  dairy:      'https://images.unsplash.com/photo-1552767059-ce182ead6c1b?w=800&h=450&fit=crop',
};

function avatar(seed) {
  // 头像仍用彩色文字占位,便于区分姓名
  const colors = ['F59E0B', '10B981', '3B82F6', '8B5CF6', 'EC4899', 'F97316'];
  let h = 0;
  const s = String(seed);
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const c = colors[h % colors.length];
  return `https://placehold.co/80x80/${c}/ffffff?text=${encodeURIComponent(s)}`;
}

const TUANS = [
  { _id: 'tuan_001', title: '本周生鲜团 · 墨尔本周三截团',
    description: '澳洲本地产地直供,当周采摘。周三 18:00 截团,周五起自送上门。',
    coverFileId: IMG.fresh,
    startAt: iso(-2 * DAY), endAt: iso(2 * DAY), status: 'on_sale', productCount: 8 },
  { _id: 'tuan_002', title: '周末烧烤肉类团',
    description: '澳洲和牛 / 羊排 / 鸡翅,周六前截团。',
    coverFileId: IMG.bbq,
    startAt: iso(-1 * DAY), endAt: iso(5 * DAY), status: 'on_sale', productCount: 5 },
  { _id: 'tuan_003', title: '下周乳制品预订团(即将开团)',
    description: 'A2 牛奶、Pauls 酸奶、手工奶酪。下周一开团。',
    coverFileId: IMG.dairy,
    startAt: iso(2 * DAY), endAt: iso(9 * DAY), status: 'scheduled', productCount: 5 },
];

const PRODUCTS = [
  // ═══════════ tuan_001 · 本周生鲜团 ═══════════

  // 运费必拍项(放最前面,参考快团团)
  { _id: 'prod_100', tuanId: 'tuan_001', title: '冷链运费(必拍)',
    description: '墨尔本市区冷链配送,每单 1 份。非配送区域请勿下单。',
    coverFileId: IMG.shipping, imageFileIds: [], categoryIds: [],
    section: '运费必拍项',
    price: 1500, stock: 999, sold: 42, sort: 0, participantCount: 42 },

  // 蔬菜
  { _id: 'prod_101', tuanId: 'tuan_001', title: '澳洲本地有机西兰花',
    description: '昆士兰产地直送,每袋约 500g。', coverFileId: IMG.broccoli,
    imageFileIds: [IMG.broccoli, IMG.fresh],
    categoryIds: ['cat_fresh'], section: '蔬菜',
    price: 599, stock: 50, sold: 12, sort: 10, participantCount: 8 },
  { _id: 'prod_104', tuanId: 'tuan_001', title: '有机菠菜',
    description: '本地农场有机种植,200g 袋装,嫩叶。',
    coverFileId: IMG.spinach, imageFileIds: [], categoryIds: ['cat_fresh'],
    section: '蔬菜',
    price: 450, stock: 40, sold: 8, sort: 11, participantCount: 6 },
  { _id: 'prod_105', tuanId: 'tuan_001', title: '樱桃番茄',
    description: '500g,皮薄汁多,孩子爱吃。',
    coverFileId: IMG.tomato, imageFileIds: [], categoryIds: ['cat_fresh'],
    section: '蔬菜',
    price: 520, stock: 60, sold: 20, sort: 12, participantCount: 15 },

  // 浆果
  { _id: 'prod_102', tuanId: 'tuan_001', title: '塔斯马尼亚蓝莓',
    description: '125g 一盒,果大味甜,空运直达。', coverFileId: IMG.blueberry,
    imageFileIds: [IMG.blueberry], categoryIds: ['cat_fresh'],
    section: '浆果',
    price: 899, stock: 30, sold: 18, sort: 20, participantCount: 14 },
  { _id: 'prod_106', tuanId: 'tuan_001', title: '本地有机草莓',
    description: '250g 盒装,维州当季新摘。',
    coverFileId: IMG.strawberry, imageFileIds: [], categoryIds: ['cat_fresh'],
    section: '浆果',
    price: 680, stock: 40, sold: 22, sort: 21, participantCount: 18 },

  // 水果
  { _id: 'prod_103', tuanId: 'tuan_001', title: '新西兰蜜瓜',
    description: '一整颗,约 2kg。', coverFileId: IMG.honeydew,
    imageFileIds: [], categoryIds: ['cat_fresh'], section: '水果',
    price: 1280, stock: 20, sold: 5, sort: 30, participantCount: 5 },
  { _id: 'prod_107', tuanId: 'tuan_001', title: 'Hass 牛油果 4 个',
    description: '即食熟度,软硬适中。',
    coverFileId: IMG.avocado, imageFileIds: [], categoryIds: ['cat_fresh'],
    section: '水果',
    price: 980, stock: 35, sold: 11, sort: 31, participantCount: 9 },

  // ═══════════ tuan_002 · 周末烧烤肉类团 ═══════════

  // 牛肉
  { _id: 'prod_201', tuanId: 'tuan_002', title: '澳洲 M5 和牛肩肉 500g',
    description: '冷冻真空包装,BBQ 佳选。', coverFileId: IMG.wagyu,
    imageFileIds: [], categoryIds: ['cat_meat'], section: '牛肉',
    price: 3880, stock: 15, sold: 6, sort: 10, participantCount: 4 },
  { _id: 'prod_203', tuanId: 'tuan_002', title: 'M5 和牛西冷 300g',
    description: '雪花分布均匀,适合煎牛排。',
    coverFileId: IMG.steak, imageFileIds: [], categoryIds: ['cat_meat'],
    section: '牛肉',
    price: 4880, stock: 12, sold: 3, sort: 11, participantCount: 3 },

  // 羊肉
  { _id: 'prod_202', tuanId: 'tuan_002', title: '腌制羊排 6 根',
    description: '预腌制好,开袋即烤。', coverFileId: IMG.lamb,
    imageFileIds: [], categoryIds: ['cat_meat'], section: '羊肉',
    price: 2580, stock: 25, sold: 9, sort: 20, participantCount: 7 },
  { _id: 'prod_204', tuanId: 'tuan_002', title: '新西兰羊肉卷 500g',
    description: '火锅涮煮首选,切片厚度适中。',
    coverFileId: IMG.lambroll, imageFileIds: [], categoryIds: ['cat_meat'],
    section: '羊肉',
    price: 1880, stock: 30, sold: 14, sort: 21, participantCount: 11 },

  // 禽类
  { _id: 'prod_205', tuanId: 'tuan_002', title: 'BBQ 烤翅 1kg',
    description: '秘制腌料,开袋即烤。',
    coverFileId: IMG.chicken, imageFileIds: [], categoryIds: ['cat_meat'],
    section: '禽类',
    price: 1680, stock: 40, sold: 17, sort: 30, participantCount: 13 },

  // ═══════════ tuan_003 · 下周乳制品预订团 ═══════════

  // 液态奶
  { _id: 'prod_301', tuanId: 'tuan_003', title: 'A2 全脂牛奶 2L',
    description: '', coverFileId: IMG.milk,
    imageFileIds: [], categoryIds: ['cat_dairy'], section: '液态奶',
    price: 680, stock: 100, sold: 0, sort: 10, participantCount: 0 },
  { _id: 'prod_303', tuanId: 'tuan_003', title: '脱脂牛奶 2L',
    description: '低脂健康,早餐搭配首选。',
    coverFileId: IMG.skim, imageFileIds: [], categoryIds: ['cat_dairy'],
    section: '液态奶',
    price: 580, stock: 100, sold: 0, sort: 11, participantCount: 0 },
  { _id: 'prod_304', tuanId: 'tuan_003', title: '燕麦奶 1L',
    description: '植物基,无乳糖。',
    coverFileId: IMG.oatmilk, imageFileIds: [], categoryIds: ['cat_dairy'],
    section: '液态奶',
    price: 720, stock: 60, sold: 0, sort: 12, participantCount: 0 },

  // 发酵乳
  { _id: 'prod_302', tuanId: 'tuan_003', title: 'Pauls 希腊酸奶 1kg',
    description: '', coverFileId: IMG.yogurt,
    imageFileIds: [], categoryIds: ['cat_dairy'], section: '发酵乳',
    price: 780, stock: 80, sold: 0, sort: 20, participantCount: 0 },
  { _id: 'prod_305', tuanId: 'tuan_003', title: 'Chobani 酸奶 6 连杯',
    description: '低脂草莓/蓝莓混合。',
    coverFileId: IMG.greekyogurt, imageFileIds: [], categoryIds: ['cat_dairy'],
    section: '发酵乳',
    price: 880, stock: 70, sold: 0, sort: 21, participantCount: 0 },
];

const AVATARS = [avatar('A'), avatar('B'), avatar('C'), avatar('D'), avatar('E'), avatar('F')];
const NAMES = ['小明', '阿华', '周先生', '李太', 'Emma', 'Jason', '王师傅', 'Lucy', 'Kiki', '阿龙', 'Grace', '张姐'];

function genParticipants(productId, count) {
  const out = [];
  for (let i = 0; i < Math.min(count, 12); i++) {
    out.push({
      id: productId + '_p' + i,
      nickName: NAMES[i % NAMES.length],
      avatar: AVATARS[i % AVATARS.length],
      quantity: 1 + (i % 3),
      paidAt: new Date(Date.now() - i * HOUR).toISOString(),
    });
  }
  return out;
}

// 模拟网络延迟
const delay = (ms) => new Promise((r) => setTimeout(r, ms || 150));

// ========== 本地持久化(wx.storage)==========
const K_USER     = 'mock_user';
const K_ADDRESS  = 'mock_addresses';
const K_CART     = 'mock_cart';
const K_ORDERS   = 'mock_orders';

function storeGet(k, def) {
  try { const v = wx.getStorageSync(k); return v == null || v === '' ? def : v; }
  catch { return def; }
}
function storeSet(k, v) { try { wx.setStorageSync(k, v); } catch {} }

function generateOrderNo() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const ts = `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  return 'MG' + ts + Math.floor(Math.random() * 1000).toString().padStart(3, '0');
}

module.exports = {
  async listTuans() {
    await delay();
    return TUANS.filter((t) => t.status === 'on_sale' || t.status === 'scheduled')
      .sort((a, b) => (a.endAt < b.endAt ? -1 : 1));
  },
  async getTuanDetail(tuanId) {
    await delay();
    const tuan = TUANS.find((t) => t._id === tuanId);
    if (!tuan) throw new Error('团不存在');
    const products = PRODUCTS
      .filter((p) => p.tuanId === tuanId)
      .sort((a, b) => a.sort - b.sort);
    return { tuan, products };
  },
  async getProductDetail(productId) {
    await delay();
    const product = PRODUCTS.find((p) => p._id === productId);
    if (!product) throw new Error('商品不存在');
    const tuan = TUANS.find((t) => t._id === product.tuanId);
    const participants = genParticipants(productId, product.participantCount);
    return { product, tuan, participants };
  },
  async listCategories() {
    await delay(80);
    return CATEGORIES.filter((c) => c.isActive).sort((a, b) => a.sort - b.sort);
  },

  // ========== 用户资料 ==========
  async getProfile() {
    await delay(80);
    return storeGet(K_USER, { name: '', phone: '', registeredAt: null });
  },
  async saveProfile({ name, phone }) {
    await delay();
    const cur = storeGet(K_USER, {});
    const next = { ...cur, name, phone, registeredAt: cur.registeredAt || new Date().toISOString() };
    storeSet(K_USER, next);
    return next;
  },

  // ========== 地址簿 ==========
  async listAddresses() {
    await delay(80);
    return storeGet(K_ADDRESS, []);
  },
  async upsertAddress(address) {
    await delay();
    const list = storeGet(K_ADDRESS, []);
    if (address._id) {
      const i = list.findIndex((a) => a._id === address._id);
      if (i >= 0) list[i] = { ...list[i], ...address };
    } else {
      address._id = 'addr_' + Date.now();
      if (list.length === 0) address.isDefault = true;
      list.push(address);
    }
    if (address.isDefault) {
      list.forEach((a) => { if (a._id !== address._id) a.isDefault = false; });
    }
    storeSet(K_ADDRESS, list);
    return address;
  },
  async deleteAddress(id) {
    await delay();
    const list = storeGet(K_ADDRESS, []).filter((a) => a._id !== id);
    if (list.length > 0 && !list.some((a) => a.isDefault)) list[0].isDefault = true;
    storeSet(K_ADDRESS, list);
  },

  // ========== 购物车 ==========
  async getCart() {
    await delay(80);
    const cart = storeGet(K_CART, { items: [] });
    // 连接商品详情
    const items = [];
    for (const it of cart.items) {
      const p = PRODUCTS.find((x) => x._id === it.productId);
      if (!p) continue;
      const t = TUANS.find((x) => x._id === p.tuanId);
      items.push({
        productId: p._id,
        quantity: it.quantity,
        addedAt: it.addedAt,
        product: p,
        tuan: t || null,
        available: t && t.status === 'on_sale' && (p.stock - p.sold) >= it.quantity,
        subtotal: p.price * it.quantity,
      });
    }
    return { items };
  },
  async upsertCart({ tuanItemId, productId, quantity }) {
    // 向后兼容:老调用只传 productId(历史上 _id == productId == tuanItemId)
    const id = tuanItemId || productId;
    await delay(80);
    const cart = storeGet(K_CART, { items: [] });
    const i = cart.items.findIndex((x) => (x.tuanItemId || x.productId) === id);
    if (quantity <= 0) {
      if (i >= 0) cart.items.splice(i, 1);
    } else if (i >= 0) {
      cart.items[i].quantity = quantity;
      cart.items[i].tuanItemId = id;
    } else {
      cart.items.push({ tuanItemId: id, productId: id, quantity, addedAt: new Date().toISOString() });
    }
    storeSet(K_CART, cart);
    return cart;
  },
  async clearCart() {
    storeSet(K_CART, { items: [] });
  },

  // ========== 订单 ==========
  async createOrder({ items, addressId, remark, requirePay = false }) {
    await delay(300);
    // items = [{ productId, quantity }]
    const addrs = storeGet(K_ADDRESS, []);
    const address = addrs.find((a) => a._id === addressId);
    if (!address) throw new Error('请先选择收货地址');

    const user = storeGet(K_USER, {});
    if (!user.name || !user.phone) throw new Error('请先完善姓名和电话');

    const orderItems = [];
    let amount = 0;
    for (const it of items) {
      const p = PRODUCTS.find((x) => x._id === it.productId);
      if (!p) throw new Error(`商品 ${it.productId} 不存在`);
      const t = TUANS.find((x) => x._id === p.tuanId);
      if (!t || t.status !== 'on_sale') throw new Error(`${p.title} 所属团未在售`);
      if ((p.stock - p.sold) < it.quantity) throw new Error(`${p.title} 库存不足(剩 ${p.stock - p.sold})`);
      const subtotal = p.price * it.quantity;
      orderItems.push({
        tuanItemId: p._id,      // mock 下 _id 就是 tuanItemId
        productId: p._id,
        tuanId: p.tuanId,
        title: p.title,
        price: p.price,
        quantity: it.quantity,
        subtotal,
        coverFileId: p.coverFileId,
        section: p.section || null,
      });
      amount += subtotal;
      // 扣库存(mock 内存改动)
      p.sold += it.quantity;
      // 非支付版直接累加 participantCount;支付版等"支付成功"时累加
      if (!requirePay) p.participantCount = (p.participantCount || 0) + 1;
    }

    const now = new Date().toISOString();
    const order = {
      _id: 'order_' + Date.now(),
      orderNo: generateOrderNo(),
      outTradeNo: 'TRADE' + Date.now() + Math.floor(Math.random() * 1000),
      userSnapshot: { name: user.name, phone: user.phone },
      items: orderItems,
      amount,
      shipping: { ...address },
      remark: remark || '',
      status: requirePay ? 'pending_pay' : 'paid',
      payStatus: requirePay ? 'pending' : 'paid',
      paidAt: requirePay ? null : now,
      createdAt: now,
      updatedAt: now,
    };

    const orders = storeGet(K_ORDERS, []);
    orders.unshift(order);
    storeSet(K_ORDERS, orders);

    // 非支付版才清购物车;支付版等"支付成功"时清(避免未付款丢购物车)
    if (!requirePay) {
      const cart = storeGet(K_CART, { items: [] });
      const purchased = new Set(items.map((i) => i.productId));
      cart.items = cart.items.filter((x) => !purchased.has(x.productId));
      storeSet(K_CART, cart);
    }

    return order;
  },

  async simulatePay(orderId) {
    await delay(200);
    const orders = storeGet(K_ORDERS, []);
    const o = orders.find((x) => x._id === orderId);
    if (!o) throw new Error('订单不存在');
    if (o.payStatus === 'paid') return { code: 0, order: o, already: true };

    const now = new Date().toISOString();
    o.status = 'paid';
    o.payStatus = 'paid';
    o.paidAt = now;
    o.updatedAt = now;
    o.transactionId = 'STUB_TX_' + o.outTradeNo;
    // 累加参与数 + 清购物车
    for (const it of o.items) {
      const p = PRODUCTS.find((x) => x._id === it.productId);
      if (p) p.participantCount = (p.participantCount || 0) + 1;
    }
    const cart = storeGet(K_CART, { items: [] });
    const purchased = new Set(o.items.map((i) => i.productId));
    cart.items = cart.items.filter((x) => !purchased.has(x.productId));
    storeSet(K_CART, cart);
    storeSet(K_ORDERS, orders);
    return { code: 0, order: o, simulated: true };
  },

  async queryOrderPaid(orderId) {
    await delay(150);
    const orders = storeGet(K_ORDERS, []);
    const o = orders.find((x) => x._id === orderId);
    if (!o) throw new Error('订单不存在');
    return { code: 0, order: o, paid: o.payStatus === 'paid', source: 'mock' };
  },
  async listMyOrders() {
    await delay(120);
    return storeGet(K_ORDERS, []);
  },
  async getOrderDetail(orderId) {
    await delay(80);
    const list = storeGet(K_ORDERS, []);
    const o = list.find((x) => x._id === orderId);
    if (!o) throw new Error('订单不存在');
    return o;
  },
  async cancelOrder(orderId) {
    await delay();
    const list = storeGet(K_ORDERS, []);
    const o = list.find((x) => x._id === orderId);
    if (!o) throw new Error('订单不存在');
    if (o.status !== 'pending_pay') throw new Error('仅未支付订单可取消');
    o.status = 'cancelled';
    o.updatedAt = new Date().toISOString();
    storeSet(K_ORDERS, list);
    // 回滚 sold(仅内存)
    for (const it of o.items) {
      const p = PRODUCTS.find((x) => x._id === it.productId);
      if (p) p.sold = Math.max(0, p.sold - it.quantity);
    }
    return o;
  },
};
