// getPendingOrders — 查当前用户所有 shippingFee.payStatus='pending' 的订单
//
// 入参: 无 (token 由 server.js 注入 OPENID context)
// 出参: { code: 0, orders: [{ _id, orderNo, items[], shippingFee }] }
//
// 用途: web-shop 首页弹 PendingOrderBanner + 订单 tab badge.
// 这是 read-only query,无需事务。limit 20 防 abuse。

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async () => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { code: 401, message: 'not logged in' };

  const res = await db
    .collection('orders')
    .where({
      _openid: OPENID,
      'shippingFee.payStatus': 'pending',
    })
    .orderBy('shippingFee.setAt', 'desc')
    .limit(20)
    .get();

  const orders = (res.data || []).map((o) => ({
    _id: o._id,
    orderNo: o.orderNo,
    items: o.items?.map((i) => ({ title: i.title, quantity: i.quantity })) || [],
    shippingFee: o.shippingFee,
  }));

  return { code: 0, orders };
};
