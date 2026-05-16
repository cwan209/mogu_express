// wxLogin — 公众号 OAuth code → openid → JWT
//
// 流程:
//   1. 前端从公众号 OAuth redirect 拿到 code
//   2. 调 https://api.weixin.qq.com/sns/oauth2/access_token 用 code 换 openid
//   3. upsert users 表(以 _openid 为主键)
//   4. 签发同 verifyOtp 格式的 JWT
//
// 入参:{ code }
// 出参:{ code: 0, token, openid, isRegistered, user: { name, phone } }
//
// Env:
//   WECHAT_APP_ID, WECHAT_APP_SECRET — 公众号 / 测试号凭证
//   JWT_SECRET — 同 verifyOtp 共用

const https = require('https');
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const { sign } = require('./jwt');

const JWT_TTL_SEC = 30 * 24 * 3600; // 30 天

const REQUEST_TIMEOUT_MS = 8000;

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: REQUEST_TIMEOUT_MS }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('invalid JSON from wechat: ' + data));
        }
      });
    });
    req.on('timeout', () => req.destroy(new Error('wechat api timeout')));
    req.on('error', reject);
  });
}

exports.main = async (event) => {
  const { code } = event || {};
  if (!code) return { code: 1, message: 'code required' };

  const appId = process.env.WECHAT_APP_ID;
  const appSecret = process.env.WECHAT_APP_SECRET;
  const jwtSecret = process.env.JWT_SECRET;
  if (!appId || !appSecret) return { code: 500, message: 'WECHAT_APP_ID/SECRET not set' };
  if (!jwtSecret) return { code: 500, message: 'JWT_SECRET not set' };

  // 1. 用 code 换 openid
  const url =
    `https://api.weixin.qq.com/sns/oauth2/access_token` +
    `?appid=${appId}` +
    `&secret=${appSecret}` +
    `&code=${encodeURIComponent(code)}` +
    `&grant_type=authorization_code`;

  let res;
  try {
    res = await httpsGet(url);
  } catch (err) {
    // 只 log err.message — 防 Node 把 url(含 secret) 塞进 err 对象的 input/config 属性
    console.error('[wxLogin] wechat api network failure:', err && err.message);
    return { code: 2, message: 'wechat api unreachable' };
  }

  if (res.errcode) {
    // 常见 40029=invalid code, 40163=code 已被使用
    console.warn('[wxLogin] wechat returned error', res);
    return { code: 3, message: `wechat error: ${res.errmsg} (${res.errcode})` };
  }

  const openid = res.openid;
  const unionid = res.unionid || null;
  if (!openid) return { code: 4, message: 'wechat returned no openid' };

  // 2. upsert user
  const now = new Date();
  const userCol = db.collection('users');
  const existing = await userCol.where({ _openid: openid }).limit(1).get();

  let isRegistered = false;
  let userInfo = { name: null, phone: null };
  if (existing.data && existing.data.length) {
    const u = existing.data[0];
    isRegistered = Boolean(u.name);
    userInfo = { name: u.name || null, phone: u.phone || null };
    await userCol.doc(u._id).update({
      data: {
        unionid: unionid || u.unionid || null,
        lastLoginAt: now,
        updatedAt: now,
      },
    });
  } else {
    await userCol.add({
      data: {
        _openid: openid,
        unionid,
        registeredAt: null,
        createdAt: now,
        updatedAt: now,
        lastLoginAt: now,
      },
    });
  }

  // 3. 签 JWT(payload 跟 verifyOtp 格式一致,phone 可能 null)
  const token = sign({ openid, phone: userInfo.phone, role: 'customer' }, jwtSecret, JWT_TTL_SEC);

  return {
    code: 0,
    token,
    openid,
    isRegistered,
    user: userInfo,
  };
};
