// registerProfile - 完善用户资料(群号)
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { code: 401, message: 'not logged in' };
  const { groupId } = event || {};
  if (!groupId || typeof groupId !== 'string' || !groupId.trim()) {
    return { code: 1, message: 'groupId required' };
  }
  const trimmed = groupId.trim().slice(0, 30);

  const now = new Date();
  const col = db.collection('users');
  const existing = await col.where({ _openid: OPENID }).limit(1).get();
  if (existing.data && existing.data.length) {
    await col.doc(existing.data[0]._id).update({
      data: { groupId: trimmed, registeredAt: existing.data[0].registeredAt || now, updatedAt: now },
    });
  } else {
    await col.add({
      data: { _openid: OPENID, groupId: trimmed, registeredAt: now, createdAt: now, updatedAt: now },
    });
  }
  return { code: 0, groupId: trimmed };
};
