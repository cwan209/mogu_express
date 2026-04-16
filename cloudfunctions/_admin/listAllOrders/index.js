// _admin/listAllOrders - 后台订单查询 + 筛选
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
    const { status, tuanId, dateFrom, dateTo, keyword, page = 1, pageSize = 50 } = event || {};

    const conds = [];
    if (status)    conds.push({ status });
    if (tuanId)    conds.push({ 'items.tuanId': tuanId });
    if (dateFrom)  conds.push({ createdAt: _.gte(new Date(dateFrom)) });
    if (dateTo)    conds.push({ createdAt: _.lte(new Date(dateTo)) });

    const col = db.collection('orders');
    let q = conds.length ? col.where(_.and(conds)) : col;

    const [count, listRes] = await Promise.all([
      q.count(),
      q.orderBy('createdAt', 'desc').skip((page - 1) * pageSize).limit(pageSize).get(),
    ]);

    // 关键字筛选(客户端做,云数据库没有全文索引)
    let items = listRes.data;
    if (keyword) {
      const k = String(keyword).toLowerCase();
      items = items.filter((o) =>
        o.orderNo.toLowerCase().includes(k) ||
        (o.userSnapshot && o.userSnapshot.name && o.userSnapshot.name.toLowerCase().includes(k)) ||
        (o.userSnapshot && o.userSnapshot.phone && o.userSnapshot.phone.includes(k)) ||
        (o.items || []).some((it) => it.title && it.title.toLowerCase().includes(k))
      );
    }

    return { code: 0, items, total: count.total };
  } catch (err) {
    return { code: err.code || 500, message: err.message || 'error' };
  }
};
