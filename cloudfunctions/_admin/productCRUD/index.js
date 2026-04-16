// _admin/productCRUD - 商品的增删改
const cloud = require('wx-server-sdk');
const { verify } = require('./jwt.js');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const JWT_SECRET = process.env.JWT_SECRET || 'mogu_express_dev_secret_REPLACE_ME_IN_PROD';

async function requireAdmin(event) {
  if (event && event.token) {
    try { return { source: 'web', admin: verify(event.token, JWT_SECRET) }; }
    catch (err) { const e = new Error('invalid token'); e.code = 401; throw e; }
  }
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) { const e = new Error('no openid'); e.code = 401; throw e; }
  const res = await db.collection('admins').where({ openid: OPENID }).limit(1).get();
  if (!res.data || !res.data.length) { const e = new Error('not admin'); e.code = 403; throw e; }
  return { source: 'mp', admin: res.data[0] };
}

exports.main = async (event) => {
  try {
    await requireAdmin(event);
    const { action } = event || {};
    switch (action) {
      case 'list':   return await list(event);
      case 'create': return await create(event);
      case 'update': return await update(event);
      case 'delete': return await remove(event);
      default: return { code: 1, message: 'unknown action' };
    }
  } catch (err) {
    return { code: err.code || 500, message: err.message || 'error' };
  }
};

async function list({ tuanId, categoryId, page = 1, pageSize = 50 }) {
  const where = {};
  if (tuanId) where.tuanId = tuanId;
  if (categoryId) where.categoryIds = _.in([categoryId]);
  const col = db.collection('products');
  const q = Object.keys(where).length ? col.where(where) : col;
  const [count, res] = await Promise.all([
    q.count(),
    q.orderBy('sort', 'asc').skip((page - 1) * pageSize).limit(pageSize).get(),
  ]);
  return { code: 0, items: res.data, total: count.total };
}

async function create({ payload }) {
  if (!payload || !payload.tuanId) return { code: 1, message: 'tuanId required' };

  // 校验所属团存在
  const tuanRes = await db.collection('tuans').doc(payload.tuanId).get().catch(() => null);
  if (!tuanRes || !tuanRes.data) return { code: 1, message: 'tuan not found' };

  const now = new Date();
  const doc = {
    tuanId: payload.tuanId,
    title: payload.title,
    description: payload.description || '',
    coverFileId: payload.coverFileId || '',
    imageFileIds: payload.imageFileIds || [],
    categoryIds: payload.categoryIds || [],
    price: Number(payload.price) | 0,
    stock: Number(payload.stock) | 0,
    sold: 0,
    sort: Number(payload.sort) | 0,
    participantCount: 0,
    createdAt: now,
    updatedAt: now,
  };
  const r = await db.collection('products').add({ data: doc });

  // 维护 tuan.productCount
  await db.collection('tuans').doc(payload.tuanId).update({
    data: { productCount: _.inc(1), updatedAt: now },
  });

  return { code: 0, _id: r._id };
}

async function update({ id, patch }) {
  if (!id) return { code: 1, message: 'id required' };
  // 已售出时限制改价/改库存方向
  const current = await db.collection('products').doc(id).get().catch(() => null);
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
  const data = { ...patch, updatedAt: new Date() };
  delete data._id;
  delete data.sold;
  await db.collection('products').doc(id).update({ data });
  return { code: 0 };
}

async function remove({ id }) {
  if (!id) return { code: 1, message: 'id required' };
  const prod = await db.collection('products').doc(id).get().catch(() => null);
  if (!prod || !prod.data) return { code: 2, message: 'not found' };
  if ((prod.data.sold || 0) > 0) {
    return { code: 1, message: '已有下单记录,不能删除。请改为 stock=sold 或下架' };
  }
  const tuanId = prod.data.tuanId;
  await db.collection('products').doc(id).remove();
  if (tuanId) {
    await db.collection('tuans').doc(tuanId).update({
      data: { productCount: _.inc(-1), updatedAt: new Date() },
    });
  }
  return { code: 0 };
}
