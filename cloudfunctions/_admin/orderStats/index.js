// _admin/orderStats - 统计数据(Dashboard 用)
// 返回:
//   - gmvToday  (今日已支付 GMV, 分)
//   - ordersToday (今日订单数)
//   - gmv7d  / orders7d  (近 7 天)
//   - gmv30d / orders30d
//   - activeTuans  (on_sale 中的团数)
//   - activeProducts
//   - topProducts: 销量前 10 (最近 30 天)
//   - tuanSummary: 每个团的已支付订单数/金额

const cloud = require('wx-server-sdk');
const { verify } = require('./jwt.js');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const JWT_SECRET = process.env.JWT_SECRET || 'mogu_express_dev_secret_REPLACE_ME_IN_PROD';

async function requireAdmin(event) {
  if (event && event.token) {
    try { return verify(event.token, JWT_SECRET); }
    catch (err) { const e = new Error('invalid token'); e.code = 401; throw e; }
  }
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) { const e = new Error('no openid'); e.code = 401; throw e; }
  const res = await db.collection('admins').where({ openid: OPENID }).limit(1).get();
  if (!res.data || !res.data.length) { const e = new Error('not admin'); e.code = 403; throw e; }
  return res.data[0];
}

const PAID_STATUSES = ['paid', 'shipped', 'completed'];

exports.main = async (event) => {
  try {
    await requireAdmin(event);

    const now = new Date();
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const d7  = new Date(now.getTime() - 7  * 86400e3);
    const d30 = new Date(now.getTime() - 30 * 86400e3);

    // 拉近 30 天的订单(避免全表)
    const ordersRes = await db
      .collection('orders')
      .where({
        createdAt: _.gte(d30),
        status: _.in(PAID_STATUSES),
      })
      .limit(5000)
      .get();
    const orders = ordersRes.data || [];

    const sum = (list, f) => list.reduce((s, x) => s + f(x), 0);

    const today = orders.filter((o) => new Date(o.createdAt) >= todayStart);
    const week  = orders.filter((o) => new Date(o.createdAt) >= d7);

    // 商品销量 top 10(近 30 天)
    const prodAgg = new Map();
    for (const o of orders) {
      for (const it of o.items || []) {
        const cur = prodAgg.get(it.productId) || { productId: it.productId, title: it.title, qty: 0, amount: 0 };
        cur.qty += it.quantity;
        cur.amount += it.subtotal;
        prodAgg.set(it.productId, cur);
      }
    }
    const topProducts = [...prodAgg.values()].sort((a, b) => b.qty - a.qty).slice(0, 10);

    // 团汇总
    const tuanAgg = new Map();
    for (const o of orders) {
      const tuanIds = new Set((o.items || []).map((it) => it.tuanId).filter(Boolean));
      for (const tid of tuanIds) {
        const cur = tuanAgg.get(tid) || { tuanId: tid, orders: 0, amount: 0 };
        cur.orders += 1;
        // 粗算:把该订单归到每个涉及团(可能重复,如果订单跨团就每个团 +amount;真实场景单订单多团比较少)
        cur.amount += (o.items || []).filter((it) => it.tuanId === tid).reduce((s, it) => s + it.subtotal, 0);
        tuanAgg.set(tid, cur);
      }
    }
    const tuanSummary = [...tuanAgg.values()].sort((a, b) => b.amount - a.amount);

    // 活跃团/商品
    const activeTuansRes = await db.collection('tuans')
      .where({ status: 'on_sale' })
      .count();
    const activeProdRes = await db.collection('products')
      .where({ stock: _.gt(0) }).count();

    return {
      code: 0,
      gmvToday: sum(today, (o) => o.amount),
      ordersToday: today.length,
      gmv7d: sum(week, (o) => o.amount),
      orders7d: week.length,
      gmv30d: sum(orders, (o) => o.amount),
      orders30d: orders.length,
      activeTuans: activeTuansRes.total,
      activeProducts: activeProdRes.total,
      topProducts,
      tuanSummary,
    };
  } catch (err) {
    return { code: err.code || 500, message: err.message || 'error' };
  }
};
