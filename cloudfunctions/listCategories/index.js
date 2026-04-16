// listCategories - 活跃分类按 sort 升序
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async () => {
  const res = await db
    .collection('categories')
    .where({ isActive: true })
    .orderBy('sort', 'asc')
    .limit(100)
    .get();
  return { code: 0, items: res.data };
};
