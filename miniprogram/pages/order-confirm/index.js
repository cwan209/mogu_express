// pages/order-confirm/index.js
const cartService = require('../../services/cart.js');
const orderService = require('../../services/order.js');
const addressService = require('../../services/address.js');
const userService = require('../../services/user.js');
const { fromCents } = require('../../utils/money.js');

Page({
  data: {
    items: [],            // [{ productId, quantity, product, tuan, ... }]
    priceMap: {},
    totalText: '0.00',
    address: null,
    userReady: false,
    remark: '',
    ready: false,
    submitting: false,
  },

  onLoad() {
    this.load();
  },

  onShow() {
    // 从地址页返回,可能变化
    if (this.data.ready) this.loadAddress();
    if (this.data.ready) this.loadUser();
  },

  async load() {
    try {
      // 从 globalData 拿购物车勾选项(URL 参数带冒号在小程序里会丢)
      const picked = getApp().globalData.checkoutItems || [];
      console.log('[order-confirm] picked from globalData:', picked);

      if (!picked.length) {
        wx.showToast({ title: '未选中商品,请返回购物车', icon: 'none' });
        return;
      }

      const { items: allCart } = await cartService.getCart();
      const map = new Map(allCart.map((x) => [x.productId, x]));
      const items = [];
      const priceMap = {};
      let total = 0;
      for (const p of picked) {
        const it = map.get(p.productId);
        if (!it) continue;
        items.push({ ...it, quantity: p.quantity });
        priceMap[p.productId] = fromCents(it.product.price);
        total += it.product.price * p.quantity;
      }

      await Promise.all([this.loadAddress(), this.loadUser()]);

      this.setData({
        items,
        priceMap,
        totalText: fromCents(total),
        ready: true,
      });
    } catch (err) {
      console.error('[order-confirm] load', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  async loadAddress() {
    const list = await addressService.listAddresses();
    const address = list.find((a) => a.isDefault) || list[0] || null;
    this.setData({ address });
  },

  async loadUser() {
    const p = await userService.getProfile();
    this.setData({ userReady: !!(p.name && p.phone) });
  },

  onPickAddress() {
    wx.navigateTo({ url: '/pages/address-edit/index?mode=pick' });
  },

  onGoRegister() {
    wx.navigateTo({ url: '/pages/register/index' });
  },

  onRemarkChange(e) {
    this.setData({ remark: e.detail.value });
  },

  async onSubmit() {
    if (this.data.submitting) return;
    if (!this.data.address) { wx.showToast({ title: '请选择地址', icon: 'none' }); return; }
    if (!this.data.userReady) { wx.showToast({ title: '请完善姓名和电话', icon: 'none' }); return; }

    this.setData({ submitting: true });
    try {
      wx.showLoading({ title: '下单中...', mask: true });
      const resp = await orderService.createOrder({
        items: this.data.items.map((it) => ({
          tuanItemId: it.tuanItemId || it.productId,   // 新模型用 tuanItemId
          quantity: it.quantity,
        })),
        addressId: this.data.address._id,
        remark: this.data.remark,
        requirePay: true,    // M3 默认走支付
      });
      wx.hideLoading();

      // 兼容两种返回形式:
      //   新:{ code, order, payParams }
      //   旧(纯 mock):直接 order 对象(不带 payParams,视作不需支付)
      const order = resp.order || resp;
      const payParams = resp.payParams || null;
      const orderId = order._id;

      if (!payParams) {
        // 免支付 或 pay_status 已经是 paid:直接跳结果页
        wx.redirectTo({ url: '/pages/pay-result/index?orderId=' + orderId });
        return;
      }

      // 需要支付
      if (payParams.__stub) {
        // Stub 模式:跳结果页,结果页里按钮"模拟支付成功"
        wx.redirectTo({
          url: '/pages/pay-result/index?orderId=' + orderId + '&mode=stub',
        });
        return;
      }

      // 真实支付:调 wx.requestPayment
      wx.requestPayment({
        ...payParams,
        success: () => {
          wx.redirectTo({ url: '/pages/pay-result/index?orderId=' + orderId });
        },
        fail: () => {
          // 用户取消或失败 → 仍跳结果页,结果页按 query 订单状态展示
          wx.redirectTo({
            url: '/pages/pay-result/index?orderId=' + orderId + '&failed=1',
          });
        },
      });
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: err.message || '下单失败', icon: 'none' });
      this.setData({ submitting: false });
    }
  },
});
