// _admin/issueCoupon - 管理员给指定 openid 发优惠券
//
// 入参: { openid, amount, reason?, validFrom?, validTo?, token }
//   - openid: 目标用户(必填)
//   - amount: 减免金额,正整数 cents(必填,>0)
//   - reason: 备注,默认 ''
//   - validFrom: 生效时间,默认 now (ISO string 或 Date)
//   - validTo: 失效时间,默认 now + 30 天
//
// 出参: { code: 0, _id }
//
// 鉴权: 同 categoryCRUD 模式(web token 或 mp openid)
const cloud = require('wx-server-sdk');
const { verify } = require('./jwt.js');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const JWT_SECRET = process.env.JWT_SECRET || 'mogu_express_dev_secret_REPLACE_ME_IN_PROD';

async function requireAdmin(event) {
  if (event && event.token) {
    try {
      const admin = verify(event.token, JWT_SECRET);
      return { source: 'web', admin, adminOpenid: 'web' };
    } catch (err) { const e = new Error('invalid token'); e.code = 401; throw e; }
  }
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) { const e = new Error('no openid'); e.code = 401; throw e; }
  const res = await db.collection('admins').where({ openid: OPENID }).limit(1).get();
  if (!res.data || !res.data.length) { const e = new Error('not admin'); e.code = 403; throw e; }
  return { source: 'mp', admin: res.data[0], adminOpenid: OPENID };
}

exports.main = async (event) => {
  try {
    const { adminOpenid } = await requireAdmin(event);

    const { openid, amount, reason, validFrom, validTo } = event || {};
    if (!openid || typeof openid !== 'string') {
      return { code: 1, message: 'openid required' };
    }
    const amt = Number(amount);
    if (!Number.isInteger(amt) || amt <= 0) {
      return { code: 1, message: 'amount must be positive integer cents' };
    }

    const now = new Date();
    const vf = validFrom ? new Date(validFrom) : now;
    const vt = validTo ? new Date(validTo) : new Date(now.getTime() + 30 * 86400 * 1000);
    if (isNaN(vf.getTime()) || isNaN(vt.getTime())) {
      return { code: 1, message: 'invalid validFrom/validTo' };
    }
    if (vt <= vf) {
      return { code: 1, message: 'validTo must be after validFrom' };
    }

    const doc = {
      _openid: openid,
      amount: amt,
      reason: typeof reason === 'string' ? reason : '',
      status: 'unused',
      validFrom: vf,
      validTo: vt,
      createdBy: adminOpenid,
      createdAt: now,
    };
    const r = await db.collection('coupons').add({ data: doc });
    return { code: 0, _id: r._id };
  } catch (err) {
    return { code: err.code || 500, message: err.message || 'error' };
  }
};
