// _admin/categoryCRUD - 分类的增删改
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
    switch (event && event.action) {
      case 'list':   return await list();
      case 'create': return await create(event);
      case 'update': return await update(event);
      case 'delete': return await remove(event);
      default: return { code: 1, message: 'unknown action' };
    }
  } catch (err) {
    return { code: err.code || 500, message: err.message || 'error' };
  }
};

async function list() {
  const res = await db.collection('categories').orderBy('sort', 'asc').limit(100).get();
  return { code: 0, items: res.data };
}

async function create({ payload }) {
  const doc = {
    name: payload.name,
    sort: Number(payload.sort) | 0,
    isActive: payload.isActive !== false,
    createdAt: new Date(),
  };
  const r = await db.collection('categories').add({ data: doc });
  return { code: 0, _id: r._id };
}

async function update({ id, patch }) {
  if (!id) return { code: 1, message: 'id required' };
  const data = { ...patch };
  delete data._id;
  await db.collection('categories').doc(id).update({ data });
  return { code: 0 };
}

async function remove({ id }) {
  if (!id) return { code: 1, message: 'id required' };
  // 有商品在用就拒绝
  const used = await db
    .collection('products')
    .where({ categoryIds: _.in([id]) })
    .limit(1)
    .get();
  if (used.data && used.data.length) {
    return { code: 1, message: '该分类下还有商品,请先改其分类' };
  }
  await db.collection('categories').doc(id).remove();
  return { code: 0 };
}
