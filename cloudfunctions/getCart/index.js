// getCart - 读取购物车并 join tuan_item + product + tuan
//
// 返回的每个 item:
//   tuanItemId, productId, tuanId, quantity, addedAt,
//   product: { _id: tuanItemId, title, coverFileId, price, stock, sold, section, ... }  ← 扁平 joined,_id 对齐旧小程序逻辑
//   tuan:    { ... }
//   available, subtotal

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async () => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { code: 401, message: 'not logged in' };

  const cartRes = await db.collection('carts').where({ _openid: OPENID }).limit(1).get();
  const cart = (cartRes.data && cartRes.data[0]) || { items: [] };
  const rawItems = cart.items || [];
  if (!rawItems.length) return { code: 0, items: [] };

  const tuanItemIds = rawItems.map((x) => x.tuanItemId || x.productId).filter(Boolean);
  const tiRes = await db.collection('tuan_items').where({ _id: _.in(tuanItemIds) }).get();
  const tiMap = new Map((tiRes.data || []).map((ti) => [ti._id, ti]));

  const productIds = [...new Set((tiRes.data || []).map((ti) => ti.productId))];
  const prodRes = productIds.length
    ? await db.collection('products').where({ _id: _.in(productIds) }).get()
    : { data: [] };
  const prodMap = new Map((prodRes.data || []).map((p) => [p._id, p]));

  const tuanIds = [...new Set((tiRes.data || []).map((ti) => ti.tuanId))];
  const tRes = tuanIds.length
    ? await db.collection('tuans').where({ _id: _.in(tuanIds) }).get()
    : { data: [] };
  const tuanMap = new Map((tRes.data || []).map((t) => [t._id, t]));

  const now = new Date();
  const items = [];
  for (const raw of rawItems) {
    const id = raw.tuanItemId || raw.productId;
    const ti = tiMap.get(id);
    if (!ti) continue;
    const p = prodMap.get(ti.productId) || {};
    const t = tuanMap.get(ti.tuanId) || null;
    const stockLeft = (ti.stock || 0) - (ti.sold || 0);
    const available = !!t && t.status === 'on_sale' && new Date(t.endAt) > now && stockLeft >= raw.quantity;
    const joined = {
      _id: ti._id,
      tuanItemId: ti._id,
      productId: ti.productId,
      tuanId: ti.tuanId,
      title: p.title || '',
      description: p.description || '',
      coverFileId: p.coverFileId || '',
      imageFileIds: p.imageFileIds || [],
      categoryIds: p.categoryIds || [],
      price: ti.price,
      stock: ti.stock,
      sold: ti.sold || 0,
      section: ti.section || null,
      participantCount: ti.participantCount || 0,
    };
    items.push({
      tuanItemId: ti._id,
      productId: ti.productId,          // 兼容旧前端读 productId 字段
      quantity: raw.quantity,
      addedAt: raw.addedAt,
      product: joined,
      tuan: t,
      available,
      subtotal: ti.price * raw.quantity,
    });
  }

  return { code: 0, items };
};
