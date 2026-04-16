// _admin/tuanCRUD - 团的增删改
//
// 调用方式:
//   action = 'list' | 'create' | 'update' | 'delete'
//   其他字段因 action 而异
//
// 鉴权:
//   - 小程序内调用:云函数自动得到 openid,查 admins 集合判断
//   - Web 后台调用(经 HTTP 触发器):event.token 传 JWT,verify 后拿 role
const cloud = require('wx-server-sdk');
const { verify } = require('./jwt.js');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const JWT_SECRET = process.env.JWT_SECRET || 'mogu_express_dev_secret_REPLACE_ME_IN_PROD';

async function requireAdmin(event) {
  // 1. HTTP 触发器(Web 后台)带 token
  if (event && event.token) {
    try {
      const payload = verify(event.token, JWT_SECRET);
      return { source: 'web', admin: payload };
    } catch (err) {
      const e = new Error('invalid token');
      e.code = 401;
      throw e;
    }
  }
  // 2. 小程序内 cloud.callFunction,用 openid 查 admins
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) {
    const e = new Error('no openid');
    e.code = 401;
    throw e;
  }
  const res = await db.collection('admins').where({ openid: OPENID }).limit(1).get();
  if (!res.data || !res.data.length) {
    const e = new Error('not admin');
    e.code = 403;
    throw e;
  }
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

async function list({ status }) {
  const col = db.collection('tuans');
  const q = status ? col.where({ status }) : col;
  const res = await q.orderBy('createdAt', 'desc').limit(200).get();
  return { code: 0, items: res.data };
}

async function create({ payload }) {
  const now = new Date();
  const doc = {
    title: payload.title,
    description: payload.description || '',
    coverFileId: payload.coverFileId || '',
    startAt: new Date(payload.startAt),
    endAt: new Date(payload.endAt),
    status: payload.status || 'draft',
    productCount: 0,
    createdAt: now,
    updatedAt: now,
  };
  if (doc.endAt <= doc.startAt) {
    return { code: 1, message: 'endAt must be after startAt' };
  }
  const r = await db.collection('tuans').add({ data: doc });
  return { code: 0, _id: r._id };
}

async function update({ id, patch }) {
  if (!id) return { code: 1, message: 'id required' };
  // 若已有订单,禁止改时间(M2+ 订单集合存在时才校验)
  try {
    const existing = await db
      .collection('orders')
      .where({ 'items.tuanId': id, payStatus: 'paid' })
      .limit(1)
      .get();
    const hasPaid = existing.data && existing.data.length > 0;
    if (hasPaid && (patch.startAt || patch.endAt)) {
      return { code: 1, message: '已有成交订单,不能修改开团/截止时间' };
    }
  } catch {
    // orders 集合可能不存在,忽略
  }
  const data = { ...patch, updatedAt: new Date() };
  if (data.startAt) data.startAt = new Date(data.startAt);
  if (data.endAt)   data.endAt   = new Date(data.endAt);
  delete data._id;
  await db.collection('tuans').doc(id).update({ data });
  return { code: 0 };
}

async function remove({ id }) {
  if (!id) return { code: 1, message: 'id required' };
  // 有商品就拒绝
  const prod = await db.collection('products').where({ tuanId: id }).limit(1).get();
  if (prod.data && prod.data.length) {
    return { code: 1, message: '团下还有商品,请先删除或迁移' };
  }
  await db.collection('tuans').doc(id).remove();
  return { code: 0 };
}
