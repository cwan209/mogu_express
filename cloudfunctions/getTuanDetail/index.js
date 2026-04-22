// getTuanDetail - 团详情 + 团内商品实例(join products)
//
// 返回的 products 数组每条是"joined view":
//   _id         = tuan_item._id(历史上小程序以 _id 作为点击 → product-detail 的主键,
//                 现在改为 tuanItemId)
//   tuanItemId  = 同上(显式)
//   productId   = catalog product._id
//   tuanId
//   title/description/coverFileId/imageFileIds/categoryIds  ← 来自 product catalog
//   price/stock/sold/sort/section/participantCount           ← 来自 tuan_item
//
// 字段形状刻意跟旧 product 对齐,让小程序 tuan-detail / product-card 代码基本不用改。

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event) => {
  const { tuanId } = event || {};
  if (!tuanId) return { code: 1, message: 'tuanId required' };

  const tuanRes = await db.collection('tuans').doc(tuanId).get().catch(() => null);
  if (!tuanRes || !tuanRes.data) return { code: 2, message: 'tuan not found' };
  const tuan = tuanRes.data;

  const itemsRes = await db
    .collection('tuan_items')
    .where({ tuanId })
    .orderBy('sort', 'asc')
    .limit(200)
    .get();
  const items = itemsRes.data || [];

  let catalogMap = new Map();
  if (items.length) {
    const ids = items.map((i) => i.productId);
    const prodRes = await db.collection('products').where({ _id: _.in(ids) }).limit(200).get();
    for (const p of prodRes.data || []) catalogMap.set(p._id, p);
  }

  const joined = items.map((ti) => {
    const p = catalogMap.get(ti.productId) || {};
    return {
      _id: ti._id,
      tuanItemId: ti._id,
      productId: ti.productId,
      tuanId: ti.tuanId,
      title: p.title || '',
      description: p.description || '',
      coverFileId: p.coverFileId || '',
      imageFileIds: p.imageFileIds || [],
      categoryIds: p.categoryIds || [],
      price: ti.price,
      stock: ti.stock,
      sold: ti.sold || 0,
      sort: ti.sort,
      section: ti.section || null,
      participantCount: ti.participantCount || 0,
    };
  });

  return { code: 0, tuan, products: joined, items: joined };
};
