// wxLogin — 公众号 OAuth code → openid → JWT
//
// 流程:
//   1. 前端从公众号 OAuth redirect 拿到 code (前端 scope=snsapi_userinfo)
//   2. 调 sns/oauth2/access_token 用 code 换 access_token + openid
//   3. 若 scope=snsapi_userinfo,再调 sns/userinfo 拿 nickname/headimgurl/地区
//      (snsapi_base 时 res.scope='snsapi_base',跳过这步)
//   4. upsert users 表(以 _openid 为主键),把 wechat profile 字段一起写入
//   5. 签发同 verifyOtp 格式的 JWT
//
// 入参:{ code }
// 出参:{ code: 0, token, openid, isRegistered, user: { name, phone, wechat: {nickname, avatar, ...} } }
//
// Env:
//   WECHAT_APP_ID, WECHAT_APP_SECRET — 公众号 / 测试号凭证
//   JWT_SECRET — 同 verifyOtp 共用
//
// 注:2022+ 微信对新用户脱敏 nickname → "微信用户" + 默认灰头像,但 sex/
// country/province/city/language 未脱敏。我们仍存进 mongo,降级用 UI 上不
// 强依赖真昵称/头像(显示时用占位即可)。

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
  const accessToken = res.access_token;
  const scope = res.scope || '';
  if (!openid) return { code: 4, message: 'wechat returned no openid' };

  // 2. 若 scope=snsapi_userinfo,拉用户资料 (nickname/headimgurl/地区)
  // 失败不致命 (用户体验不影响登录) — 只 log warn 然后继续
  let wechatProfile = null;
  if (scope.includes('snsapi_userinfo') && accessToken) {
    const userInfoUrl =
      `https://api.weixin.qq.com/sns/userinfo` +
      `?access_token=${encodeURIComponent(accessToken)}` +
      `&openid=${encodeURIComponent(openid)}` +
      `&lang=zh_CN`;
    try {
      const u = await httpsGet(userInfoUrl);
      if (u.errcode) {
        console.warn('[wxLogin] sns/userinfo error', u);
      } else {
        wechatProfile = {
          nickname: u.nickname || null,
          avatar: u.headimgurl || null,
          sex: typeof u.sex === 'number' ? u.sex : null, // 0 未知 / 1 男 / 2 女
          country: u.country || null,
          province: u.province || null,
          city: u.city || null,
          language: u.language || null,
          fetchedAt: new Date(),
        };
      }
    } catch (err) {
      console.warn('[wxLogin] sns/userinfo network error:', err && err.message);
    }
  }

  // 3. upsert user
  const now = new Date();
  const userCol = db.collection('users');
  const existing = await userCol.where({ _openid: openid }).limit(1).get();

  let isRegistered = false;
  let userInfo = { name: null, phone: null, wechat: null };
  if (existing.data && existing.data.length) {
    const u = existing.data[0];
    isRegistered = Boolean(u.name);
    // 优先用最新的微信资料,没有就保留旧的
    const wechat = wechatProfile || u.wechat || null;
    userInfo = { name: u.name || null, phone: u.phone || null, wechat };
    await userCol.doc(u._id).update({
      data: {
        unionid: unionid || u.unionid || null,
        ...(wechatProfile ? { wechat: wechatProfile } : {}),
        lastLoginAt: now,
        updatedAt: now,
      },
    });
  } else {
    userInfo = { name: null, phone: null, wechat: wechatProfile };
    await userCol.add({
      data: {
        _openid: openid,
        unionid,
        wechat: wechatProfile,
        registeredAt: null,
        createdAt: now,
        updatedAt: now,
        lastLoginAt: now,
      },
    });
  }

  // 4. 签 JWT(payload 跟 verifyOtp 格式一致,phone 可能 null)
  const token = sign({ openid, phone: userInfo.phone, role: 'customer' }, jwtSecret, JWT_TTL_SEC);

  return {
    code: 0,
    token,
    openid,
    isRegistered,
    user: userInfo,
  };
};
