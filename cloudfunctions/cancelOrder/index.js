// cancelOrder - 仅 pending_pay 可取消,事务回滚 sold
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { code: 401, message: 'not logged in' };
  const { orderId } = event || {};
  if (!orderId) return { code: 1, message: 'orderId required' };

  try {
    await db.runTransaction(async (transaction) => {
      const oDoc = await transaction.collection('orders').doc(orderId).get();
      const order = oDoc.data;
      if (!order) throw { code: 2, message: 'order not found' };
      if (order._openid !== OPENID) throw { code: 403, message: 'forbidden' };
      if (order.status !== 'pending_pay') throw { code: 3, message: '仅待支付订单可取消' };

      for (const it of order.items) {
        await transaction.collection('products').doc(it.productId).update({
          data: { sold: _.inc(-it.quantity), updatedAt: new Date() },
        });
      }

      await transaction.collection('orders').doc(orderId).update({
        data: {
          status: 'cancelled',
          payStatus: 'failed',
          updatedAt: new Date(),
        },
      });
    });
    return { code: 0 };
  } catch (err) {
    return { code: err.code || 500, message: err.message || 'error' };
  }
};
