// upsertCart - 单项增删改。quantity<=0 表示删除。
//
// 新模型:item 用 tuanItemId 作主键(因为价格/库存是团内实例维度)。
// 兼容:如果客户端旧版本传 productId,把它当作 tuanItemId 处理(历史 _id 同一值)。
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { code: 401, message: 'not logged in' };

  const tuanItemId = event?.tuanItemId || event?.productId;
  const { quantity } = event || {};
  if (!tuanItemId) return { code: 1, message: 'tuanItemId required' };

  const col = db.collection('carts');
  const existing = await col.where({ _openid: OPENID }).limit(1).get();
  const now = new Date();

  if (existing.data && existing.data.length) {
    const doc = existing.data[0];
    const items = doc.items || [];
    const i = items.findIndex((x) => (x.tuanItemId || x.productId) === tuanItemId);
    if (quantity <= 0) {
      if (i >= 0) items.splice(i, 1);
    } else if (i >= 0) {
      items[i].quantity = quantity;
      items[i].tuanItemId = tuanItemId;
    } else {
      items.push({ tuanItemId, quantity, addedAt: now });
    }
    await col.doc(doc._id).update({ data: { items, updatedAt: now } });
  } else {
    if (quantity > 0) {
      await col.add({
        data: {
          _openid: OPENID,
          items: [{ tuanItemId, quantity, addedAt: now }],
          updatedAt: now,
        },
      });
    }
  }

  return { code: 0 };
};
