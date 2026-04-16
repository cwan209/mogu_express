// services/admin.js - 小程序内管理员功能
// 只允许 admin openid 调用(云函数自行校验)
const config = require('../config/index.js');
const mock = require('../utils/mock.js');
const { callFunction } = require('../utils/cloud.js');

// Mock 模式下没有真正的订单聚合(不是团长视角);构造一份示例数据让 UI 能跑
async function mockStats() {
  await new Promise((r) => setTimeout(r, 120));
  const orders = await mock.listMyOrders();
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const paid = orders.filter((o) =>
    ['paid','shipped','completed'].includes(o.status) &&
    o.paidAt && new Date(o.paidAt) >= todayStart
  );
  const d7 = new Date(Date.now() - 7 * 86400e3);
  const paid7 = orders.filter((o) =>
    ['paid','shipped','completed'].includes(o.status) &&
    new Date(o.createdAt) >= d7
  );
  return {
    gmvToday: paid.reduce((s, o) => s + o.amount, 0),
    ordersToday: paid.length,
    gmv7d: paid7.reduce((s, o) => s + o.amount, 0),
    orders7d: paid7.length,
    pendingShip: orders.filter((o) => o.status === 'paid').length,
  };
}

async function mockListPaidOrders() {
  await new Promise((r) => setTimeout(r, 120));
  const all = await mock.listMyOrders();
  return all.filter((o) => o.status === 'paid').sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

function getStats() {
  if (config.useMock) return mockStats();
  return callFunction('_admin/orderStats');
}

function listPaidOrders() {
  if (config.useMock) return mockListPaidOrders();
  return callFunction('_admin/listAllOrders', { status: 'paid' }).then((r) => (r && r.items) || []);
}

function markShipped(orderId) {
  if (config.useMock) {
    // Mock 模式直接改本地状态
    const orders = wx.getStorageSync('mock_orders') || [];
    const i = orders.findIndex((o) => o._id === orderId);
    if (i >= 0) {
      orders[i].status = 'shipped';
      orders[i].shippedAt = new Date().toISOString();
      wx.setStorageSync('mock_orders', orders);
    }
    return Promise.resolve({ code: 0 });
  }
  return callFunction('_admin/markShipped', { orderId });
}

module.exports = { getStats, listPaidOrders, markShipped };
