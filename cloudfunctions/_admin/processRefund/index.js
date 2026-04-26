// _admin/processRefund - 管理员审批退款申请
// action='approve': 调 HuePay 退款 + 事务回滚库存 + status→refunded
// action='reject':  status 回 paid + 记录拒绝原因
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
    const { orderId, action, rejectReason } = event || {};
    if (!orderId) return { code: 1, message: 'orderId required' };
    if (action !== 'approve' && action !== 'reject') {
      return { code: 1, message: 'action must be approve or reject' };
    }

    const oDoc = await db.collection('orders').doc(orderId).get().catch(() => null);
    const order = oDoc && oDoc.data;
    if (!order) return { code: 2, message: '订单不存在' };
    if (order.status !== 'refund_requested') {
      return { code: 3, message: '仅退款申请中的订单可处理' };
    }

    const now = new Date();

    if (action === 'approve') {
      // 调 HuePay 退款
      const huepay = require('./huepay/index.js');
      const refundNo = 'REFUND_' + orderId + '_' + Date.now();
      const refundResult = await huepay.refund({
        outTradeNo: order.outTradeNo,
        refundNo,
        refundAmount: order.amount,
        reason: '用户申请退款',
      });

      // 事务:回滚库存 + 更新订单
      await db.runTransaction(async (transaction) => {
        for (const it of order.items) {
          const tuanItemId = it.tuanItemId || it.productId;
          await transaction.collection('tuan_items').doc(tuanItemId).update({
            data: { sold: _.inc(-it.quantity), updatedAt: now },
          }).catch((err) => console.warn('[processRefund] rollback failed for', tuanItemId, err.message));
        }
        await transaction.collection('orders').doc(orderId).update({
          data: {
            status: 'refunded',
            payStatus: 'refunded',
            refundedAt: now,
            refundId: refundResult.refundId || null,
            updatedAt: now,
          },
        });
      });
    } else {
      // reject: 订单回 paid
      const updateData = {
        status: 'paid',
        refundRejectedAt: now,
        updatedAt: now,
      };
      if (rejectReason) updateData.refundRejectReason = rejectReason;
      await db.collection('orders').doc(orderId).update({ data: updateData });
    }

    return { code: 0 };
  } catch (err) {
    return { code: err.code || 500, message: err.message || 'error' };
  }
};
