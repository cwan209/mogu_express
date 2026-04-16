// getProfile - 取当前用户的姓名/电话/默认地址 ID
// 订单确认页用来检测"是否已完善资料"
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async () => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { code: 401, message: 'not logged in' };

  const res = await db.collection('users').where({ _openid: OPENID }).limit(1).get();
  const u = (res.data && res.data[0]) || {};
  return {
    code: 0,
    name: u.name || '',
    phone: u.phone || '',
    defaultAddressId: u.defaultAddressId || null,
    registeredAt: u.registeredAt || null,
  };
};
