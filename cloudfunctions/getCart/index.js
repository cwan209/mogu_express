// getCart - 读取购物车并 join 商品详情
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async () => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { code: 401, message: 'not logged in' };

  const cartRes = await db.collection('carts').where({ _openid: OPENID }).limit(1).get();
  const cart = (cartRes.data && cartRes.data[0]) || { items: [] };

  if (!cart.items || !cart.items.length) return { code: 0, items: [] };

  const productIds = cart.items.map((x) => x.productId);
  const prodRes = await db.collection('products').where({ _id: _.in(productIds) }).get();
  const prodMap = new Map(prodRes.data.map((p) => [p._id, p]));

  const tuanIds = [...new Set(prodRes.data.map((p) => p.tuanId).filter(Boolean))];
  const tuanMap = new Map();
  if (tuanIds.length) {
    const tRes = await db.collection('tuans').where({ _id: _.in(tuanIds) }).get();
    for (const t of tRes.data) tuanMap.set(t._id, t);
  }

  const items = [];
  for (const it of cart.items) {
    const p = prodMap.get(it.productId);
    if (!p) continue;
    const t = tuanMap.get(p.tuanId);
    const now = new Date();
    const available = t && t.status === 'on_sale' && new Date(t.endAt) > now && (p.stock - p.sold) >= it.quantity;
    items.push({
      productId: p._id,
      quantity: it.quantity,
      addedAt: it.addedAt,
      product: p,
      tuan: t || null,
      available,
      subtotal: p.price * it.quantity,
    });
  }

  return { code: 0, items };
};
