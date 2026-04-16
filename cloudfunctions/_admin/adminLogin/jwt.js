// cloudfunctions/_lib/auth/jwt.js
// 纯依赖 crypto,不引入 jsonwebtoken(减小每个云函数体积)
// 每个管理员云函数部署时,复制 _lib/auth 整个目录到自己的 node_modules 之外的同级路径,
// 或直接在云函数目录内 require('./_lib/auth/jwt')。
// 实施 M1 时,考虑用云开发的 layer 或构建脚本统一打包。

const crypto = require('crypto');

function base64urlEncode(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64').toString('utf8');
}

/**
 * 签发 HS256 JWT
 * @param {object} payload  - 会被补充 iat/exp
 * @param {string} secret   - HMAC 密钥
 * @param {number} ttlSec   - 过期秒数(默认 7 天)
 */
function sign(payload, secret, ttlSec = 7 * 24 * 3600) {
  if (!secret) throw new Error('jwt secret is required');
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + ttlSec };

  const header = base64urlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payloadEnc = base64urlEncode(JSON.stringify(body));
  const data = `${header}.${payloadEnc}`;
  const sig = base64urlEncode(
    crypto.createHmac('sha256', secret).update(data).digest()
  );
  return `${data}.${sig}`;
}

/**
 * 校验并解析 JWT,失败抛出 Error。返回 payload。
 */
function verify(token, secret) {
  if (!token || typeof token !== 'string') throw new Error('invalid token');
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('invalid token format');
  const [header, payloadEnc, sig] = parts;
  const expected = base64urlEncode(
    crypto
      .createHmac('sha256', secret)
      .update(`${header}.${payloadEnc}`)
      .digest()
  );
  if (!timingSafeEqual(sig, expected)) throw new Error('bad signature');

  const payload = JSON.parse(base64urlDecode(payloadEnc));
  if (payload.exp && Math.floor(Date.now() / 1000) >= payload.exp) {
    throw new Error('token expired');
  }
  return payload;
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * bcrypt-style 密码哈希 PBKDF2(不引 bcrypt 模块以免增加云函数体积)
 *   存储格式: pbkdf2$<iterations>$<saltHex>$<hashHex>
 */
function hashPassword(plain, iterations = 100000) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.pbkdf2Sync(plain, salt, iterations, 32, 'sha256');
  return `pbkdf2$${iterations}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

function verifyPassword(plain, stored) {
  if (!stored || !stored.startsWith('pbkdf2$')) return false;
  const [, itersStr, saltHex, hashHex] = stored.split('$');
  const iterations = Number(itersStr);
  if (!iterations) return false;
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.pbkdf2Sync(plain, salt, iterations, expected.length, 'sha256');
  return crypto.timingSafeEqual(actual, expected);
}

module.exports = { sign, verify, hashPassword, verifyPassword };
