// pages/tuan-detail/index.js
const tuanService = require('../../services/tuan.js');
const { short } = require('../../utils/date.js');
const config = require('../../config/index.js');

Page({
  data: {
    tuanId: '',
    tuan: null,
    products: [],
    loading: true,
    startAtText: '',
    endAtText: '',
  },

  onLoad(options) {
    const id = options && options.id;
    if (!id) {
      wx.showToast({ title: '缺少团 ID', icon: 'none' });
      return;
    }
    this.setData({ tuanId: id });
    this.load();
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh());
  },

  load() {
    this.setData({ loading: true });
    return tuanService
      .getTuanDetail(this.data.tuanId)
      .then(({ tuan, products }) => {
        this.setData({
          tuan,
          products: products || [],
          loading: false,
          startAtText: tuan.startAt ? short(tuan.startAt) : '',
          endAtText: tuan.endAt ? short(tuan.endAt) : '',
        });
        wx.setNavigationBarTitle({ title: tuan.title || '团详情' });
      })
      .catch((err) => {
        this.setData({ loading: false, tuan: null });
        console.error('[tuan-detail] load', err);
      });
  },

  onPoster() {
    wx.navigateTo({
      url: `/pages/poster/index?type=tuan&id=${this.data.tuanId}`,
    });
  },

  onShareAppMessage() {
    const t = this.data.tuan;
    return {
      title: t ? t.title : config.shareTitle,
      path: `/pages/tuan-detail/index?id=${this.data.tuanId}`,
      imageUrl: t ? t.coverFileId : undefined,
    };
  },

  onShareTimeline() {
    const t = this.data.tuan;
    return {
      title: t ? t.title : config.shareTitle,
      query: `id=${this.data.tuanId}`,
      imageUrl: t ? t.coverFileId : undefined,
    };
  },
});
