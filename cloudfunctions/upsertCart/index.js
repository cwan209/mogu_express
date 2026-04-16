// upsertCart - 单项增删改。quantity<=0 表示删除。
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { code: 401, message: 'not logged in' };
  const { productId, quantity } = event || {};
  if (!productId) return { code: 1, message: 'productId required' };

  const col = db.collection('carts');
  const existing = await col.where({ _openid: OPENID }).limit(1).get();
  const now = new Date();

  if (existing.data && existing.data.length) {
    const doc = existing.data[0];
    const items = doc.items || [];
    const i = items.findIndex((x) => x.productId === productId);
    if (quantity <= 0) {
      if (i >= 0) items.splice(i, 1);
    } else if (i >= 0) {
      items[i].quantity = quantity;
    } else {
      items.push({ productId, quantity, addedAt: now });
    }
    await col.doc(doc._id).update({ data: { items, updatedAt: now } });
  } else {
    if (quantity > 0) {
      await col.add({
        data: {
          _openid: OPENID,
          items: [{ productId, quantity, addedAt: now }],
          updatedAt: now,
        },
      });
    }
  }

  return { code: 0 };
};
