// listProducts - 按 tuanId/categoryId 过滤的商品列表
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event) => {
  const { tuanId, categoryId, page = 1, pageSize = 20 } = event || {};
  const where = {};
  if (tuanId)     where.tuanId = tuanId;
  if (categoryId) where.categoryIds = _.in([categoryId]);

  const col = db.collection('products');
  const q = Object.keys(where).length ? col.where(where) : col;

  const [count, listRes] = await Promise.all([
    q.count(),
    q.orderBy('sort', 'asc').skip((page - 1) * pageSize).limit(pageSize).get(),
  ]);

  return {
    code: 0,
    items: listRes.data,
    total: count.total,
    page,
    pageSize,
  };
};
