// pages/pay-result/index.js
const orderService = require('../../services/order.js');
const { fromCents } = require('../../utils/money.js');
const { short } = require('../../utils/date.js');

Page({
  data: {
    orderId: '',
    mode: '',                    // 'stub' | '' (real)
    order: null,
    amountText: '0.00',
    createdAtText: '',
    simulating: false,
    querying: false,
    pollCount: 0,
    maxPoll: 8,                  // 最多轮询 8 次,每次 2 秒(共 16 秒)
  },

  onLoad(options) {
    const { orderId, mode = '', failed } = options || {};
    if (!orderId) return;
    this.setData({ orderId, mode });
    this.refresh().then(() => {
      // 如果是 pending 状态,启动轮询
      if (this.data.order && this.data.order.payStatus === 'pending' && mode !== 'stub') {
        this.startPolling();
      }
      if (failed) {
        wx.showToast({ title: '支付未完成,可点"我已支付"重试', icon: 'none' });
      }
    });
  },

  onUnload() { this.stopPolling(); },

  refresh() {
    return orderService.getOrderDetail(this.data.orderId).then((order) => {
      this.setData({
        order,
        amountText: fromCents(order.amount),
        createdAtText: short(order.createdAt),
      });
      return order;
    }).catch((err) => {
      console.error('[pay-result] load', err);
    });
  },

  startPolling() {
    this.stopPolling();
    this._timer = setInterval(() => {
      const { pollCount, maxPoll } = this.data;
      if (pollCount >= maxPoll) {
        this.stopPolling();
        wx.showToast({ title: '若已支付请稍后下拉刷新', icon: 'none', duration: 3000 });
        return;
      }
      this.setData({ pollCount: pollCount + 1 });
      // 优先调 queryHuepayOrder(主动查 HuePay,可能补单)
      orderService.queryHuepayOrder(this.data.orderId)
        .then((r) => {
          if (r.paid) {
            this.stopPolling();
            this.refresh();
            wx.showToast({ title: '支付成功', icon: 'success' });
          } else {
            // 仍未支付,继续等
          }
        })
        .catch(() => {/* 静默 */});
    }, 2000);
  },

  stopPolling() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
  },

  async onSimulatePay() {
    if (this.data.simulating) return;
    this.setData({ simulating: true });
    try {
      await orderService.simulatePay(this.data.orderId);
      await this.refresh();
      wx.showToast({ title: '支付成功', icon: 'success' });
    } catch (err) {
      wx.showToast({ title: err.message || '失败', icon: 'none' });
    } finally {
      this.setData({ simulating: false });
    }
  },

  async onQueryNow() {
    if (this.data.querying) return;
    this.setData({ querying: true });
    try {
      const r = await orderService.queryHuepayOrder(this.data.orderId);
      if (r.paid) {
        await this.refresh();
        wx.showToast({ title: '支付已确认', icon: 'success' });
        this.stopPolling();
      } else {
        wx.showToast({ title: '尚未收到支付,请稍后', icon: 'none' });
      }
    } catch (err) {
      wx.showToast({ title: err.message || '查询失败', icon: 'none' });
    } finally {
      this.setData({ querying: false });
    }
  },

  onGoOrders() { wx.switchTab({ url: '/pages/orders/index' }); },
  onGoHome()   { wx.switchTab({ url: '/pages/index/index' }); },
});
