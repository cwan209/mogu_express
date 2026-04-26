// requestRefund - 用户申请退款(paid → refund_requested)
// 前提:
//   1. 订单属于当前用户
//   2. order.status === 'paid'(未发货)
//   3. 订单所属团 status === 'on_sale'(团还在进行)
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { code: 401, message: 'not logged in' };
  const { orderId } = event || {};
  if (!orderId) return { code: 1, message: 'orderId required' };

  try {
    // 取订单(doc.get 找不到时 shim 会 throw,用 catch 转为 null)
    const oDoc = await db.collection('orders').doc(orderId).get().catch(() => null);
    const order = oDoc && oDoc.data;
    if (!order) return { code: 2, message: '订单不存在' };

    // 越权检查
    if (order._openid !== OPENID) return { code: 403, message: '无权操作' };

    // 状态检查:仅 paid(未发货)可申请
    if (order.status !== 'paid') return { code: 3, message: '仅已支付未发货订单可申请退款' };

    // 检查所属团是否还在进行
    const tuanId = order.items && order.items[0] && order.items[0].tuanId;
    if (!tuanId) return { code: 4, message: '订单数据异常' };
    const tDoc = await db.collection('tuans').doc(tuanId).get().catch(() => null);
    const tuan = tDoc && tDoc.data;
    if (!tuan || tuan.status !== 'on_sale') {
      return { code: 5, message: '团购已结束，无法申请退款' };
    }

    // 更新状态
    await db.collection('orders').doc(orderId).update({
      data: {
        status: 'refund_requested',
        refundRequestedAt: new Date(),
        updatedAt: new Date(),
      },
    });

    return { code: 0 };
  } catch (err) {
    return { code: err.code || 500, message: err.message || 'error' };
  }
};
