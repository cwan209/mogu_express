// pages/orders/index.js
const orderService = require('../../services/order.js');
const { fromCents } = require('../../utils/money.js');

const STATUS_LABEL = {
  pending_pay: '待支付',
  paid: '已支付',
  shipped: '已发货',
  completed: '已完成',
  cancelled: '已取消',
  refunded: '已退款',
};

Page({
  data: {
    tab: 'all',
    orders: [],
    filtered: [],
    amountMap: {},
    statusLabel: STATUS_LABEL,
  },

  onShow() { this.load(); },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh());
  },

  load() {
    return orderService.listMyOrders().then((orders) => {
      const amountMap = {};
      for (const o of orders) amountMap[o._id] = fromCents(o.amount);
      this.setData({ orders, amountMap }, () => this.applyFilter());
    });
  },

  onTab(e) {
    this.setData({ tab: e.currentTarget.dataset.t }, () => this.applyFilter());
  },

  applyFilter() {
    const { tab, orders } = this.data;
    const filtered = tab === 'all' ? orders : orders.filter((o) => o.status === tab);
    this.setData({ filtered });
  },

  onTapOrder(e) {
    wx.navigateTo({ url: '/pages/order-detail/index?id=' + e.currentTarget.dataset.id });
  },
});
