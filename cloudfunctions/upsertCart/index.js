// upsertCart - 单项增删改。quantity<=0 表示删除。
//
// 新模型:item 用 tuanItemId 作主键(因为价格/库存是团内实例维度)。
// 兼容:如果客户端旧版本传 productId,把它当作 tuanItemId 处理(历史 _id 同一值)。
//
// merge=true 模式(M2' 新增):
//   event.items: [{ tuanItemId, quantity, addedAt? }]
//   后端把这批 items 跟服务端现有 items 按 tuanItemId 合并 — 同键取较大数量
//   登录后把 localStorage 购物车上传时使用
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { code: 401, message: 'not logged in' };

  const col = db.collection('carts');
  const existing = await col.where({ _openid: OPENID }).limit(1).get();
  const now = new Date();

  // === replace 模式 (Sprint 2.3) ===
  // event.items 完全覆盖现有 cart。客户端 cart 是 debounced 权威。
  if (event?.replace && Array.isArray(event.items)) {
    const items = event.items
      .filter((x) => x && (x.tuanItemId || x.productId) && x.quantity > 0)
      .map((x) => ({
        tuanItemId: x.tuanItemId || x.productId,
        quantity: x.quantity,
        addedAt: x.addedAt ? new Date(x.addedAt) : now,
      }));
    if (existing.data && existing.data.length) {
      await col.doc(existing.data[0]._id).update({
        data: { items, updatedAt: now },
      });
    } else if (items.length) {
      await col.add({
        data: { _openid: OPENID, items, updatedAt: now },
      });
    }
    return { code: 0, replaced: items.length };
  }

  // === merge 模式 ===
  if (event?.merge && Array.isArray(event.items)) {
    const incoming = event.items
      .filter((x) => x && (x.tuanItemId || x.productId) && x.quantity > 0)
      .map((x) => ({
        tuanItemId: x.tuanItemId || x.productId,
        quantity: x.quantity,
        addedAt: x.addedAt ? new Date(x.addedAt) : now,
      }));
    if (existing.data && existing.data.length) {
      const doc = existing.data[0];
      const map = new Map();
      for (const it of doc.items || []) {
        map.set(it.tuanItemId || it.productId, { ...it });
      }
      for (const it of incoming) {
        const cur = map.get(it.tuanItemId);
        if (!cur) {
          map.set(it.tuanItemId, it);
        } else {
          cur.quantity = Math.max(cur.quantity || 0, it.quantity);
        }
      }
      await col.doc(doc._id).update({
        data: { items: [...map.values()], updatedAt: now },
      });
    } else if (incoming.length) {
      await col.add({
        data: { _openid: OPENID, items: incoming, updatedAt: now },
      });
    }
    return { code: 0, merged: incoming.length };
  }

  // === 单项 upsert(原逻辑)===
  const tuanItemId = event?.tuanItemId || event?.productId;
  const { quantity } = event || {};
  if (!tuanItemId) return { code: 1, message: 'tuanItemId required' };

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
