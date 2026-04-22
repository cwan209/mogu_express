// getProductDetail - 商品详情
//
// 入参优先级:
//   tuanItemId  —— 推荐。返回商品在特定团里的实例(含团内 price/stock/section + 所属团 + 参与者)
//   productId   —— catalog 模式。只返回商品库信息,不含价格/库存
//
// 返回:
//   product     —— 商品库字段 + (若给了 tuanItemId)团内字段合并
//   tuan        —— tuanItemId 模式才有
//   participants—— tuanItemId 模式才有,按 tuan_item 粒度拿参与者

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const MAX_PARTICIPANTS = 12;

exports.main = async (event) => {
  let { tuanItemId, productId } = event || {};

  // 如果传了 tuanItemId,载入 tuan_item 拿 productId
  let tuanItem = null;
  if (tuanItemId) {
    const tiRes = await db.collection('tuan_items').doc(tuanItemId).get().catch(() => null);
    if (!tiRes || !tiRes.data) return { code: 2, message: 'tuan_item not found' };
    tuanItem = tiRes.data;
    productId = tuanItem.productId;
  }
  if (!productId) return { code: 1, message: 'tuanItemId or productId required' };

  const prodRes = await db.collection('products').doc(productId).get().catch(() => null);
  if (!prodRes || !prodRes.data) return { code: 2, message: 'product not found' };
  const catalog = prodRes.data;

  let tuan = null;
  let participants = [];
  let product = { ...catalog };

  if (tuanItem) {
    product = {
      ...catalog,
      _id: tuanItem._id,                 // 小程序历史以 product._id 作为主键,这里合成
      tuanItemId: tuanItem._id,
      productId: catalog._id,
      tuanId: tuanItem.tuanId,
      price: tuanItem.price,
      stock: tuanItem.stock,
      sold: tuanItem.sold || 0,
      sort: tuanItem.sort,
      section: tuanItem.section || null,
      participantCount: tuanItem.participantCount || 0,
    };
    const tRes = await db.collection('tuans').doc(tuanItem.tuanId).get().catch(() => null);
    if (tRes && tRes.data) tuan = tRes.data;

    // 参与者索引按 tuan_item 粒度(payCallback 写入时传 tuanItemId)
    try {
      const pRes = await db
        .collection('participant_index')
        .where({ tuanItemId: tuanItem._id })
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
      console.warn('[getProductDetail] participant_index unavailable', err.message);
    }
  }

  return { code: 0, product, tuan, participants };
};
