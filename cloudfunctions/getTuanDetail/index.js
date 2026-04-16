// getTuanDetail - 团详情 + 团内商品
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const { tuanId } = event || {};
  if (!tuanId) return { code: 1, message: 'tuanId required' };

  const tuanRes = await db.collection('tuans').doc(tuanId).get().catch(() => null);
  if (!tuanRes || !tuanRes.data) return { code: 2, message: 'tuan not found' };
  const tuan = tuanRes.data;

  const prodRes = await db
    .collection('products')
    .where({ tuanId })
    .orderBy('sort', 'asc')
    .limit(100)
    .get();

  return {
    code: 0,
    tuan,
    products: prodRes.data,
  };
};
