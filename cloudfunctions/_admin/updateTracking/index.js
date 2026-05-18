// _admin/updateTracking — 团长 admin 设/改订单物流信息
//
// 入参: { orderId, weight?, courierName?, courierNo? }
// 出参: { code: 0, orderId, tracking } 或错误码

const cloud = require('wx-server-sdk');
const { verify } = require('./jwt.js');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const JWT_SECRET = process.env.JWT_SECRET || 'mogu_express_dev_secret_REPLACE_ME_IN_PROD';

const COURIER_ENUM = ['顺丰', '中通', '圆通', '极兔', 'EMS', 'Australia Post', 'StarTrack', '其他'];

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
    const { orderId, weight, courierName, courierNo } = event || {};
    if (!orderId) return { code: 1, message: 'orderId required' };

    if (weight !== undefined && weight !== null) {
      if (typeof weight !== 'number' || !Number.isFinite(weight) || weight < 0 || weight > 1000) {
        return { code: 2, message: 'weight must be 0..1000 kg' };
      }
    }
    if (courierName !== undefined && courierName !== null && courierName !== '') {
      if (!COURIER_ENUM.includes(courierName)) {
        return { code: 3, message: `courierName not in enum: ${COURIER_ENUM.join('/')}` };
      }
    }
    if (courierNo !== undefined && courierNo !== null) {
      if (typeof courierNo !== 'string' || courierNo.length > 100) {
        return { code: 4, message: 'courierNo too long' };
      }
    }

    const col = db.collection('orders');
    const doc = await col.doc(orderId).get().catch(() => null);
    if (!doc || !doc.data) return { code: 5, message: 'order not found' };

    const now = new Date();
    const tracking = {
      weight: weight ?? null,
      courierName: courierName || null,
      courierNo: courierNo || null,
      setAt: now,
    };

    await col.doc(orderId).update({
      data: { tracking, updatedAt: now },
    });

    return { code: 0, orderId, tracking };
  } catch (err) {
    return { code: err.code || 500, message: err.message || 'error' };
  }
};
