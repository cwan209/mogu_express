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

    // ── 分组 ──
    groups: [],               // [{section, products, minSort}]
    hasAnySection: false,     // false → 退化单列,不显示 sidebar
    activeSection: '',        // 当前 sidebar 高亮的分组名
    scrollIntoView: '',       // 控制右栏 scroll-into-view

    // ── 搜索 ──
    searchKeyword: '',
    searchResults: [],        // 搜索激活时的一维数组
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
        const activeSection = (groups[0] && groups[0].section) || '';
        this.setData({
          tuan,
          products: list,
          groups,
          hasAnySection,
          activeSection,
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

  // ── sidebar 点击跳转 ──
  onSectionTap(e) {
    const section = e.currentTarget.dataset.section;
    this.setData({
      activeSection: section,
      scrollIntoView: 'section-' + this.anchorId(section),
    });
  },

  // 把中文 section 转成 ASCII 安全的 id(scroll-into-view 要求)
  anchorId(section) {
    const idx = this.data.groups.findIndex((g) => g.section === section);
    return 'g' + (idx >= 0 ? idx : 0);
  },

  // 右栏滚动时反写高亮(节流)
  onProductsScroll(e) {
    if (this._scrollLock) return;
    this._scrollLock = setTimeout(() => { this._scrollLock = null; }, 100);
    const scrollTop = e.detail.scrollTop;
    // 查找 anchor
    const query = wx.createSelectorQuery().in(this);
    query.selectAll('.section-anchor').boundingClientRect();
    query.selectViewport().scrollOffset();
    query.exec((res) => {
      if (!res || !res[0]) return;
      const anchors = res[0];
      let best = anchors[0];
      for (const a of anchors) {
        if (a.top - 100 <= 0) best = a;       // 100 是顶部搜索栏+偏移
        else break;
      }
      if (!best) return;
      const idx = Number((best.id || 'g0').replace('g', '')) || 0;
      const g = this.data.groups[idx];
      if (g && g.section !== this.data.activeSection) {
        this.setData({ activeSection: g.section });
      }
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
