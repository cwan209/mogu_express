// _lib/huepay/sign.js - 签名 / 验签
//
// 常见聚合支付签名规则(HuePay 文档到位前的合理假设):
//   1. 剔除 sign / null / undefined / 空字符串字段
//   2. 按 key ASCII 升序排序
//   3. 拼接 key1=value1&key2=value2&...
//   4. 末尾追加 &key=<secret>(若用 MD5)或直接用 secret 做 HMAC key(若用 HMAC-SHA256)
//   5. HuePay 如用其它规则(如 RSA-SHA256 证书),只需改 sign() 函数,整套 SDK 不变
//
// 当前默认 HMAC-SHA256 + 参数拼接。

const crypto = require('crypto');

function flattenParams(obj) {
  const out = [];
  for (const [k, v] of Object.entries(obj || {})) {
    if (k === 'sign' || v == null || v === '') continue;
    // 嵌套对象/数组用 JSON 序列化
    const val = (typeof v === 'object') ? JSON.stringify(v) : String(v);
    out.push([k, val]);
  }
  out.sort((a, b) => (a[0] < b[0] ? -1 : 1));
  return out.map(([k, v]) => `${k}=${v}`).join('&');
}

function sign(params, secret, algo = 'HMAC-SHA256') {
  const str = flattenParams(params);
  switch (algo.toUpperCase()) {
    case 'HMAC-SHA256':
      return crypto.createHmac('sha256', secret).update(str).digest('hex').toUpperCase();
    case 'MD5': {
      // MD5 规则通常在末尾加 &key=<secret>
      return crypto.createHash('md5').update(str + '&key=' + secret).digest('hex').toUpperCase();
    }
    case 'SHA256':
      return crypto.createHash('sha256').update(str + '&key=' + secret).digest('hex').toUpperCase();
    default:
      throw new Error('unsupported sign algo: ' + algo);
  }
}

function verify(params, secret, algo = 'HMAC-SHA256') {
  if (!params || !params.sign) return false;
  const expected = sign(params, secret, algo);
  // 常量时间比较
  try {
    const a = Buffer.from(String(params.sign));
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// 随机 nonce
function nonce(len = 16) {
  return crypto.randomBytes(len).toString('hex');
}

module.exports = { sign, verify, flattenParams, nonce };
