// _admin/tuanItemCRUD - 管理团内商品实例(tuan_items)
//
// Actions:
//   list   { tuanId }                                           → 团内全部实例(joined view)
//   create { tuanId, productId, price, stock, sort?, section? } → 新增实例
//   update { id, patch }                                         → 改 price/stock/sort/section
//   delete { id }                                                → 从团里移除(sold>0 拒绝)
//   copyFromTuan { sourceTuanId, targetTuanId }                 → 批量克隆源团所有实例到目标团

const cloud = require('wx-server-sdk');
const { verify } = require('./jwt.js');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const JWT_SECRET = process.env.JWT_SECRET || 'mogu_express_dev_secret_REPLACE_ME_IN_PROD';

async function requireAdmin(event) {
  if (event && event.token) {
    try { return verify(event.token, JWT_SECRET); }
    catch { const e = new Error('invalid token'); e.code = 401; throw e; }
  }
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) { const e = new Error('no openid'); e.code = 401; throw e; }
  const res = await db.collection('admins').where({ openid: OPENID }).limit(1).get();
  if (!res.data || !res.data.length) { const e = new Error('not admin'); e.code = 403; throw e; }
  return res.data[0];
}

exports.main = async (event) => {
  try {
    await requireAdmin(event);
    const { action } = event || {};
    switch (action) {
      case 'list':         return await list(event);
      case 'create':       return await create(event);
      case 'update':       return await update(event);
      case 'delete':       return await remove(event);
      case 'copyFromTuan': return await copyFromTuan(event);
      default: return { code: 1, message: 'unknown action' };
    }
  } catch (err) {
    return { code: err.code || 500, message: err.message || 'error' };
  }
};

async function list({ tuanId }) {
  if (!tuanId) return { code: 1, message: 'tuanId required' };
  const tiRes = await db.collection('tuan_items').where({ tuanId })
    .orderBy('sort', 'asc').limit(500).get();
  const items = tiRes.data || [];
  if (!items.length) return { code: 0, items: [] };
  const prodRes = await db.collection('products')
    .where({ _id: _.in(items.map((i) => i.productId)) }).limit(500).get();
  const pmap = new Map((prodRes.data || []).map((p) => [p._id, p]));
  const joined = items.map((ti) => {
    const p = pmap.get(ti.productId) || {};
    return {
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
      sort: ti.sort,
      section: ti.section || null,
      participantCount: ti.participantCount || 0,
    };
  });
  return { code: 0, items: joined };
}

async function create({ tuanId, productId, price, stock, sort, section }) {
  if (!tuanId || !productId) return { code: 1, message: 'tuanId + productId required' };

  const tuan = await db.collection('tuans').doc(tuanId).get().catch(() => null);
  if (!tuan || !tuan.data) return { code: 2, message: 'tuan not found' };
  const prod = await db.collection('products').doc(productId).get().catch(() => null);
  if (!prod || !prod.data) return { code: 2, message: 'product not found' };

  // 唯一性:同一商品在同一团只允许一条实例
  const exist = await db.collection('tuan_items')
    .where({ tuanId, productId }).limit(1).get();
  if (exist.data && exist.data.length) {
    return { code: 3, message: '该商品已在此团中' };
  }

  const now = new Date();
  const rawSection = (section || '').trim();
  const doc = {
    tuanId, productId,
    price: Number(price) | 0,
    stock: Number(stock) | 0,
    sold: 0,
    sort: Number(sort) | 0,
    section: rawSection || null,
    participantCount: 0,
    createdAt: now,
    updatedAt: now,
  };
  const r = await db.collection('tuan_items').add({ data: doc });
  await db.collection('tuans').doc(tuanId).update({
    data: { productCount: _.inc(1), updatedAt: now },
  });
  return { code: 0, _id: r._id };
}

async function update({ id, patch }) {
  if (!id) return { code: 1, message: 'id required' };
  const current = await db.collection('tuan_items').doc(id).get().catch(() => null);
  if (!current || !current.data) return { code: 2, message: 'not found' };

  const sold = current.data.sold || 0;
  if (sold > 0) {
    if (patch.price != null && patch.price > current.data.price) {
      return { code: 1, message: '已有成交订单,不能涨价' };
    }
    if (patch.stock != null && patch.stock < sold) {
      return { code: 1, message: `新库存不能低于已售 ${sold}` };
    }
  }

  const allowed = ['price', 'stock', 'sort', 'section'];
  const data = { updatedAt: new Date() };
  for (const k of allowed) {
    if (!(k in patch)) continue;
    if (k === 'section') {
      const s = (patch.section || '').trim();
      data.section = s || null;
    } else {
      data[k] = Number(patch[k]) | 0;
    }
  }
  await db.collection('tuan_items').doc(id).update({ data });
  return { code: 0 };
}

async function remove({ id }) {
  if (!id) return { code: 1, message: 'id required' };
  const ti = await db.collection('tuan_items').doc(id).get().catch(() => null);
  if (!ti || !ti.data) return { code: 2, message: 'not found' };
  if ((ti.data.sold || 0) > 0) {
    return { code: 1, message: '已有下单记录,不能从团中移除。请改库存=已售或让团截止' };
  }
  await db.collection('tuan_items').doc(id).remove();
  await db.collection('tuans').doc(ti.data.tuanId).update({
    data: { productCount: _.inc(-1), updatedAt: new Date() },
  }).catch(() => {});
  return { code: 0 };
}

/**
 * 批量克隆源团所有实例到目标团。
 * 如果目标团已有同 productId 的实例,跳过那一条。
 * 返回 { copied, skipped }。
 */
async function copyFromTuan({ sourceTuanId, targetTuanId }) {
  if (!sourceTuanId || !targetTuanId) return { code: 1, message: 'sourceTuanId + targetTuanId required' };
  if (sourceTuanId === targetTuanId) return { code: 1, message: 'source == target' };

  const target = await db.collection('tuans').doc(targetTuanId).get().catch(() => null);
  if (!target || !target.data) return { code: 2, message: 'target tuan not found' };

  const srcRes = await db.collection('tuan_items').where({ tuanId: sourceTuanId }).limit(500).get();
  const src = srcRes.data || [];
  if (!src.length) return { code: 0, copied: 0, skipped: 0 };

  const existingRes = await db.collection('tuan_items').where({ tuanId: targetTuanId }).limit(500).get();
  const existingProductIds = new Set((existingRes.data || []).map((i) => i.productId));

  const now = new Date();
  let copied = 0, skipped = 0;
  for (const ti of src) {
    if (existingProductIds.has(ti.productId)) { skipped++; continue; }
    await db.collection('tuan_items').add({
      data: {
        tuanId: targetTuanId,
        productId: ti.productId,
        price: ti.price,
        stock: ti.stock,
        sold: 0,
        sort: ti.sort,
        section: ti.section || null,
        participantCount: 0,
        createdAt: now,
        updatedAt: now,
      },
    });
    copied++;
  }
  if (copied) {
    await db.collection('tuans').doc(targetTuanId).update({
      data: { productCount: _.inc(copied), updatedAt: now },
    }).catch(() => {});
  }
  return { code: 0, copied, skipped };
}
