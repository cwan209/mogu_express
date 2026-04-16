// _admin/markShipped - 标记发货
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
    const { orderIds } = event || {};
    const ids = Array.isArray(orderIds) ? orderIds : (event && event.orderId ? [event.orderId] : []);
    if (!ids.length) return { code: 1, message: 'orderIds required' };

    const now = new Date();
    let ok = 0;
    for (const id of ids) {
      const o = await db.collection('orders').doc(id).get().catch(() => null);
      if (!o || !o.data) continue;
      if (o.data.status !== 'paid') continue;
      await db.collection('orders').doc(id).update({
        data: { status: 'shipped', shippedAt: now, updatedAt: now },
      });
      ok++;
    }
    return { code: 0, updated: ok };
  } catch (err) {
    return { code: err.code || 500, message: err.message || 'error' };
  }
};
