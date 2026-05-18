// listMyCoupons - 用户看自己的优惠券
//
// 入参: { status?: 'unused'|'used'|'expired' }
// 出参: { code: 0, items: Coupon[] }
//
// 仅返回 _openid === getWXContext().OPENID 的券。
// 懒过期:DB status='unused' 但 validTo < now 的券,在响应里投射 status='expired'。
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function projectStatus(coupon, now) {
  if (coupon.status === 'unused' && new Date(coupon.validTo) < now) {
    return { ...coupon, status: 'expired' };
  }
  return coupon;
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { code: 401, message: 'not logged in' };
  const { status } = event || {};

  const where = { _openid: OPENID };
  const now = new Date();
  let items;

  if (status === 'expired') {
    const r = await db.collection('coupons').where(where).orderBy('createdAt', 'desc').limit(200).get();
    items = r.data
      .map((c) => projectStatus(c, now))
      .filter((c) => c.status === 'expired');
  } else if (status === 'unused') {
    const r = await db.collection('coupons').where({ ...where, status: 'unused' }).orderBy('createdAt', 'desc').limit(200).get();
    items = r.data
      .map((c) => projectStatus(c, now))
      .filter((c) => c.status === 'unused');
  } else if (status === 'used') {
    const r = await db.collection('coupons').where({ ...where, status: 'used' }).orderBy('createdAt', 'desc').limit(200).get();
    items = r.data;
  } else {
    const r = await db.collection('coupons').where(where).orderBy('createdAt', 'desc').limit(200).get();
    items = r.data.map((c) => projectStatus(c, now));
  }

  return { code: 0, items };
};
