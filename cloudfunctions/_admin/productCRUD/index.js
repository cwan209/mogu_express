// _admin/productCRUD - 商品库(catalog)增删改查
//
// 商品库独立于团,只有稳定属性。price/stock/sort/section 下放到 tuan_items,
// 由 _admin/tuanItemCRUD 管理。
//
// 兼容:如果 create 时传了 tuanId + price + stock(旧接口形态),
//       会同时在 tuan_items 里建一条实例,以保持旧 UI 路径。

const cloud = require('wx-server-sdk');
const { verify } = require('./jwt.js');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const JWT_SECRET = process.env.JWT_SECRET || 'mogu_express_dev_secret_REPLACE_ME_IN_PROD';

async function requireAdmin(event) {
  if (event && event.token) {
    try { return { source: 'web', admin: verify(event.token, JWT_SECRET) }; }
    catch (err) { const e = new Error('invalid token'); e.code = 401; throw e; }
  }
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) { const e = new Error('no openid'); e.code = 401; throw e; }
  const res = await db.collection('admins').where({ openid: OPENID }).limit(1).get();
  if (!res.data || !res.data.length) { const e = new Error('not admin'); e.code = 403; throw e; }
  return { source: 'mp', admin: res.data[0] };
}

exports.main = async (event) => {
  try {
    await requireAdmin(event);
    const { action } = event || {};
    switch (action) {
      case 'list':   return await list(event);
      case 'create': return await create(event);
      case 'update': return await update(event);
      case 'delete': return await remove(event);
      default: return { code: 1, message: 'unknown action' };
    }
  } catch (err) {
    return { code: err.code || 500, message: err.message || 'error' };
  }
};

/**
 * list
 *   - 不传 tuanId → 返回商品库(catalog),Web 后台商品库页用
 *   - 传 tuanId   → 返回团内商品实例(joined view),保持旧调用路径工作
 */
async function list({ tuanId, categoryId, page = 1, pageSize = 50 }) {
  if (tuanId) {
    // 走 tuan_items + products join
    const tiRes = await db.collection('tuan_items').where({ tuanId })
      .orderBy('sort', 'asc').limit(500).get();
    const items = tiRes.data || [];
    if (!items.length) return { code: 0, items: [], total: 0 };
    const prodRes = await db.collection('products')
      .where({ _id: _.in(items.map((i) => i.productId)) }).limit(500).get();
    const pmap = new Map((prodRes.data || []).map((p) => [p._id, p]));
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
    return { code: 0, items: joined.slice((page - 1) * pageSize, page * pageSize), total: joined.length };
  }

  // catalog 模式
  const where = categoryId ? { categoryIds: _.in([categoryId]) } : {};
  const col = db.collection('products');
  const q = Object.keys(where).length ? col.where(where) : col;
  const [count, res] = await Promise.all([
    q.count(),
    q.orderBy('createdAt', 'desc').skip((page - 1) * pageSize).limit(pageSize).get(),
  ]);
  return { code: 0, items: res.data, total: count.total };
}

/**
 * create - 创建商品库条目。
 *   payload: { title, description, coverFileId, imageFileIds?, categoryIds?,
 *              tuanId?, price?, stock?, sort?, section? }
 *   如果提供 tuanId,同时在 tuan_items 创建一条实例并维护 tuan.productCount。
 */
async function create({ payload }) {
  if (!payload || !payload.title) return { code: 1, message: 'title required' };

  const now = new Date();
  const catalog = {
    title: payload.title,
    description: payload.description || '',
    coverFileId: payload.coverFileId || '',
    imageFileIds: payload.imageFileIds || [],
    categoryIds: payload.categoryIds || [],
    createdAt: now,
    updatedAt: now,
  };
  const pAdd = await db.collection('products').add({ data: catalog });
  const productId = pAdd._id;

  let tuanItemId = null;
  if (payload.tuanId) {
    const tuanRes = await db.collection('tuans').doc(payload.tuanId).get().catch(() => null);
    if (!tuanRes || !tuanRes.data) {
      await db.collection('products').doc(productId).remove().catch(() => {});
      return { code: 1, message: 'tuan not found' };
    }
    const rawSection = (payload.section || '').trim();
    const tiDoc = {
      tuanId: payload.tuanId,
      productId,
      price: Number(payload.price) | 0,
      stock: Number(payload.stock) | 0,
      sold: 0,
      sort: Number(payload.sort) | 0,
      section: rawSection || null,
      participantCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    const tAdd = await db.collection('tuan_items').add({ data: tiDoc });
    tuanItemId = tAdd._id;
    await db.collection('tuans').doc(payload.tuanId).update({
      data: { productCount: _.inc(1), updatedAt: now },
    });
  }

  return { code: 0, _id: productId, productId, tuanItemId };
}

async function update({ id, patch }) {
  if (!id) return { code: 1, message: 'id required' };
  const current = await db.collection('products').doc(id).get().catch(() => null);
  if (!current || !current.data) return { code: 2, message: 'not found' };

  // 只接受 catalog 字段;tuan-specific 字段被忽略(走 tuanItemCRUD)
  const allowed = ['title', 'description', 'coverFileId', 'imageFileIds', 'categoryIds'];
  const data = { updatedAt: new Date() };
  for (const k of allowed) if (k in patch) data[k] = patch[k];

  // 若 patch 里有团内字段,同步到该 productId 的所有 tuan_items(语义不常用,
  // 保留以支持"商品库改价批量同步"这类未来功能)
  const tuanFields = {};
  if ('price' in patch) tuanFields.price = Number(patch.price) | 0;
  if ('stock' in patch) tuanFields.stock = Number(patch.stock) | 0;
  if ('sort'  in patch) tuanFields.sort  = Number(patch.sort)  | 0;
  if ('section' in patch) {
    const s = (patch.section || '').trim();
    tuanFields.section = s || null;
  }

  await db.collection('products').doc(id).update({ data });

  if (Object.keys(tuanFields).length && patch.tuanItemId) {
    tuanFields.updatedAt = new Date();
    await db.collection('tuan_items').doc(patch.tuanItemId).update({ data: tuanFields })
      .catch((err) => console.warn('[productCRUD.update] tuan_item sync failed', err.message));
  }
  return { code: 0 };
}

async function remove({ id }) {
  if (!id) return { code: 1, message: 'id required' };
  const prod = await db.collection('products').doc(id).get().catch(() => null);
  if (!prod || !prod.data) return { code: 2, message: 'not found' };

  // 有任一 tuan_item.sold>0 → 拒绝
  const tis = await db.collection('tuan_items').where({ productId: id }).limit(500).get();
  const instances = tis.data || [];
  if (instances.some((ti) => (ti.sold || 0) > 0)) {
    return { code: 1, message: '商品已在某团中产生成交,不能从商品库删除' };
  }

  // 删掉所有关联的 tuan_items + 维护 tuan.productCount
  const tuanIdCount = new Map();
  for (const ti of instances) {
    tuanIdCount.set(ti.tuanId, (tuanIdCount.get(ti.tuanId) || 0) + 1);
    await db.collection('tuan_items').doc(ti._id).remove().catch(() => {});
  }
  for (const [tuanId, n] of tuanIdCount) {
    await db.collection('tuans').doc(tuanId).update({
      data: { productCount: _.inc(-n), updatedAt: new Date() },
    }).catch(() => {});
  }
  await db.collection('products').doc(id).remove();
  return { code: 0 };
}
