// registerProfile - 完善用户资料(姓名/电话)
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { code: 401, message: 'not logged in' };
  const { name, phone } = event || {};
  if (!name || !phone) return { code: 1, message: 'name/phone required' };

  const now = new Date();
  const col = db.collection('users');
  const existing = await col.where({ _openid: OPENID }).limit(1).get();
  if (existing.data && existing.data.length) {
    await col.doc(existing.data[0]._id).update({
      data: { name, phone, registeredAt: existing.data[0].registeredAt || now, updatedAt: now },
    });
  } else {
    await col.add({
      data: { _openid: OPENID, name, phone, registeredAt: now, createdAt: now, updatedAt: now },
    });
  }
  return { code: 0, user: { name, phone } };
};
