// payShipping — 用户支付订单尾款(运费)
//
// 入参: { orderId }
// 出参: { code: 0, payParams, raw: { stub: bool } } 同 createOrder.payParams 格式
//
// 不更新 payStatus — 等 HuePay notify 回调到来才更新 (paid)。
// 回调路由按 outTradeNo 前缀:SHIP* → 走尾款逻辑(Task 11 实现)。

const cloud = require('wx-server-sdk');
const huepay = require('./huepay');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { code: 401, message: 'not logged in' };

  const { orderId } = event || {};
  if (!orderId) return { code: 1, message: 'orderId required' };

  const doc = await db.collection('orders').doc(orderId).get().catch(() => null);
  if (!doc || !doc.data) return { code: 2, message: 'order not found' };
  const order = doc.data;

  if (order._openid !== OPENID) return { code: 3, message: '订单不属于当前用户' };
  if (!order.shippingFee) return { code: 4, message: '该订单未设运费' };
  if (order.shippingFee.payStatus === 'paid') return { code: 5, message: '运费已付' };
  if (!order.shippingFee.amount || order.shippingFee.amount <= 0) {
    return { code: 6, message: '运费金额无效' };
  }

  // 调 HuePay 拿 payParams,outTradeNo 用 shippingFee.outTradeNo (SHIP<...>)
  try {
    const body = `运费 ${order.orderNo}`;
    const { payParams, raw } = await huepay.createOrder({
      outTradeNo: order.shippingFee.outTradeNo,
      amount: order.shippingFee.amount,
      body,
      openid: OPENID,
    });
    return { code: 0, payParams, raw: raw ? { stub: !!raw.stub } : null };
  } catch (err) {
    console.error('[payShipping] HuePay failed', err);
    return { code: 7, message: '支付渠道异常:' + (err.message || err.code) };
  }
};
