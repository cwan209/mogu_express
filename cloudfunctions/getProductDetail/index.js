// getProductDetail - 商品详情 + 所属团 + 最近参与者(脱敏)
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const MAX_PARTICIPANTS = 12;

exports.main = async (event) => {
  const { productId } = event || {};
  if (!productId) return { code: 1, message: 'productId required' };

  const prodRes = await db.collection('products').doc(productId).get().catch(() => null);
  if (!prodRes || !prodRes.data) return { code: 2, message: 'product not found' };
  const product = prodRes.data;

  // 所属团
  let tuan = null;
  if (product.tuanId) {
    const tuanRes = await db.collection('tuans').doc(product.tuanId).get().catch(() => null);
    if (tuanRes && tuanRes.data) tuan = tuanRes.data;
  }

  // 参与者(从 participant_index 集合拿,M3 由 payCallback 写入)
  let participants = [];
  try {
    const pRes = await db
      .collection('participant_index')
      .where({ productId })
      .orderBy('paidAt', 'desc')
      .limit(MAX_PARTICIPANTS)
      .get();
    participants = (pRes.data || []).map((p) => ({
      id: p._id,
      nickName: p.nickName || '顾客',
      avatar: p.avatar || '',
      quantity: p.quantity || 1,
      paidAt: p.paidAt,
    }));
  } catch (err) {
    // participant_index 集合尚未创建
    console.warn('[getProductDetail] participant_index not available', err.message);
  }

  return { code: 0, product, tuan, participants };
};
