// pages/tuan-detail/index.js
const tuanService = require('../../services/tuan.js');
const { short } = require('../../utils/date.js');
const config = require('../../config/index.js');
const { groupProducts, filterProducts } = require('../../utils/groupProducts.js');

Page({
  data: {
    tuanId: '',
    tuan: null,
    products: [],             // 原始商品列表
    loading: true,
    startAtText: '',
    endAtText: '',

    // ── 团公告弹窗 ──
    announcementOpen: false,

    // ── 分组 ──
    groups: [],                // [{section, products, minSort}]
    hasAnySection: false,      // false → 退化单列,不显示 sidebar
    activeSection: '',         // 当前 sidebar 选中的分组名
    activeGroupProducts: [],   // 当前分组下的商品(过滤后的结果)

    // ── 搜索 ──
    searchKeyword: '',
    searchResults: [],
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
        const list = products || [];
        const { groups, hasAnySection } = groupProducts(list);
        const firstSection = (groups[0] && groups[0].section) || '';
        const hasAnnouncement = !!(tuan && tuan.announcement && tuan.announcement.trim());
        this.setData({
          tuan,
          products: list,
          groups,
          hasAnySection,
          activeSection: firstSection,
          activeGroupProducts: (groups[0] && groups[0].products) || [],
          loading: false,
          startAtText: tuan.startAt ? short(tuan.startAt) : '',
          endAtText: tuan.endAt ? short(tuan.endAt) : '',
          // 公告弹窗:进入团详情时展示;每个 page 实例只弹一次
          announcementOpen: hasAnnouncement && !this._announcementShown,
        });
        if (hasAnnouncement) this._announcementShown = true;
        wx.setNavigationBarTitle({ title: tuan.title || '团详情' });
      })
      .catch((err) => {
        this.setData({ loading: false, tuan: null });
        console.error('[tuan-detail] load', err);
      });
  },

  // ── 搜索 ──
  onSearchChange(e) {
    const kw = e.detail.value || '';
    this.setData({
      searchKeyword: kw,
      searchResults: kw ? filterProducts(this.data.products, kw) : [],
    });
  },
  onSearchClear() {
    this.setData({ searchKeyword: '', searchResults: [] });
  },

  // ── sidebar 点击 ── 切换分组(过滤右侧商品)
  onSectionTap(e) {
    const section = e.currentTarget.dataset.section;
    const g = this.data.groups.find((x) => x.section === section);
    this.setData({
      activeSection: section,
      activeGroupProducts: (g && g.products) || [],
    });
  },

  // ── 团公告 ──
  onCloseAnnouncement() {
    this.setData({ announcementOpen: false });
  },
  onShowAnnouncement() {
    if (this.data.tuan && this.data.tuan.announcement) {
      this.setData({ announcementOpen: true });
    }
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
