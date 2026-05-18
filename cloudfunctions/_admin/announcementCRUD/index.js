// _admin/announcementCRUD - 首页 Swiper 滚动 banner 的增删改
const cloud = require('wx-server-sdk');
const { verify } = require('./jwt.js');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

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
  const res = await db.collection('announcements')
    .orderBy('sortOrder', 'asc')
    .orderBy('createdAt', 'desc')
    .limit(200)
    .get();
  return { code: 0, items: res.data || [] };
}

async function create({ payload }) {
  payload = payload || {};
  const image = typeof payload.image === 'string' ? payload.image.trim() : '';
  const link = typeof payload.link === 'string' ? payload.link.trim() : '';
  if (!image) return { code: 1, message: 'image required' };
  if (!link) return { code: 1, message: 'link required' };
  if (!link.startsWith('/')) return { code: 1, message: 'link must start with /' };

  const now = new Date();
  const doc = {
    image,
    link,
    sortOrder: Number.isFinite(Number(payload.sortOrder)) ? Number(payload.sortOrder) : 0,
    active: payload.active !== false,
    createdAt: now,
    updatedAt: now,
  };
  const r = await db.collection('announcements').add({ data: doc });
  return { code: 0, _id: r._id };
}

async function update({ id, patch }) {
  if (!id) return { code: 1, message: 'id required' };
  const data = { ...(patch || {}) };
  delete data._id;
  delete data.createdAt;
  data.updatedAt = new Date();
  await db.collection('announcements').doc(id).update({ data });
  return { code: 0 };
}

async function remove({ id }) {
  if (!id) return { code: 1, message: 'id required' };
  await db.collection('announcements').doc(id).remove();
  return { code: 0 };
}
