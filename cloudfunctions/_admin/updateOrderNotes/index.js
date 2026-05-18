// _admin/updateOrderNotes — admin 设/改订单卖家备注
//
// 入参: { orderId, sellerNote }
// 出参: { code: 0, orderId, notes } 或错误码
//
// 只动 notes.seller,不影响 notes.buyer。
// 兼容老订单:若 notes 不存在,初始化为 {buyer: order.remark || '', seller: sellerNote}。

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
    const { orderId, sellerNote } = event || {};
    if (!orderId) return { code: 1, message: 'orderId required' };
    if (typeof sellerNote !== 'string') return { code: 2, message: 'sellerNote must be string' };
    if (sellerNote.length > 500) return { code: 2, message: 'sellerNote max 500 chars' };

    const col = db.collection('orders');
    const doc = await col.doc(orderId).get().catch(() => null);
    if (!doc || !doc.data) return { code: 3, message: 'order not found' };
    const order = doc.data;

    const newNotes = {
      buyer: order.notes?.buyer ?? order.remark ?? '', // 老订单 fallback 到 order.remark
      seller: sellerNote,
    };

    await col.doc(orderId).update({
      data: { notes: newNotes, updatedAt: new Date() },
    });

    return { code: 0, orderId, notes: newNotes };
  } catch (err) {
    return { code: err.code || 500, message: err.message || 'error' };
  }
};
