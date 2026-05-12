// verifyOtp - 校验验证码,签 JWT,返用户态
//
// 流程:
//   1. 查 otp_codes 最近一条 phone 匹配且未过期的记录
//   2. 比较 OTP,错误则 attempts++,3 次错失败 → 失效
//   3. 验证通过 → upsert users(phone → openid 派生)+ 签 JWT(payload: {openid, phone, role:'customer'})
//   4. 返 token + isRegistered(以 users.name 是否存在判断)
//
// JWT secret 来自 process.env.JWT_SECRET。本地后端在 docker-compose.yml 注入。
//
// 入参:{ phone, otp }
// 出参:{ code: 0, token, openid, isRegistered, user? }

const crypto = require('crypto');
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const { sign } = require('./jwt');

const MAX_ATTEMPTS = 3;
const JWT_TTL_SEC = 30 * 24 * 3600;  // 30 天
const PHONE_RE = /^1[3-9]\d{9}$/;
const OTP_RE = /^\d{6}$/;

/**
 * 把手机号映射成稳定的 openid(`PHONE_<sha256-12>`)
 * 这样不依赖微信生态,也能唯一标识用户
 */
function phoneToOpenid(phone) {
  const h = crypto.createHash('sha256').update('mogu:' + phone).digest('hex');
  return `PHONE_${h.slice(0, 24)}`;
}

exports.main = async (event) => {
  const { phone, otp } = event || {};
  if (!phone || !PHONE_RE.test(phone)) return { code: 1, message: '手机号格式错误' };
  if (!otp || !OTP_RE.test(otp))       return { code: 2, message: '验证码必须是 6 位数字' };

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    return { code: 500, message: 'server misconfigured: JWT_SECRET not set' };
  }

  const otpCol = db.collection('otp_codes');
  const userCol = db.collection('users');
  const now = new Date();

  // 查最近一条未验证、未过期的 OTP
  const rec = await otpCol
    .where({ phone, verified: false, expiresAt: _.gt(now) })
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get();

  if (!rec.data || rec.data.length === 0) {
    return { code: 3, message: '验证码不存在或已过期' };
  }
  const row = rec.data[0];

  if (row.attempts >= MAX_ATTEMPTS) {
    return { code: 4, message: '验证次数已用尽,请重新获取' };
  }

  if (row.otp !== otp) {
    await otpCol.doc(row._id).update({ data: { attempts: row.attempts + 1 } });
    return { code: 5, message: `验证码错误(剩余 ${MAX_ATTEMPTS - row.attempts - 1} 次)` };
  }

  // 验证通过,标记已用
  await otpCol.doc(row._id).update({ data: { verified: true, verifiedAt: now } });

  // upsert user
  const openid = phoneToOpenid(phone);
  const existing = await userCol.where({ _openid: openid }).limit(1).get();
  let isRegistered = false;
  let userInfo = { name: null, phone };
  if (existing.data && existing.data.length) {
    const u = existing.data[0];
    isRegistered = Boolean(u.name);  // 有姓名才算完成注册
    userInfo = { name: u.name || null, phone: u.phone || phone };
    await userCol.doc(u._id).update({
      data: { phone, lastLoginAt: now, updatedAt: now },
    });
  } else {
    await userCol.add({
      data: {
        _openid: openid,
        phone,
        registeredAt: null,
        createdAt: now,
        updatedAt: now,
        lastLoginAt: now,
      },
    });
  }

  const token = sign({ openid, phone, role: 'customer' }, secret, JWT_TTL_SEC);

  return {
    code: 0,
    token,
    openid,
    isRegistered,
    user: { name: userInfo.name, phone: userInfo.phone },
  };
};
