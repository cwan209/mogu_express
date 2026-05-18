// _admin/listCoupons - 管理员列出优惠券(支持按 status/openid 过滤)
//
// 入参: { token, status?: 'unused'|'used'|'expired', openid? }
// 出参: { code: 0, items: Coupon[] }
//
// 懒过期:
//   DB 中 status='unused' 但 validTo < now 的券,在响应里投射为 'expired'。
//   不批量写 DB(避免 list 触发大量写),写 path 在 createOrder 等动作里做。
//
// 上限 200 条,按 createdAt desc。
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

function projectStatus(coupon, now) {
  if (coupon.status === 'unused' && new Date(coupon.validTo) < now) {
    return { ...coupon, status: 'expired' };
  }
  return coupon;
}

exports.main = async (event) => {
  try {
    await requireAdmin(event);
    const { status, openid } = event || {};

    const where = {};
    if (openid) where._openid = openid;
    // status 过滤:'expired' 特殊处理,因为 DB 中不一定真是 'expired'
    // 简单策略:不在 DB 层过滤 'expired';取 status='unused' + 过期,以及 status='expired' 的并集
    const now = new Date();
    let items;
    if (status === 'expired') {
      // 取所有 unused/expired 然后过滤
      const r = await db.collection('coupons').where(where).orderBy('createdAt', 'desc').limit(200).get();
      items = r.data
        .map((c) => projectStatus(c, now))
        .filter((c) => c.status === 'expired');
    } else if (status === 'unused') {
      const r = await db.collection('coupons').where({ ...where, status: 'unused' }).orderBy('createdAt', 'desc').limit(200).get();
      // 排除 lazily-expired
      items = r.data
        .map((c) => projectStatus(c, now))
        .filter((c) => c.status === 'unused');
    } else if (status === 'used') {
      const r = await db.collection('coupons').where({ ...where, status: 'used' }).orderBy('createdAt', 'desc').limit(200).get();
      items = r.data;
    } else {
      const r = await db.collection('coupons').where(where).orderBy('createdAt', 'desc').limit(200).get();
      items = r.data.map((c) => projectStatus(c, now));
    }

    return { code: 0, items };
  } catch (err) {
    return { code: err.code || 500, message: err.message || 'error' };
  }
};
