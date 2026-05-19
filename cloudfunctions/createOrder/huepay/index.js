// _lib/huepay/index.js - HuePay SDK (真接入对齐版本, 2026.05)
//
// Two-stage auth:
//   stage 1: GET /authorize  with X-AccessCode + X-SecretKey  →  JWT
//   stage 2: POST /api/...   with X-AccessCode + Authorization: Bearer + X-Signature
//
// 暴露:
//   createOrder({ outTradeNo, amount, body, openid, clientIp?, notifyUrl?, returnUrl?, expireMinutes?, metadata? })
//     → { payParams, raw }   — payParams 传给小程序 wx.requestPayment
//
//   queryOrder({ outTradeNo })
//     → { paid, status, transactionId, paidAt, amount, raw }
//
//   refund({ outTradeNo, refundNo, refundAmount, reason? })
//     → { success, refundId, raw }
//
//   verifyCallback({ rawBody, headerSignature, parsed })
//     → { valid, outTradeNo, transactionId, paidAt, amount, status, raw }
//
//   (向后兼容)verifyCallback(parsedBody)  — 没有 envelope 时当 stub/local 路径,跳过签名校验
//
// Stub 模式下所有方法返回假数据,通过 __stub: true 标记,业务代码据此走"模拟支付"路径。

const https = require('https');
const http = require('http');
const { URL } = require('url');
const { randomUUID } = require('crypto');
const config = require('./config.js');
const { sign, verify, nonce } = require('./sign.js');

// ========================================================
// HTTP 工具 (GET + POST)
// ========================================================
function httpRequest(method, urlStr, opts) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const lib = u.protocol === 'https:' ? https : http;
    const body = opts.body ? Buffer.from(opts.body, 'utf8') : null;
    const reqOpts = {
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + (u.search || ''),
      method,
      headers: {
        'Accept': 'application/json',
        ...(body ? { 'Content-Length': body.length } : {}),
        ...(opts.headers || {}),
      },
      timeout: opts.timeoutMs || config.timeoutMs,
    };
    const req = lib.request(reqOpts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let parsed;
        try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }
        if (res.statusCode >= 400) {
          const err = new Error(`HTTP ${res.statusCode}: ${text.slice(0, 200)}`);
          err.status = res.statusCode;
          err.body = parsed;
          return reject(err);
        }
        resolve(parsed);
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('request timeout')); });
    if (body) req.write(body);
    req.end();
  });
}

// ========================================================
// Token cache (in-memory; cf cold start 自动重新拿)
// ========================================================
let _cachedToken = null;
let _cachedExpireAtMs = 0;

async function getToken() {
  if (config.stub) {
    // stub 模式不真拿,每次返回一个假 token,业务代码不会用到
    return 'STUB_TOKEN_' + Date.now();
  }
  const now = Date.now();
  if (_cachedToken && now < _cachedExpireAtMs - config.tokenRefreshSkewMs) {
    return _cachedToken;
  }
  const resp = await httpRequest('GET', config.authUrl, {
    headers: {
      'X-AccessCode': config.accessCode,
      'X-SecretKey':  config.secretKey,
    },
  });
  if (!resp || resp.code !== '00000000') {
    const err = new Error(`authorize failed: ${resp && resp.code} ${resp && resp.msg}`);
    err.code = resp && resp.code;
    err.raw = resp;
    throw err;
  }
  _cachedToken = resp.data.token;
  _cachedExpireAtMs = now + (Number(resp.data.expireIn) || 7200) * 1000;
  return _cachedToken;
}

/** 测试用:重置 token 缓存 */
function _resetTokenCache() {
  _cachedToken = null;
  _cachedExpireAtMs = 0;
}

// ========================================================
// 业务 POST 通用封装(带签名)
// ========================================================
async function callApi(path, bizParams) {
  const jsonBody = JSON.stringify(bizParams);
  const token = await getToken();
  const headers = {
    'Content-Type': 'application/json',
    'X-AccessCode': config.accessCode,
    'Authorization': 'Bearer ' + token,
    'X-Signature': sign(jsonBody, config.secretKey),
  };
  return httpRequest('POST', config.apiBase + path, { body: jsonBody, headers });
}

