const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { code: 401, message: 'not logged in' };
  const { orderId } = event || {};
  if (!orderId) return { code: 1, message: 'orderId required' };

  const res = await db.collection('orders').doc(orderId).get().catch(() => null);
  if (!res || !res.data) return { code: 2, message: 'not found' };
  if (res.data._openid !== OPENID) return { code: 403, message: 'forbidden' };

  return { code: 0, order: res.data };
};
