// _lib/huepay/sign.js
//
// HuePay 签名规则(2026.05 文档):
//   X-Signature = MD5_HEX(JSON_BODY_UTF8 + X-SecretKey)
//
// JSON body 必须跟实际 POST body 完全一致(字段顺序、空格,序列化时如何就如何)。
// HuePay 那边对 raw body 做同样 MD5,比较 X-Signature header。
//
// 验签(收回调): MD5_HEX(raw_body + secretKey) === X-Signature (case-insensitive)
// 用 timing-safe 比较避免 timing attack。

const crypto = require('crypto');

/**
 * 计算 HuePay 签名
 * @param {string} jsonBody 已 JSON.stringify 完的 body 字符串
 * @param {string} secretKey
 * @returns {string} 32-char lowercase hex
 */
function sign(jsonBody, secretKey) {
  if (typeof jsonBody !== 'string') throw new Error('sign: jsonBody must be string');
  if (!secretKey) throw new Error('sign: secretKey required');
  return crypto.createHash('md5').update(jsonBody + secretKey, 'utf8').digest('hex');
}

/**
 * 验证 HuePay 签名(回调用)
 * @param {string} rawBody    原始收到的 body 字符串
 * @param {string} headerSig  X-Signature header 值
 * @param {string} secretKey
 * @returns {boolean}
 */
function verify(rawBody, headerSig, secretKey) {
  if (!rawBody || !headerSig || !secretKey) return false;
  const expected = sign(rawBody, secretKey);
  try {
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(String(headerSig).toLowerCase(), 'utf8');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** 16 byte hex nonce(填充 wx.requestPayment 用)*/
function nonce(len = 16) {
  return crypto.randomBytes(len).toString('hex');
}

module.exports = { sign, verify, nonce };
