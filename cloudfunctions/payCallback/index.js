// payCallback - HuePay 异步回调
//
// 部署:
//   - 云开发:加 HTTP 触发器,URL 填到 HuePay 后台的"通知地址"
//   - Docker/VPS:Express 把 POST /cloud/payCallback 转进来
//
// 职责:
//   1. 验签
//   2. 幂等更新订单 pending_pay → paid,累加 product.participantCount
//   3. 写 participant_index(供详情页展示)
//   4. 落原始日志到 pay_logs
//   5. 返回 HuePay 需要的 ACK(一般是 {code: 0} 或 'SUCCESS')
const cloud = require('wx-server-sdk');
const huepay = require('./huepay');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

// 云开发 HTTP 触发器:event 是解析后的 body;若是 { body: '...', ... } 这种网关结构,取 body
function extractBody(event) {
  if (event && event.body != null && typeof event.body === 'string') {
    try { return JSON.parse(event.body); } catch { return null; }
  }
  return event;
}

exports.main = async (event) => {
  const body = extractBody(event);
  console.log('[payCallback] incoming:', JSON.stringify(body));

  // 落日志(不管成功失败都记一条)
  const logId = 'paylog_' + Date.now() + Math.floor(Math.random() * 1000);
  try {
    await db.collection('pay_logs').add({
      data: {
        _id: logId,
        raw: body,
        receivedAt: new Date(),
        result: 'pending',
      },
    });
  } catch (err) {
    // pay_logs 集合可能未创建,忽略
    console.warn('[payCallback] log failed:', err.message);
  }

  // 验签 + 解析
  const verified = huepay.verifyCallback(body);
  if (!verified.valid) {
    console.error('[payCallback] verify failed:', verified.reason);
    await updateLog(logId, { result: 'bad_sign', reason: verified.reason });
    return { code: 401, message: 'invalid signature' };
  }

  const { outTradeNo, transactionId, paidAt, amount, status } = verified;
  if (!outTradeNo) {
    await updateLog(logId, { result: 'bad_payload' });
    return { code: 400, message: 'missing out_trade_no' };
  }

  // 非"支付成功"状态直接记录不动订单
  if (status && status !== 'SUCCESS' && status !== 'PAID') {
    console.log(`[payCallback] ${outTradeNo} status=${status},不更新订单`);
    await updateLog(logId, { result: 'ignored', status });
    return { code: 0, message: 'ok' };  // 仍返 ACK 让 HuePay 停止重试
  }

  // 幂等:按 outTradeNo 查,若已 paid 直接 ACK
  const orderRes = await db.collection('orders').where({ outTradeNo }).limit(1).get();
  const order = orderRes.data && orderRes.data[0];
  if (!order) {
    await updateLog(logId, { result: 'order_not_found', outTradeNo });
    return { code: 404, message: 'order not found' };
  }

  if (order.payStatus === 'paid') {
    console.log(`[payCallback] ${outTradeNo} already paid,幂等忽略`);
    await updateLog(logId, { result: 'already_paid', orderId: order._id });
    return { code: 0, message: 'ok' };
  }

  // 金额校验(若回调给了金额)
  if (amount != null && Number(amount) !== order.amount) {
    console.error(`[payCallback] amount mismatch: expect ${order.amount}, got ${amount}`);
    await updateLog(logId, { result: 'amount_mismatch', expected: order.amount, got: amount });
    return { code: 409, message: 'amount mismatch' };
  }

  // 更新订单 + 累加 product.participantCount + 写 participant_index
  const now = new Date();
  const paidAtDate = paidAt ? new Date(paidAt) : now;

  try {
    await db.runTransaction(async (tx) => {
      // 二次确认订单状态(防止并发)
      const oDoc = await tx.collection('orders').doc(order._id).get();
      if (oDoc.data.payStatus === 'paid') throw { code: 0, message: 'race: already paid' };

      await tx.collection('orders').doc(order._id).update({
        data: {
          status: 'paid',
          payStatus: 'paid',
          paidAt: paidAtDate,
          transactionId: transactionId || null,
          updatedAt: now,
        },
      });

      // 累加每个 tuan_item 的 participantCount
      for (const it of order.items || []) {
        const tuanItemId = it.tuanItemId || it.productId; // 兼容老订单快照
        await tx.collection('tuan_items').doc(tuanItemId).update({
          data: { participantCount: _.inc(1), updatedAt: now },
        }).catch((err) => console.warn('[payCallback] inc participantCount failed for', tuanItemId, err.message));
      }
    });
  } catch (err) {
    if (err && err.code === 0) {
      // race: 已被其他请求更新,算成功
      await updateLog(logId, { result: 'race_already_paid' });
      return { code: 0, message: 'ok' };
    }
    console.error('[payCallback] txn failed', err);
    await updateLog(logId, { result: 'txn_failed', error: err.message });
    return { code: 500, message: 'internal error' };
  }

  // 写 participant_index(失败不阻断,用来加速商品详情页参与名单)
  try {
    const user = order.userSnapshot || {};
    for (const it of order.items || []) {
      const tuanItemId = it.tuanItemId || it.productId;
      await db.collection('participant_index').add({
        data: {
          _id: `${tuanItemId}_${order._id}`,
          tuanItemId,
          productId: it.productId,
          orderId: order._id,
          _openid: order._openid,
          nickName: user.name || '顾客',
          avatar: '',
          quantity: it.quantity,
          paidAt: paidAtDate,
        },
      });
    }
  } catch (err) {
    console.warn('[payCallback] participant_index write failed', err.message);
  }

  await updateLog(logId, { result: 'ok', orderId: order._id });
  console.log(`[payCallback] ${outTradeNo} → paid`);

  return { code: 0, message: 'ok' };
};

async function updateLog(id, patch) {
  try {
    await db.collection('pay_logs').doc(id).update({ data: patch });
  } catch {}
}
