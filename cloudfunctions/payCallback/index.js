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

// 云开发 HTTP 触发器 / Express 网关:event 形态有几种,统一抽出 parsed body + rawBody + headers
//   - 云开发原生触发器:event 已是解析后的 body 对象(无 headers / rawBody)
//   - HTTP 触发器(网关):event 形如 { body: '<str>', headers: {...}, ... }
//   - Express 转发:server.js 把 { ...body, headers, rawBody, __envelope: true } 注入
function extractBody(event) {
  if (event && event.body != null && typeof event.body === 'string') {
    try { return JSON.parse(event.body); } catch { return null; }
  }
  if (event && event.__envelope === true) {
    // Express 把 body 字段平铺,headers/rawBody 单独抽
    const { headers, rawBody, __envelope, ...rest } = event;
    return rest;
  }
  return event;
}

function extractHeaders(event) {
  if (!event) return {};
  if (event.headers && typeof event.headers === 'object') return event.headers;
  return {};
}

function extractRawBody(event) {
  if (!event) return null;
  if (typeof event.rawBody === 'string') return event.rawBody;
  if (typeof event.body === 'string') return event.body;
  return null;
}

function getHeader(headers, name) {
  if (!headers) return null;
  const lower = name.toLowerCase();
  for (const k of Object.keys(headers)) {
    if (k.toLowerCase() === lower) return headers[k];
  }
  return null;
}

exports.main = async (event) => {
  const body = extractBody(event);
  const headers = extractHeaders(event);
  const rawBody = extractRawBody(event);
  const headerSig = getHeader(headers, 'X-Signature');
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

  // 验签 + 解析(envelope 契约:rawBody + headerSignature + parsed)
  const verified = huepay.verifyCallback({
    rawBody,
    headerSignature: headerSig,
    parsed: body,
  });
  if (!verified.valid) {
    console.error('[payCallback] verify failed:', verified.reason);
    await updateLog(logId, { result: 'bad_sign', reason: verified.reason });
    // 即便验签失败也回 200,避免 HuePay 24h 内 18 次重试浪费资源(已记日志可人工查)
    return { code: 0, message: 'logged', verifyError: verified.reason };
  }

  const { outTradeNo, transactionId, paidAt, amount, status } = verified;
  if (!outTradeNo) {
    await updateLog(logId, { result: 'bad_payload' });
    return { code: 0, message: 'logged' };  // 仍 200 防重试
  }

  // 非"支付成功"状态直接记录不动订单
  // HuePay status: SUCCEED (paid) / SUCCESS / PAID(向后兼容)/ FAILED(失败)/ PENDING
  const STATUS_PAID = ['SUCCEED', 'SUCCESS', 'PAID'];
  if (status && !STATUS_PAID.includes(status)) {
    console.log(`[payCallback] ${outTradeNo} status=${status},不更新订单`);
    await updateLog(logId, { result: 'ignored', status });
    return { code: 0, message: 'ok' };
  }

  // 按 outTradeNo 前缀路由:
  //   TRADE* — 主订单(原逻辑,见下方)
  //   SHIP*  — 运费尾款,走 order.shippingFee 分支
  if (outTradeNo.startsWith('SHIP')) {
    const shipRes = await db
      .collection('orders')
      .where({ 'shippingFee.outTradeNo': outTradeNo })
      .limit(1)
      .get();
    const shipOrder = shipRes.data && shipRes.data[0];
    if (!shipOrder) {
      console.warn('[payCallback] SHIP outTradeNo no match:', outTradeNo);
      await updateLog(logId, { result: 'ship_order_not_found', outTradeNo });
      // 200 让 HuePay 停止重试(订单已不存在,重试无意义)
      return { code: 0, message: 'logged' };
    }

    // 幂等:运费已 paid 直接 ACK
    if (shipOrder.shippingFee && shipOrder.shippingFee.payStatus === 'paid') {
      console.log(`[payCallback] SHIP ${outTradeNo} already paid,幂等忽略`);
      await updateLog(logId, { result: 'ship_already_paid', orderId: shipOrder._id });
      return { code: 0, message: 'ok' };
    }

    // 金额校验(若回调给了金额)
    if (amount != null && shipOrder.shippingFee && Number(amount) !== shipOrder.shippingFee.amount) {
      console.error(`[payCallback] SHIP amount mismatch: expect ${shipOrder.shippingFee.amount}, got ${amount}`);
      await updateLog(logId, {
        result: 'ship_amount_mismatch',
        expected: shipOrder.shippingFee.amount,
        got: amount,
      });
      // 200 让 HuePay 停止重试(金额异常应人工查,不该重试)
      return { code: 0, message: 'logged' };
    }

    const shipNow = new Date();
    const shipPaidAt = paidAt ? new Date(paidAt) : shipNow;
    try {
      await db.collection('orders').doc(shipOrder._id).update({
        data: {
          'shippingFee.payStatus': 'paid',
          'shippingFee.paidAt': shipPaidAt,
          updatedAt: shipNow,
        },
      });
    } catch (err) {
      console.error('[payCallback] SHIP update failed', err);
      await updateLog(logId, { result: 'ship_update_failed', error: err.message });
      return { code: 500, message: 'internal error' };
    }

    await updateLog(logId, { result: 'ship_ok', orderId: shipOrder._id });
    console.log(`[payCallback] SHIP ${outTradeNo} → shippingFee.paid (order ${shipOrder._id})`);
    return { code: 0, message: 'ok' };
  }

  // 幂等:按 outTradeNo 查,若已 paid 直接 ACK
  const orderRes = await db.collection('orders').where({ outTradeNo }).limit(1).get();
  const order = orderRes.data && orderRes.data[0];
  if (!order) {
    await updateLog(logId, { result: 'order_not_found', outTradeNo });
    // 200 让 HuePay 停止重试(订单不存在,重试也找不到)
    return { code: 0, message: 'logged' };
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
    // 200 让 HuePay 停止重试(金额对不上要人工查,不能让钱进错单)
    return { code: 0, message: 'logged' };
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
