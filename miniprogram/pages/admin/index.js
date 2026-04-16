// pages/admin/index.js
const app = getApp();
const adminService = require('../../services/admin.js');
const { fromCents } = require('../../utils/money.js');
const { short } = require('../../utils/date.js');

Page({
  data: {
    isAdmin: false,
    forceView: false,    // mock 开发用
    stats: {},
    gmvTodayText: '0.00',
    gmv7dText: '0.00',
    pendingOrders: [],
    amountText: {},
    timeText: {},
    addressText: {},
  },

  onShow() {
    app.ensureLogin().then((res) => {
      this.setData({ isAdmin: !!res.isAdmin });
      if (res.isAdmin || this.data.forceView) this.load();
    });
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh());
  },

  onForceEnable() {
    this.setData({ forceView: true });
    this.load();
  },

  async load() {
    try {
      const [stats, pendingOrders] = await Promise.all([
        adminService.getStats(),
        adminService.listPaidOrders(),
      ]);
      const amountText = {};
      const timeText = {};
      const addressText = {};
      for (const o of pendingOrders) {
        amountText[o._id] = fromCents(o.amount);
        timeText[o._id] = short(o.createdAt);
        const s = o.shipping || {};
        addressText[o._id] = [s.line1, s.line2, s.suburb, s.state, s.postcode].filter(Boolean).join(', ');
      }
      this.setData({
        stats,
        gmvTodayText: fromCents(stats.gmvToday || 0),
        gmv7dText: fromCents(stats.gmv7d || 0),
        pendingOrders,
        amountText, timeText, addressText,
      });
    } catch (err) {
      console.error('[admin] load', err);
      wx.showToast({ title: err.message || '加载失败', icon: 'none' });
    }
  },

  onCallPhone(e) {
    const phoneNumber = e.currentTarget.dataset.phone;
    wx.makePhoneCall({ phoneNumber }).catch(() => {});
  },

  async onShip(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认发货',
      content: '标记后顾客会看到"已发货"状态',
      success: async (r) => {
        if (!r.confirm) return;
        try {
          wx.showLoading({ title: '处理中...' });
          await adminService.markShipped(id);
          wx.hideLoading();
          wx.showToast({ title: '已发货', icon: 'success' });
          this.load();
        } catch (err) {
          wx.hideLoading();
          wx.showToast({ title: err.message || '失败', icon: 'none' });
        }
      },
    });
  },
});
