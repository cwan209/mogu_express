// _dev/simulatePay - 仅 stub 模式可用的"模拟支付成功"
//
// 小程序在 stub 模式收到 payParams.__stub=true 时,不走真实 wx.requestPayment,
// 改调本函数直接把订单置为 paid,便于本地/演示环境端到端跑通。
//
// 真实环境(HUEPAY_STUB=0)拒绝调用。
const cloud = require('wx-server-sdk');
const huepay = require('./huepay');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event) => {
  if (!huepay._config.stub) {
    return { code: 403, message: '非 stub 模式,此接口禁用' };
  }

  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { code: 401, message: 'not logged in' };

  const { orderId, outTradeNo } = event || {};
  if (!orderId && !outTradeNo) return { code: 1, message: 'orderId or outTradeNo required' };

  let order;
  if (orderId) {
    const r = await db.collection('orders').doc(orderId).get().catch(() => null);
    order = r && r.data;
  } else {
    const r = await db.collection('orders').where({ outTradeNo }).limit(1).get();
    order = r.data && r.data[0];
  }
  if (!order) return { code: 2, message: 'order not found' };
  if (order._openid !== OPENID) return { code: 403, message: 'forbidden' };
  if (order.payStatus === 'paid') return { code: 0, order, already: true };

  // 模拟 HuePay 回调 body
  const callbackBody = {
    __stub: true,
    out_trade_no: order.outTradeNo,
    transaction_id: 'STUB_TX_' + order.outTradeNo,
    amount: order.amount,
    status: 'SUCCESS',
    paid_at: new Date().toISOString(),
  };

  // 直接内嵌一次 payCallback 核心逻辑(避免跨云函数调用的复杂度)
  const verified = huepay.verifyCallback(callbackBody);
  if (!verified.valid) return { code: 500, message: 'stub verify failed' };

  const now = new Date();
  try {
    await db.runTransaction(async (tx) => {
      const oDoc = await tx.collection('orders').doc(order._id).get();
      if (oDoc.data.payStatus === 'paid') throw { code: 0 };
      await tx.collection('orders').doc(order._id).update({
        data: {
          status: 'paid',
          payStatus: 'paid',
          paidAt: now,
          transactionId: verified.transactionId,
          updatedAt: now,
        },
      });
      for (const it of order.items || []) {
        const tuanItemId = it.tuanItemId || it.productId;
        await tx.collection('tuan_items').doc(tuanItemId).update({
          data: { participantCount: _.inc(1), updatedAt: now },
        }).catch((err) => console.warn('[simulatePay] inc participantCount failed for', tuanItemId, err.message));
      }
    });
  } catch (err) {
    if (err && err.code === 0) { /* already paid race */ }
    else { console.error('[simulatePay] txn failed', err); return { code: 500, message: err.message }; }
  }

  try {
    const user = order.userSnapshot || {};
    for (const it of order.items || []) {
      const tuanItemId = it.tuanItemId || it.productId;
      await db.collection('participant_index').add({
        data: {
          _id: `${tuanItemId}_${order._id}`,
          tuanItemId,
          productId: it.productId, orderId: order._id, _openid: order._openid,
          nickName: user.name || '顾客', avatar: '', quantity: it.quantity, paidAt: now,
        },
      });
    }
  } catch {}

  const r2 = await db.collection('orders').doc(order._id).get();
  return { code: 0, order: r2.data, simulated: true };
};
