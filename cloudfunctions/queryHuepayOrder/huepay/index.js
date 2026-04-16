// _lib/huepay/index.js - HuePay SDK
//
// 暴露:
//   createOrder({ outTradeNo, amount, body, openid, clientIp?, notifyUrl?, metadata? })
//     → { payParams, raw }   — payParams 传给小程序 wx.requestPayment
//
//   queryOrder({ outTradeNo })
//     → { paid, status, transactionId, paidAt, amount, raw }
//
//   refund({ outTradeNo, refundNo, refundAmount, reason? })
//     → { success, refundId, raw }
//
//   verifyCallback(body)
//     → { valid, outTradeNo, transactionId, paidAt, amount, raw }
//
// Stub 模式下所有方法返回假数据,通过 __stub: true 标记,业务代码可据此决定走"模拟支付成功"路径。
// 真实模式下发真实 HTTP 到 config.apiBase。接入 HuePay 时只需核对端点路径和字段名。

const https = require('https');
const http = require('http');
const { URL } = require('url');
const config = require('./config.js');
const { sign, verify, nonce } = require('./sign.js');

// ---------- HTTP 工具 ----------
function httpPost(urlStr, body, timeoutMs) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const client = u.protocol === 'https:' ? https : http;
    const data = Buffer.from(JSON.stringify(body));
    const req = client.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname + u.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': data.length,
          'Accept': 'application/json',
        },
        timeout: timeoutMs || 20000,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let parsed;
          try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }
          if (res.statusCode >= 400) {
            const err = new Error(`HTTP ${res.statusCode}`);
            err.status = res.statusCode;
            err.body = parsed;
            return reject(err);
          }
          resolve(parsed);
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('request timeout')); });
    req.write(data);
    req.end();
  });
}

// ---------- 请求封装 ----------
// 统一:加公共字段 + 签名,返回解析后的 body
async function callApi(path, bizParams) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    merchant_id: config.merchantId,
    app_id: config.appId,
    api_key: config.apiKey,
    nonce_str: nonce(),
    timestamp: now,
    ...bizParams,
  };
  payload.sign = sign(payload, config.secret, config.signAlgo);

  return httpPost(config.apiBase + path, payload, config.timeoutMs);
}

// ========================================================
// Public API
// ========================================================

/**
 * 下单
 * @returns {Promise<{ payParams: object, raw: object }>}
 *   payParams 直接传给小程序的 wx.requestPayment
 */
async function createOrder({ outTradeNo, amount, body, openid, clientIp, notifyUrl, metadata }) {
  if (!outTradeNo) throw new Error('outTradeNo required');
  if (!amount || amount <= 0) throw new Error('amount must be > 0');

  if (config.stub) {
    // Stub 模式:返回带 __stub 标记的 payParams,业务代码走"模拟支付"路径
    return {
      payParams: {
        __stub: true,
        timeStamp: String(Math.floor(Date.now() / 1000)),
        nonceStr: nonce(),
        package: `prepay_id=STUB_${outTradeNo}`,
        signType: 'HMAC-SHA256',
        paySign: 'STUB_PAY_SIGN',
      },
      raw: {
        stub: true,
        outTradeNo,
        amount,
        currency: config.currency,
        note: 'HuePay stub — real integration 待凭证到位',
      },
    };
  }

  // 真实模式:路径和字段名**以 HuePay 文档为准**,目前是通用聚合支付的猜想
  const resp = await callApi('/api/v1/orders/create', {
    out_trade_no: outTradeNo,
    amount,                      // 整数分
    currency: config.currency,
    body: (body || '').slice(0, 128),
    openid,
    client_ip: clientIp || '127.0.0.1',
    notify_url: notifyUrl || config.notifyUrl,
    channel: config.defaultChannel,
    trade_type: config.defaultTradeType,
    metadata: metadata || undefined,
  });

  if (resp.code !== 0 && resp.code !== '0' && resp.code !== 'SUCCESS') {
    const err = new Error(resp.message || 'HuePay createOrder failed');
    err.code = resp.code;
    err.raw = resp;
    throw err;
  }

  // HuePay 假设返回 data:{prepay_id, app_id, timestamp, nonce_str, package, sign_type, pay_sign}
  const d = resp.data || {};
  return {
    payParams: {
      timeStamp: String(d.timestamp || Math.floor(Date.now() / 1000)),
      nonceStr: d.nonce_str || nonce(),
      package: d.package || `prepay_id=${d.prepay_id}`,
      signType: d.sign_type || 'HMAC-SHA256',
      paySign: d.pay_sign,
    },
    raw: resp,
  };
}

/**
 * 查单
 */
async function queryOrder({ outTradeNo }) {
  if (!outTradeNo) throw new Error('outTradeNo required');

  if (config.stub) {
    // Stub:50% 概率"已支付",便于测试两种分支
    const paid = Math.random() < 0.5;
    return {
      paid,
      status: paid ? 'SUCCESS' : 'NOTPAY',
      transactionId: paid ? 'STUB_TX_' + outTradeNo : null,
      paidAt: paid ? new Date().toISOString() : null,
      amount: null,
      raw: { stub: true },
    };
  }

  const resp = await callApi('/api/v1/orders/query', { out_trade_no: outTradeNo });
  const d = resp.data || {};
  const paid = d.status === 'SUCCESS' || d.status === 'PAID';
  return {
    paid,
    status: d.status,
    transactionId: d.transaction_id || null,
    paidAt: d.paid_at || null,
    amount: d.amount || null,
    raw: resp,
  };
}

/**
 * 退款
 */
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

  const resp = await callApi('/api/v1/refunds/create', {
    out_trade_no: outTradeNo,
    refund_no: refundNo,
    refund_amount: refundAmount,
    reason: reason || '',
  });

  if (resp.code !== 0 && resp.code !== '0' && resp.code !== 'SUCCESS') {
    const err = new Error(resp.message || 'HuePay refund failed');
    err.raw = resp;
    throw err;
  }

  const d = resp.data || {};
  return { success: true, refundId: d.refund_id || null, raw: resp };
}

/**
 * 验证 HuePay 异步回调的签名和业务数据,返回标准化结构
 * @param {object} body - HuePay POST 过来的原始 JSON body
 */
function verifyCallback(body) {
  if (!body || typeof body !== 'object') {
    return { valid: false, reason: 'empty body' };
  }

  // Stub:接受任何带 __stub 标记的回调
  if (config.stub && body.__stub) {
    return {
      valid: true,
      outTradeNo: body.out_trade_no || body.outTradeNo,
      transactionId: body.transaction_id || body.transactionId || 'STUB_TX',
      paidAt: body.paid_at || new Date().toISOString(),
      amount: body.amount,
      status: 'SUCCESS',
      raw: body,
    };
  }

  // 验签
  if (!verify(body, config.secret, config.signAlgo)) {
    return { valid: false, reason: 'bad signature', raw: body };
  }

  // 字段白名单(HuePay 文档确认后核对)
  const status = body.status || body.trade_status;
  return {
    valid: true,
    outTradeNo: body.out_trade_no,
    transactionId: body.transaction_id || null,
    paidAt: body.paid_at || null,
    amount: body.amount,
    status,
    raw: body,
  };
}

module.exports = {
  createOrder,
  queryOrder,
  refund,
  verifyCallback,
  // 内部工具,便于测试
  _sign: sign,
  _config: config,
};