// ========================================================
// ISO 8601 with offset (HuePay sample: 2026-05-19T18:00:00+0800, 无冒号)
// ========================================================
function isoWithOffset(d) {
  const pad = (n) => String(n).padStart(2, '0');
  const yyyy = d.getFullYear();
  const MM = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const HH = pad(d.getHours());
  const mm = pad(d.getMinutes());
  const ss = pad(d.getSeconds());
  const offMin = -d.getTimezoneOffset();  // 东 +
  const s = offMin >= 0 ? '+' : '-';
  const oh = pad(Math.floor(Math.abs(offMin) / 60));
  const om = pad(Math.abs(offMin) % 60);
  return `${yyyy}-${MM}-${dd}T${HH}:${mm}:${ss}${s}${oh}${om}`;
}

// ========================================================
// Public: createOrder (JSAPI)
// ========================================================
async function createOrder({ outTradeNo, amount, body, openid, clientIp, notifyUrl, returnUrl, expireMinutes, metadata }) {
  if (!outTradeNo) throw new Error('outTradeNo required');
  if (!amount || amount <= 0) throw new Error('amount must be > 0');
  if (!openid) throw new Error('openid required for JSAPI');

  if (config.stub) {
    return {
      payParams: {
        __stub: true,
        timeStamp: String(Math.floor(Date.now() / 1000)),
        nonceStr: nonce(),
        package: `prepay_id=STUB_${outTradeNo}`,
        signType: 'RSA',
        paySign: 'STUB_PAY_SIGN',
      },
      raw: {
        stub: true,
        outTradeNo,
        amount,
        currency: config.currency,
        openid,
        note: 'HuePay stub — set HUEPAY_STUB=0 for real call',
      },
    };
  }

  const expireTime = isoWithOffset(new Date(Date.now() + (expireMinutes || 30) * 60 * 1000));

  const reqBody = {
    requestId: randomUUID(),
    transactionOrderId: outTradeNo,
    amount: String(amount),                          // STRING in cents
    currency: config.currency,
    returnUrl: returnUrl || undefined,
    notificationUrl: notifyUrl || config.notifyUrl,
    expireTime,
    paymentMethod: {
      methodType: 'WECHATPAY',
      wechatpay: {
        acceptance: 'JSAPI',
        sponId: openid,
      },
    },
    products: [{ name: (body || 'order').slice(0, 128) }],
  };

  const resp = await callApi('/acquire/payment/create', reqBody);
  if (!resp || resp.code !== '00000000') {
    const err = new Error(`createOrder ${resp && resp.code}: ${resp && resp.msg}`);
    err.code = resp && resp.code;
    err.raw = resp;
    throw err;
  }

  // resp.data.nextAction.sdkData 是 JSON 编码的 STRING
  const data = resp.data || {};
  const nextAction = data.nextAction || {};
  let sdkData = {};
  if (nextAction.sdkData) {
    try { sdkData = JSON.parse(nextAction.sdkData); }
    catch (e) { console.warn('[huepay] sdkData parse failed:', e.message, nextAction.sdkData); }
  }
  return {
    payParams: {
      timeStamp: String(sdkData.timestamp || sdkData.timeStamp || Math.floor(Date.now() / 1000)),
      nonceStr: sdkData.nonceStr || sdkData.nonce_str || nonce(),
      package: sdkData.package || ('prepay_id=' + (data.transactionId || '')),
      signType: sdkData.signType || sdkData.sign_type || 'RSA',  // JSAPI 微信通常 RSA
      paySign: sdkData.paySign || sdkData.pay_sign,
    },
    raw: resp,
  };
}

// ========================================================
// Public: queryOrder
//
// 文档里"查询订单"端点字段还未单独给到,沿用 /acquire/payment 命名约定先填。
// 上线前若 HuePay 给的查询接口路径不同,改这两个常量即可。
// ========================================================
async function queryOrder({ outTradeNo }) {
  if (!outTradeNo) throw new Error('outTradeNo required');

  if (config.stub) {
    const paid = Math.random() < 0.5;
    return {
      paid,
      status: paid ? 'SUCCEED' : 'PENDING',
      transactionId: paid ? 'STUB_TX_' + outTradeNo : null,
      paidAt: paid ? new Date().toISOString() : null,
      amount: null,
      raw: { stub: true },
    };
  }

  const reqBody = { transactionOrderId: outTradeNo };
  const resp = await callApi('/acquire/payment/query', reqBody);
  if (!resp || resp.code !== '00000000') {
    const err = new Error(`queryOrder ${resp && resp.code}: ${resp && resp.msg}`);
    err.code = resp && resp.code;
    err.raw = resp;
    throw err;
  }
  const d = resp.data || {};
  const status = (d.status || '').toUpperCase();
  const paid = status === 'SUCCEED' || status === 'SUCCESS' || status === 'PAID';
  return {
    paid,
    status: d.status,
    transactionId: d.transactionId || null,
    paidAt: d.paidAt || d.payTime || null,
    amount: d.amount != null ? Number(d.amount) : null,
    raw: resp,
  };
}

