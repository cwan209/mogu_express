const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async () => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { code: 401, message: 'not logged in' };
  const res = await db
    .collection('addresses')
    .where({ _openid: OPENID })
    .orderBy('isDefault', 'desc')
    .orderBy('createdAt', 'desc')
    .limit(20)
    .get();
  return { code: 0, items: res.data };
};
