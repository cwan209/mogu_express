// pages/address-edit/index.js
// 模式:
//   无参数 → list 模式
//   mode=pick → list 模式(选中地址后返回上一页并传参)
//   id=xxx → 编辑模式
//   new → 新增模式
const addressService = require('../../services/address.js');
const { CN_PROVINCES, validate, normalize } = require('../../utils/addressValidate.js');

const FIELD_LABEL = {
  recipient: '收件人',
  phone: '手机号',
  line1: '详细地址',
  line2: '门牌/单元',
  suburb: '市/区',
  state: '省',
  postcode: '邮编',
};

Page({
  data: {
    screen: 'list',
    addresses: [],
    pickMode: false,
    form: null,

    // 校验错误 {field: message}
    errors: {},
    // 省 picker 候选
    stateOptions: CN_PROVINCES,
    stateIndex: 0,
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
    const state = data.state || CN_PROVINCES[0];
    const stateIndex = Math.max(0, CN_PROVINCES.indexOf(state));
    this.setData({
      screen: 'form',
      errors: {},
      stateIndex,
      form: {
        _id: data._id || '',
        recipient: data.recipient || '',
        phone: data.phone || '',
        line1: data.line1 || '',
        line2: data.line2 || '',
        suburb: data.suburb || '',
        state,
        postcode: data.postcode || '',
        isDefault: !!data.isDefault,
      },
    });
    wx.setNavigationBarTitle({ title: data._id ? '编辑地址' : '新增地址' });
  },

  onField(e) {
    const k = e.currentTarget.dataset.k;
    this.setData({ [`form.${k}`]: e.detail.value });
    // 输入时清当前字段的错误,提示消失
    if (this.data.errors[k]) {
      this.setData({ [`errors.${k}`]: '' });
    }
  },

  // state 用 picker
  onStateChange(e) {
    const idx = Number(e.detail.value);
    this.setData({
      stateIndex: idx,
      'form.state': CN_PROVINCES[idx],
      'errors.state': '',
    });
  },

  // 单字段失焦校验(提升 UX)
  onFieldBlur(e) {
    const k = e.currentTarget.dataset.k;
    const err = validate(this.data.form);
    if (err && err.field === k) {
      this.setData({ [`errors.${k}`]: err.message });
    }
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
      const one = this.data.addresses.find((x) => x._id === id);
      if (one) prev.setData({ address: one });
    }
    wx.navigateBack();
  },

  async onSave() {
    const err = validate(this.data.form);
    if (err) {
      this.setData({ [`errors.${err.field}`]: err.message });
      wx.showToast({
        title: `${FIELD_LABEL[err.field] || ''}:${err.message}`,
        icon: 'none',
        duration: 2500,
      });
      return;
    }

    const cleanForm = normalize(this.data.form);
    try {
      wx.showLoading({ title: '保存中...' });
      await addressService.upsertAddress(cleanForm);
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