// ========================================================
// Public: refund
//
// 同上,退款端点路径待文档确认;按命名约定先写 /acquire/payment/refund。
// ========================================================
async function refund({ outTradeNo, refundNo, refundAmount, reason }) {
  if (!outTradeNo || !refundNo || !refundAmount) {
    throw new Error('outTradeNo, refundNo, refundAmount required');
  }

  if (config.stub) {
    return {
      success: true,
      refundId: 'STUB_REFUND_' + refundNo,
      raw: { stub: true, outTradeNo, refundNo, refundAmount, reason },
    };
  }

  const reqBody = {
    requestId: randomUUID(),
    transactionOrderId: outTradeNo,
    refundOrderId: refundNo,
    refundAmount: String(refundAmount),
    currency: config.currency,
    reason: reason || '',
  };
  const resp = await callApi('/acquire/payment/refund', reqBody);
  if (!resp || resp.code !== '00000000') {
    const err = new Error(`refund ${resp && resp.code}: ${resp && resp.msg}`);
    err.code = resp && resp.code;
    err.raw = resp;
    throw err;
  }
  const d = resp.data || {};
  return { success: true, refundId: d.transactionId || d.refundId || null, raw: resp };
}

// ========================================================
// Public: verifyCallback
//
// 新契约: ({ rawBody, headerSignature, parsed }) — rawBody+headerSignature 用来对签
// 老契约: (parsedBody) — 仅 stub/local 路径(simulatePay 内部模拟回调),跳过签名
// ========================================================
function verifyCallback(input) {
  // 兼容:无 envelope 时把入参当 parsed 直接看
  let rawBody, headerSignature, parsed;
  if (input && typeof input === 'object' && ('rawBody' in input || 'headerSignature' in input || 'parsed' in input)) {
    rawBody = input.rawBody;
    headerSignature = input.headerSignature;
    parsed = input.parsed;
  } else {
    parsed = input;
    rawBody = null;
    headerSignature = null;
  }

  if (!parsed || typeof parsed !== 'object') {
    return { valid: false, reason: 'empty body' };
  }

  // Stub 模式:接受任何带 __stub 的 body(测试/dev/simulatePay 用)
  if (config.stub && parsed.__stub) {
    return {
      valid: true,
      outTradeNo: parsed.transactionOrderId || parsed.outTradeNo || parsed.out_trade_no,
      transactionId: parsed.transactionId || parsed.transaction_id || 'STUB_TX',
      paidAt: parsed.paidAt || parsed.paid_at || new Date().toISOString(),
      amount: parsed.amount != null ? Number(parsed.amount) : null,
      status: (parsed.status || 'SUCCESS').toUpperCase(),
      raw: parsed,
    };
  }

  // 真实模式:必须有 rawBody + X-Signature header,否则拒
  if (!rawBody || !headerSignature) {
    return { valid: false, reason: 'missing rawBody or X-Signature header', raw: parsed };
  }
  if (!verify(rawBody, headerSignature, config.secretKey)) {
    return { valid: false, reason: 'bad signature', raw: parsed };
  }

  const status = (parsed.status || '').toUpperCase();
  return {
    valid: true,
    outTradeNo: parsed.transactionOrderId,
    transactionId: parsed.transactionId || null,
    paidAt: parsed.paidAt || parsed.payTime || null,
    amount: parsed.amount != null ? Number(parsed.amount) : null,
    status,
    raw: parsed,
  };
}

module.exports = {
  createOrder,
  queryOrder,
  refund,
  verifyCallback,
  // 测试用 hooks
  _sign: sign,
  _verify: verify,
  _resetTokenCache,
  _config: config,
  _isoWithOffset: isoWithOffset,
};
