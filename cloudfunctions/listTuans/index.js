// listTuans - 首页展示用:返回 on_sale + scheduled 的团,按 endAt 升序
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

  return {
    code: 0,
    items: listRes.data,
    total: count.total,
    page,
    pageSize,
  };
};
