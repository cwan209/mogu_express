// pages/index/index.js - 首页:团列表
const app = getApp();
const tuanService = require('../../services/tuan.js');
const bannerService = require('../../services/banner.js');
const config = require('../../config/index.js');

Page({
  data: {
    tuans: [],
    loading: false,
    banner: { title: '接龙团购', subtitle: '本周进行中 · 尽快接龙抢货' },
  },

  onLoad() {
    app.ensureLogin().catch((err) => console.error('[index] login', err));
    this.loadBanner();
    this.load();
  },

  onShow() {
    if (this.data.tuans.length > 0) this.load({ silent: true });
    this.loadBanner();   // banner 后台改动后刷新可见
  },

  loadBanner() {
    bannerService.getHomeBanner()
      .then((banner) => banner && this.setData({ banner }))
      .catch((err) => console.warn('[index] banner load', err));
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
