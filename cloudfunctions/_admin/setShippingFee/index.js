// _admin/setShippingFee — 团长 admin 设订单运费
//
// 入参: { orderId, amount, token? }   amount in cents (¥35 = 3500)
// 出参: { code: 0, orderId, shippingFee: { amount, outTradeNo, payStatus } } 或错误码
//
// 权限: 沿用其它 _admin/* 模式 —— cf 内部 requireAdmin(token JWT or admins 集合 OPENID)
//
// 行为:
//   1. 鉴权
//   2. 查 order,确认存在
//   3. 若 shippingFee.payStatus === 'paid' 则拒改(4)
//   4. 覆盖写 order.shippingFee = { amount, outTradeNo:'SHIP<...>', payStatus:'pending', setAt, paidAt:null }
//   5. 不调任何外部通知 —— 用户在商城里通过红点 / 弹窗看到
//
// outTradeNo 前缀 SHIP 用于 Task 11 HuePay 回调按前缀分流(主单 TRADE / 运费 SHIP)。
// 重复调用会覆盖之前的 shippingFee(团长可改运费,只要还没付)。

const crypto = require('crypto');
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

    const { orderId, amount } = event || {};
    if (!orderId) return { code: 1, message: 'orderId required' };
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0 || amount > 1000000) {
      return { code: 2, message: 'amount must be a number in 0..1000000 (cents, 最高 ¥10,000)' };
    }
    // 防小数分(分必须整数)
    if (!Number.isInteger(amount)) {
      return { code: 2, message: 'amount must be integer cents' };
    }

    const col = db.collection('orders');
    const doc = await col.doc(orderId).get().catch(() => null);
    if (!doc || !doc.data) return { code: 3, message: 'order not found' };
    const order = doc.data;

    if (order.shippingFee && order.shippingFee.payStatus === 'paid') {
      return { code: 4, message: '该订单运费已付,不可修改' };
    }

    const outTradeNo = 'SHIP' + Date.now() + crypto.randomBytes(4).toString('hex').toUpperCase();
    const now = new Date();

    await col.doc(orderId).update({
      data: {
        shippingFee: {
          amount,
          outTradeNo,
          payStatus: 'pending',
          setAt: now,
          paidAt: null,
        },
        updatedAt: now,
      },
    });

    return {
      code: 0,
      orderId,
      shippingFee: { amount, outTradeNo, payStatus: 'pending' },
    };
  } catch (err) {
    return { code: err.code || 500, message: err.message || 'error' };
  }
};
