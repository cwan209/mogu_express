// components/product-card/index.js
const { fromCents } = require('../../utils/money.js');

Component({
  properties: {
    product:   { type: Object, value: null },
    available: { type: Boolean, value: true }, // 所属团是否在售
  },
  data: {
    priceText: '',
    stockLeft: 0,
  },
  observers: {
    product(p) {
      if (!p) return;
      this.setData({
        priceText: fromCents(p.price || 0),
        stockLeft: Math.max(0, (p.stock || 0) - (p.sold || 0)),
      });
    },
  },
  methods: {
    onTap() {
      if (!this.properties.product) return;
      wx.navigateTo({
        url: '/pages/product-detail/index?id=' + this.properties.product._id,
      });
    },
  },
});
