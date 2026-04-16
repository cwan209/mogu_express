// cron_tuanStatus - 定时任务
//
// 云开发:在云开发控制台 → 云函数 → 触发器,加 cron 表达式如 "0 */5 * * * *"(每 5 分钟)
// 本地 Docker:用 node-cron 或外部 curl 触发
//
// 工作:
//   1. scheduled && startAt <= now  → on_sale
//   2. on_sale   && endAt   <= now  → closed
//   3. pending_pay 超 30 分钟未支付 → cancelled + 回滚 sold
//
// 返回:各类处理数量

const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async () => {
  const now = new Date();
  const thirtyMinAgo = new Date(now.getTime() - 30 * 60 * 1000);

  let openedTuans = 0;
  let closedTuans = 0;
  let cancelledOrders = 0;

  // 1. scheduled → on_sale
  try {
    const r = await db.collection('tuans')
      .where({ status: 'scheduled', startAt: _.lte(now) })
      .update({ data: { status: 'on_sale', updatedAt: now } });
    openedTuans = (r.stats && r.stats.updated) || 0;
  } catch (err) {
    console.error('[cron] open scheduled failed', err.message);
  }

  // 2. on_sale → closed
  try {
    const r = await db.collection('tuans')
      .where({ status: 'on_sale', endAt: _.lte(now) })
      .update({ data: { status: 'closed', updatedAt: now } });
    closedTuans = (r.stats && r.stats.updated) || 0;
  } catch (err) {
    console.error('[cron] close on_sale failed', err.message);
  }

  // 3. 超时 pending_pay 订单取消(不能 batch,需要逐个事务回滚 sold)
  try {
    const expired = await db
      .collection('orders')
      .where({
        status: 'pending_pay',
        createdAt: _.lt(thirtyMinAgo),
      })
      .limit(100)
      .get();

    for (const order of (expired.data || [])) {
      try {
        await db.runTransaction(async (tx) => {
          const oDoc = await tx.collection('orders').doc(order._id).get();
          if (!oDoc.data || oDoc.data.status !== 'pending_pay') return;
          for (const it of oDoc.data.items || []) {
            await tx.collection('products').doc(it.productId).update({
              data: { sold: _.inc(-it.quantity), updatedAt: now },
            });
          }
          await tx.collection('orders').doc(order._id).update({
            data: {
              status: 'cancelled',
              payStatus: 'failed',
              updatedAt: now,
            },
          });
        });
        cancelledOrders++;
      } catch (err) {
        console.error('[cron] cancel order', order._id, 'failed', err.message);
      }
    }
  } catch (err) {
    console.error('[cron] query expired failed', err.message);
  }

  const summary = {
    code: 0,
    ranAt: now.toISOString(),
    openedTuans,
    closedTuans,
    cancelledOrders,
  };
  console.log('[cron_tuanStatus]', summary);
  return summary;
};
