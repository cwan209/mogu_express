// components/tuan-card/index.js
Component({
  properties: {
    tuan: { type: Object, value: null },
  },
  methods: {
    onTap() {
      if (!this.properties.tuan) return;
      wx.navigateTo({
        url: '/pages/tuan-detail/index?id=' + this.properties.tuan._id,
      });
    },
  },
});
