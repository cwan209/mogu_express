// pages/product-detail/index.js
const productService = require('../../services/product.js');
const cartService = require('../../services/cart.js');
const { fromCents } = require('../../utils/money.js');

Page({
  data: {
    productId: '',
    product: null,
    tuan: null,
    participants: [],
    loading: true,
    priceText: '0.00',
    stockLeft: 0,
    available: false,
    images: [],
  },

  onLoad(options) {
    const id = options && options.id;
    if (!id) {
      wx.showToast({ title: '缺少商品 ID', icon: 'none' });
      return;
    }
    this.setData({ productId: id });
    this.load();
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh());
  },

  load() {
    this.setData({ loading: true });
    return productService
      .getProductDetail(this.data.productId)
      .then(({ product, tuan, participants }) => {
        const images = [product.coverFileId, ...(product.imageFileIds || [])].filter(Boolean);
        this.setData({
          product,
          tuan: tuan || null,
          participants: participants || [],
          priceText: fromCents(product.price || 0),
          stockLeft: Math.max(0, (product.stock || 0) - (product.sold || 0)),
          available: tuan && tuan.status === 'on_sale',
          images,
          loading: false,
        });
        wx.setNavigationBarTitle({ title: product.title || '商品详情' });
      })
      .catch((err) => {
        this.setData({ loading: false, product: null });
        console.error('[product-detail] load', err);
      });
  },

  onTapTuan() {
    if (!this.data.tuan) return;
    wx.navigateTo({ url: '/pages/tuan-detail/index?id=' + this.data.tuan._id });
  },

  async onAddCart() {
    if (!this.data.available || this.data.stockLeft <= 0) return;
    try {
      // 查当前购物车里该商品的数量,加 1
      const { items } = await cartService.getCart();
      const existing = items.find((x) => x.productId === this.data.productId);
      const newQty = (existing ? existing.quantity : 0) + 1;
      if (newQty > this.data.stockLeft + (existing ? existing.quantity : 0)) {
        wx.showToast({ title: '库存不足', icon: 'none' });
        return;
      }
      await cartService.upsertCart({ productId: this.data.productId, quantity: newQty });
      wx.showToast({ title: '已加入购物车', icon: 'success' });
      // 加购后回到所属团详情(若返回栈里就是团详情则 navigateBack,否则 redirectTo)
      setTimeout(() => {
        const pages = getCurrentPages();
        const prev = pages[pages.length - 2];
        const tuanId = this.data.tuan && this.data.tuan._id;
        if (prev && prev.route === 'pages/tuan-detail/index') {
          wx.navigateBack();
        } else if (tuanId) {
          wx.redirectTo({ url: '/pages/tuan-detail/index?id=' + tuanId });
        }
      }, 600);
    } catch (err) {
      wx.showToast({ title: err.message || '加入失败', icon: 'none' });
    }
  },

  onPoster() {
    wx.navigateTo({
      url: `/pages/poster/index?type=product&id=${this.data.productId}`,
    });
  },

  onShareAppMessage() {
    const p = this.data.product;
    return {
      title: p ? p.title : '接龙团购',
      path: `/pages/product-detail/index?id=${this.data.productId}`,
      imageUrl: p ? p.coverFileId : undefined,
    };
  },

  onShareTimeline() {
    const p = this.data.product;
    return {
      title: p ? p.title : '接龙团购',
      query: `id=${this.data.productId}`,
      imageUrl: p ? p.coverFileId : undefined,
    };
  },
});
