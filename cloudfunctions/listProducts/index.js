// listProducts - 两种模式:
//   1) 传 tuanId → 返回团内商品实例(joined view,同 getTuanDetail 的 products 形状)
//   2) 不传     → 返回商品库(catalog),面向 Web 后台商品库页
//
// 为保持小程序端兼容,mode 1 下返回的每条记录 _id = tuanItemId,含 price/stock/section 等团内字段。

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event) => {
  const { tuanId, categoryId, page = 1, pageSize = 20 } = event || {};

  if (tuanId) {
    // ─── 模式 1:团内商品 ───
    const tiRes = await db
      .collection('tuan_items')
      .where({ tuanId })
      .orderBy('sort', 'asc')
      .limit(500)
      .get();
    let items = tiRes.data || [];
    if (!items.length) return { code: 0, items: [], total: 0, page, pageSize };

    const prodRes = await db
      .collection('products')
      .where({ _id: _.in(items.map((i) => i.productId)) })
      .limit(500)
      .get();
    const pmap = new Map();
    for (const p of prodRes.data || []) pmap.set(p._id, p);

    let joined = items.map((ti) => {
      const p = pmap.get(ti.productId) || {};
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

    if (categoryId) joined = joined.filter((j) => (j.categoryIds || []).includes(categoryId));

    const total = joined.length;
    const sliced = joined.slice((page - 1) * pageSize, page * pageSize);
    return { code: 0, items: sliced, total, page, pageSize };
  }

  // ─── 模式 2:商品库(catalog) ───
  const where = categoryId ? { categoryIds: _.in([categoryId]) } : {};
  const col = db.collection('products');
  const q = Object.keys(where).length ? col.where(where) : col;
  const [count, listRes] = await Promise.all([
    q.count(),
    q.orderBy('createdAt', 'desc').skip((page - 1) * pageSize).limit(pageSize).get(),
  ]);
  return { code: 0, items: listRes.data, total: count.total, page, pageSize };
};
