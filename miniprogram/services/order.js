// services/order.js
const config = require('../config/index.js');
const mock = require('../utils/mock.js');
const { callFunction } = require('../utils/cloud.js');

function createOrder({ items, addressId, remark, requirePay = true }) {
  if (config.useMock) {
    // Mock 模式:对齐真实后端的返回结构 { code, order, payParams }
    // config.mockRequirePay=true 时 mock 也生成 stub payParams,方便演示支付 UI
    const mockRequirePay = !!config.mockRequirePay;
    const effective = requirePay && mockRequirePay;
    return mock.createOrder({ items, addressId, remark, requirePay: effective })
      .then((order) => ({
        code: 0,
        order,
        payParams: effective ? {
          __stub: true,
          timeStamp: String(Math.floor(Date.now() / 1000)),
          nonceStr: 'mock',
          package: 'prepay_id=MOCK_' + order._id,
          signType: 'HMAC-SHA256',
          paySign: 'MOCK_PAY_SIGN',
        } : null,
      }));
  }
  return callFunction('createOrder', { items, addressId, remark, requirePay });
}

function simulatePay(orderId) {
  if (config.useMock) return mock.simulatePay(orderId);
  return callFunction('_dev/simulatePay', { orderId });
  // 云函数返回 { code:0, order, simulated },pay-result 不直接用,refresh 时会重拉
}

function queryHuepayOrder(orderId) {
  if (config.useMock) return mock.queryOrderPaid(orderId);
  return callFunction('queryHuepayOrder', { orderId });
  // 云函数返回 { code, order, paid, source } — 字段名兼容 mock,直接用
}

function listMyOrders() {
  if (config.useMock) return mock.listMyOrders();
  return callFunction('listMyOrders').then((r) => (r && r.items) || []);
}

function getOrderDetail(orderId) {
  if (config.useMock) return mock.getOrderDetail(orderId);
  // 云函数返回 { code: 0, order: {...} },解包成 order 本身
  return callFunction('getOrderDetail', { orderId }).then((r) => (r && r.order) || r);
}

function cancelOrder(orderId) {
  if (config.useMock) return mock.cancelOrder(orderId);
  return callFunction('cancelOrder', { orderId });
}

module.exports = {
  createOrder, simulatePay, queryHuepayOrder,
  listMyOrders, getOrderDetail, cancelOrder,
};
