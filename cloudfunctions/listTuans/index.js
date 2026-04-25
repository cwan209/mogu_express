// listTuans - 首页展示用:返回 on_sale + scheduled 的团,按 endAt 升序
//
// 加 `joined: boolean` 字段:当前登录用户是否在该团下过有效订单
//   "有效"= payStatus='paid' 或 status ∈ {paid,shipped,completed}
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event) => {
  const { page = 1, pageSize = 20 } = event || {};
  const col = db.collection('tuans');
  const q = col.where({
    status: _.in(['on_sale', 'scheduled']),
  });

  const [count, listRes] = await Promise.all([
    q.count(),
    q.orderBy('endAt', 'asc').skip((page - 1) * pageSize).limit(pageSize).get(),
  ]);

  let joined = new Set();
  try {
    const { OPENID } = cloud.getWXContext();
    if (OPENID) {
      const orderRes = await db.collection('orders')
        .where({ _openid: OPENID, payStatus: 'paid' })
        .limit(200)
        .get();
      for (const o of orderRes.data || []) {
        for (const it of o.items || []) {
          if (it.tuanId) joined.add(it.tuanId);
        }
      }
    }
  } catch (err) {
    console.warn('[listTuans] joined lookup failed', err.message);
  }

  const items = (listRes.data || []).map((t) => ({ ...t, joined: joined.has(t._id) }));

  return { code: 0, items, total: count.total, page, pageSize };
};
