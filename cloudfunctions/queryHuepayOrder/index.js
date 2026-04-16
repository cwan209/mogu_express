// queryHuepayOrder - 主动查单 + 可选触发补单
//
// 用途:回调丢失 / 用户返回支付结果页时,主动问 HuePay 确认
// 入参:{ orderId } 或 { outTradeNo }
// 行为:如查到已支付但本地 order 还是 pending_pay,等效地走一次 payCallback 逻辑
const cloud = require('wx-server-sdk');
const huepay = require('./huepay');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const { orderId, outTradeNo: outFromEvent } = event || {};
  if (!orderId && !outFromEvent) return { code: 1, message: 'orderId or outTradeNo required' };

  // 定位订单
  let order;
  if (orderId) {
    const r = await db.collection('orders').doc(orderId).get().catch(() => null);
    order = r && r.data;
  } else {
    const r = await db.collection('orders').where({ outTradeNo: outFromEvent }).limit(1).get();
    order = r.data && r.data[0];
  }
  if (!order) return { code: 2, message: 'order not found' };
  if (OPENID && order._openid !== OPENID) {
    // 只允许本人查自己的订单(admin 场景另外处理)
    return { code: 403, message: 'forbidden' };
  }

  // 如果本地已经 paid,直接返
  if (order.payStatus === 'paid') {
    return { code: 0, order, paid: true, source: 'local' };
  }

  // 问 HuePay
  let q;
  try {
    q = await huepay.queryOrder({ outTradeNo: order.outTradeNo });
  } catch (err) {
    console.error('[queryHuepayOrder] huepay.query failed', err);
    return { code: 500, message: err.message };
  }

  if (!q.paid) {
    return { code: 0, order, paid: false, source: 'huepay', status: q.status };
  }

  // HuePay 说已支付,但本地还是 pending → 走补单(和 payCallback 同逻辑,代码小抄一下)
  const now = new Date();
  const paidAt = q.paidAt ? new Date(q.paidAt) : now;
  try {
    await db.runTransaction(async (tx) => {
      const oDoc = await tx.collection('orders').doc(order._id).get();
      if (oDoc.data.payStatus === 'paid') throw { code: 0, message: 'race' };
      await tx.collection('orders').doc(order._id).update({
        data: {
          status: 'paid', payStatus: 'paid',
          paidAt, transactionId: q.transactionId || null, updatedAt: now,
        },
      });
      for (const it of order.items || []) {
        await tx.collection('products').doc(it.productId).update({
          data: { participantCount: _.inc(1), updatedAt: now },
        });
      }
    });
  } catch (err) {
    if (err && err.code === 0) { /* race: ok */ }
    else {
      console.error('[queryHuepayOrder] update txn failed', err);
      return { code: 500, message: err.message || 'error' };
    }
  }

  // 写 participant_index
  try {
    const user = order.userSnapshot || {};
    for (const it of order.items || []) {
      await db.collection('participant_index').add({
        data: {
          _id: `${it.productId}_${order._id}`,
          productId: it.productId,
          orderId: order._id,
          _openid: order._openid,
          nickName: user.name || '顾客',
          avatar: '',
          quantity: it.quantity,
          paidAt,
        },
      });
    }
  } catch (err) {
    console.warn('[queryHuepayOrder] participant_index write failed', err.message);
  }

  // 返回最新 order
  const r2 = await db.collection('orders').doc(order._id).get();
  return { code: 0, order: r2.data, paid: true, source: 'huepay-recovery' };
};
