// pages/cart/index.js
const cartService = require('../../services/cart.js');
const { fromCents } = require('../../utils/money.js');

Page({
  data: {
    items: [],
    selected: {},           // { productId: boolean }
    priceMap: {},           // { productId: "19.99" }
    maxQtyMap: {},          // { productId: stockLeft + currentQty }
    selectedCount: 0,
    totalText: '0.00',
    allSelected: false,
  },

  onShow() { this.load(); },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh());
  },

  load() {
    return cartService.getCart().then(({ items }) => {
      const priceMap = {};
      const maxQtyMap = {};
      const selected = { ...this.data.selected };
      for (const it of items) {
        priceMap[it.productId]  = fromCents(it.product.price);
        const stockLeft = (it.product.stock || 0) - (it.product.sold || 0);
        maxQtyMap[it.productId] = stockLeft + it.quantity; // 包含已加入的
        // 新入项默认选中(如果可用)
        if (selected[it.productId] === undefined) {
          selected[it.productId] = it.available;
        }
        // 失效项强制不选
        if (!it.available) selected[it.productId] = false;
      }
      this.setData({ items, priceMap, maxQtyMap, selected }, () => this.recalc());
    });
  },

  recalc() {
    const { items, selected } = this.data;
    let count = 0;
    let total = 0;
    for (const it of items) {
      if (selected[it.productId] && it.available) {
        count += 1;
        total += it.product.price * it.quantity;
      }
    }
    const eligible = items.filter((x) => x.available);
    const allSelected = eligible.length > 0 && eligible.every((x) => selected[x.productId]);
    this.setData({
      selectedCount: count,
      totalText: fromCents(total),
      allSelected,
    });
  },

  onToggleRow(e) {
    const id = e.currentTarget.dataset.id;
    const selected = { ...this.data.selected };
    selected[id] = !selected[id];
    this.setData({ selected }, () => this.recalc());
  },

  onToggleAll() {
    const want = !this.data.allSelected;
    const selected = { ...this.data.selected };
    for (const it of this.data.items) {
      if (it.available) selected[it.productId] = want;
    }
    this.setData({ selected }, () => this.recalc());
  },

  onQtyChange(e) {
    const id = e.currentTarget.dataset.id;
    const val = e.detail.value;
    cartService.upsertCart({ productId: id, quantity: val }).then(() => this.load());
  },

  onRemoveSelected() {
    const ids = Object.keys(this.data.selected).filter((k) => this.data.selected[k]);
    console.log('[cart] remove selected:', ids);
    if (!ids.length) {
      wx.showToast({ title: '请先勾选要删除的商品', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '确认删除',
      content: `将删除 ${ids.length} 件商品`,
      success: (r) => {
        if (!r.confirm) return;
        Promise.all(ids.map((id) => cartService.upsertCart({ productId: id, quantity: 0 })))
          .then(() => {
            const selected = { ...this.data.selected };
            ids.forEach((id) => delete selected[id]);
            this.setData({ selected });
            this.load();
            wx.showToast({ title: '已删除', icon: 'success' });
          })
          .catch((err) => {
            console.error('[cart] remove failed', err);
            wx.showToast({ title: '删除失败', icon: 'none' });
          });
      },
    });
  },

  onTapProduct(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/product-detail/index?id=${id}` });
  },

  onCheckout() {
    const picked = this.data.items
      .filter((it) => it.available && this.data.selected[it.productId]);
    console.log('[cart] checkout picked=', picked.length, 'selected=', this.data.selected);
    if (!picked.length) {
      wx.showToast({ title: '请先勾选商品', icon: 'none' });
      return;
    }
    // 经 URL 传 productId:quantity 在 wx.navigateTo 里冒号会被 URL 规范吃掉
    // 改为缓存到 globalData,订单确认页从 app 拿
    getApp().globalData.checkoutItems = picked.map((it) => ({
      productId: it.productId,
      quantity: it.quantity,
    }));
    wx.navigateTo({ url: '/pages/order-confirm/index' });
  },

  onGoHome() {
    wx.switchTab({ url: '/pages/index/index' });
  },
});
