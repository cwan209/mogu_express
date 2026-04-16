// pages/register/index.js
const userService = require('../../services/user.js');

Page({
  data: {
    form: { name: '', phone: '' },
    saving: false,
  },

  onLoad() {
    userService.getProfile().then((p) => {
      this.setData({ form: { name: p.name || '', phone: p.phone || '' } });
    });
  },

  onField(e) {
    const k = e.currentTarget.dataset.k;
    this.setData({ [`form.${k}`]: e.detail.value });
  },

  async onSave() {
    const { name, phone } = this.data.form;
    if (!name || !phone) {
      wx.showToast({ title: '请填姓名和电话', icon: 'none' });
      return;
    }
    if (phone.length < 6) {
      wx.showToast({ title: '电话格式不对', icon: 'none' });
      return;
    }
    this.setData({ saving: true });
    try {
      await userService.saveProfile({ name, phone });
      // 更新 app 全局
      const app = getApp();
      app.globalData.isRegistered = true;
      app.globalData.userInfo = { name, phone };
      wx.showToast({ title: '已保存', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 500);
    } catch (err) {
      wx.showToast({ title: err.message || '保存失败', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  },
});
