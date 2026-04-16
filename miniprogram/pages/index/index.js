// pages/index/index.js - 首页:团列表
const app = getApp();
const tuanService = require('../../services/tuan.js');
const config = require('../../config/index.js');

Page({
  data: {
    tuans: [],
    loading: false,
  },

  onLoad() {
    app.ensureLogin().catch((err) => console.error('[index] login', err));
    this.load();
  },

  onShow() {
    // 返回时刷新(可能有状态更新)
    if (this.data.tuans.length > 0) this.load({ silent: true });
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh());
  },

  load({ silent } = {}) {
    if (!silent) this.setData({ loading: true });
    return tuanService
      .listTuans()
      .then((tuans) => {
        this.setData({ tuans, loading: false });
      })
      .catch((err) => {
        this.setData({ loading: false });
        wx.showToast({ title: '加载失败', icon: 'none' });
        console.error('[index] listTuans', err);
      });
  },

  onShareAppMessage() {
    return {
      title: config.shareTitle,
      path: '/pages/index/index',
    };
  },

  onShareTimeline() {
    return { title: config.shareTitle };
  },
});
