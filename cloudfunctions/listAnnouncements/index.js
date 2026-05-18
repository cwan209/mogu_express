// listAnnouncements - 公开 cf,返 active=true 的 banner 列表,按 sortOrder asc
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async () => {
  try {
    const res = await db.collection('announcements')
      .where({ active: true })
      .orderBy('sortOrder', 'asc')
      .limit(20)
      .get();
    return { code: 0, items: res.data || [] };
  } catch (err) {
    return { code: err.code || 500, message: err.message || 'error' };
  }
};
