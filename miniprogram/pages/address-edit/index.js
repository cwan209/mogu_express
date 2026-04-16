// pages/address-edit/index.js
// 模式:
//   无参数 → list 模式
//   mode=pick → list 模式(选中地址后返回上一页并传参)
//   id=xxx → 编辑模式
//   new → 新增模式
const addressService = require('../../services/address.js');

Page({
  data: {
    screen: 'list',           // list | form
    addresses: [],
    pickMode: false,
    form: null,
  },

  onLoad(options) {
    const { mode, id } = options || {};
    this.setData({ pickMode: mode === 'pick' });
    if (id) {
      this.loadOne(id);
    } else if (options && options.new !== undefined) {
      this.enterForm({});
    } else {
      this.loadList();
    }
  },

  onShow() {
    if (this.data.screen === 'list') this.loadList();
  },

  loadList() {
    return addressService.listAddresses().then((addresses) => {
      this.setData({ addresses, screen: 'list' });
    });
  },

  async loadOne(id) {
    const list = await addressService.listAddresses();
    const one = list.find((x) => x._id === id);
    this.enterForm(one || {});
  },

  enterForm(data) {
    this.setData({
      screen: 'form',
      form: {
        _id: data._id || '',
        recipient: data.recipient || '',
        phone: data.phone || '',
        line1: data.line1 || '',
        line2: data.line2 || '',
        suburb: data.suburb || '',
        state: data.state || 'VIC',
        postcode: data.postcode || '',
        isDefault: !!data.isDefault,
      },
    });
    wx.setNavigationBarTitle({ title: data._id ? '编辑地址' : '新增地址' });
  },

  onField(e) {
    const k = e.currentTarget.dataset.k;
    this.setData({ [`form.${k}`]: e.detail.value });
  },
  onToggleDefault(e) {
    this.setData({ 'form.isDefault': e.detail.value });
  },

  onNew() { this.enterForm({}); },

  onEdit(e) {
    const id = e.currentTarget.dataset.id;
    const one = this.data.addresses.find((x) => x._id === id);
    this.enterForm(one || {});
  },

  onPickRow(e) {
    if (!this.data.pickMode) return;
    const id = e.currentTarget.dataset.id;
    const pages = getCurrentPages();
    const prev = pages[pages.length - 2];
    if (prev && prev.route && prev.route.indexOf('order-confirm') >= 0) {
      // 设置上一页的默认地址为选中地址
      const one = this.data.addresses.find((x) => x._id === id);
      if (one) prev.setData({ address: one });
    }
    wx.navigateBack();
  },

  async onSave() {
    const f = this.data.form;
    const missing = ['recipient', 'phone', 'line1', 'suburb', 'state', 'postcode'].filter((k) => !f[k]);
    if (missing.length) {
      wx.showToast({ title: '请填完必填项', icon: 'none' });
      return;
    }
    try {
      wx.showLoading({ title: '保存中...' });
      await addressService.upsertAddress(f);
      wx.hideLoading();
      wx.showToast({ title: '已保存', icon: 'success' });
      setTimeout(() => {
        if (this.data.pickMode) wx.navigateBack();
        else this.loadList();
      }, 500);
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: err.message || '保存失败', icon: 'none' });
    }
  },

  onDelete() {
    const id = this.data.form._id;
    wx.showModal({
      title: '确认删除',
      content: '删除此地址?',
      success: (r) => {
        if (!r.confirm) return;
        addressService.deleteAddress(id).then(() => {
          wx.showToast({ title: '已删除', icon: 'success' });
          setTimeout(() => this.loadList(), 300);
        });
      },
    });
  },
});
