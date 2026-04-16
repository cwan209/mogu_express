const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { code: 401, message: 'not logged in' };
  const { address } = event || {};
  if (!address || !address.recipient || !address.phone || !address.line1 || !address.suburb || !address.state || !address.postcode) {
    return { code: 1, message: 'missing required fields' };
  }

  const col = db.collection('addresses');
  const now = new Date();

  let _id = address._id;
  if (_id) {
    // 更新时要确认属于本人
    const cur = await col.doc(_id).get().catch(() => null);
    if (!cur || !cur.data || cur.data._openid !== OPENID) return { code: 403, message: 'forbidden' };
    const data = { ...address, updatedAt: now };
    delete data._id;
    await col.doc(_id).update({ data });
  } else {
    const countRes = await col.where({ _openid: OPENID }).count();
    const isFirst = countRes.total === 0;
    const data = { ...address, _openid: OPENID, isDefault: !!address.isDefault || isFirst, createdAt: now, updatedAt: now };
    delete data._id;
    const r = await col.add({ data });
    _id = r._id;
  }

  // 若本地址设为默认,其他的全部 unset
  if (address.isDefault) {
    const others = await col.where({ _openid: OPENID, _id: _.neq(_id), isDefault: true }).get();
    await Promise.all(others.data.map((o) => col.doc(o._id).update({ data: { isDefault: false } })));
  }

  return { code: 0, _id };
};
