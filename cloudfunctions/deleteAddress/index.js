const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { code: 401, message: 'not logged in' };
  const { id } = event || {};
  if (!id) return { code: 1, message: 'id required' };

  const cur = await db.collection('addresses').doc(id).get().catch(() => null);
  if (!cur || !cur.data || cur.data._openid !== OPENID) return { code: 403, message: 'forbidden' };

  const wasDefault = cur.data.isDefault;
  await db.collection('addresses').doc(id).remove();

  if (wasDefault) {
    // 把最近一条设为默认
    const others = await db.collection('addresses')
      .where({ _openid: OPENID })
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();
    if (others.data && others.data.length) {
      await db.collection('addresses').doc(others.data[0]._id).update({ data: { isDefault: true } });
    }
  }

  return { code: 0 };
};
