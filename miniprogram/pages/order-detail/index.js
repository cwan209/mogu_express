// pages/order-detail/index.js
const orderService = require('../../services/order.js');
const { fromCents } = require('../../utils/money.js');
const { short } = require('../../utils/date.js');

const STATUS_LABEL = {
  pending_pay: '待支付',
  paid: '已支付',
  shipped: '已发货',
  completed: '已完成',
  cancelled: '已取消',
  refunded: '已退款',
};

Page({
  data: {
    orderId: '',
    order: null,
    amountText: '0.00',
    createdAtText: '',
    paidAtText: '',
    priceMap: {},
    statusLabel: STATUS_LABEL,
    loading: true,
  },

  onLoad(options) {
    const id = options && options.id;
    if (!id) return;
    this.setData({ orderId: id });
    this.load();
  },

  load() {
    return orderService
      .getOrderDetail(this.data.orderId)
      .then((order) => {
        const priceMap = {};
        for (const it of order.items) priceMap[it.productId] = fromCents(it.price);
        this.setData({
          order,
          amountText: fromCents(order.amount),
          createdAtText: short(order.createdAt),
          paidAtText: order.paidAt ? short(order.paidAt) : '',
          priceMap,
          loading: false,
        });
      })
      .catch(() => this.setData({ loading: false, order: null }));
  },

  onCancel() {
    wx.showModal({
      title: '确认取消',
      content: '取消后库存将恢复,确定取消此订单?',
      success: (r) => {
        if (!r.confirm) return;
        orderService.cancelOrder(this.data.orderId).then(() => {
          wx.showToast({ title: '已取消', icon: 'success' });
          this.load();
        }).catch((err) => {
          wx.showToast({ title: err.message || '取消失败', icon: 'none' });
        });
      },
    });
  },
});
