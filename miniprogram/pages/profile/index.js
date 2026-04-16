// pages/profile/index.js
const app = getApp();

Page({
  data: {
    isRegistered: false,
    isAdmin: false,
    userName: '',
  },

  onShow() {
    app
      .ensureLogin()
      .then((res) => {
        this.setData({
          isRegistered: !!res.isRegistered,
          isAdmin: !!res.isAdmin,
          userName: (res.userInfo && res.userInfo.name) || '',
        });
      })
      .catch((err) => {
        console.error('[profile] login failed', err);
      });
  },

  onGoCart()   { wx.switchTab({ url: '/pages/cart/index' }); },
  onGoOrders() { wx.switchTab({ url: '/pages/orders/index' }); },
});
