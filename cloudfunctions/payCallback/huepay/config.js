// _lib/huepay/config.js
// HuePay 接入配置。所有值从环境变量读,支持 stub 模式。
//
// 真实上线时,在云函数"环境变量"或部署环境(Docker/VPS)里设置:
//   HUEPAY_STUB=0
//   HUEPAY_API_BASE=https://api.huepay.com.au   (示例,需以真实文档为准)
//   HUEPAY_MERCHANT_ID=<商户号>
//   HUEPAY_APP_ID=<小程序应用 ID>
//   HUEPAY_API_KEY=<API Key>
//   HUEPAY_SECRET=<密钥,用于签名>
//   HUEPAY_SIGN_ALGO=HMAC-SHA256  (当前假设;HuePay 文档到位后确认)
//   HUEPAY_NOTIFY_URL=https://your-domain/cloud/payCallback
//
// 测试/开发阶段保持 stub=1 就能跑完完整流程,不需要任何真实凭证。

function envBool(name, defVal) {
  const v = process.env[name];
  if (v == null || v === '') return defVal;
  return v === '1' || v.toLowerCase() === 'true';
}

const config = {
  // stub=true 时:SDK 返回假数据,绕过真实 HTTP 请求
  stub: envBool('HUEPAY_STUB', true),

  apiBase:    process.env.HUEPAY_API_BASE    || 'https://api.huepay.com.au',
  merchantId: process.env.HUEPAY_MERCHANT_ID || 'STUB_MERCHANT',
  appId:      process.env.HUEPAY_APP_ID      || 'STUB_APPID',
  apiKey:     process.env.HUEPAY_API_KEY     || 'STUB_APIKEY',
  secret:     process.env.HUEPAY_SECRET      || 'STUB_SECRET_REPLACE_ME',
  signAlgo:   process.env.HUEPAY_SIGN_ALGO   || 'HMAC-SHA256',
  notifyUrl:  process.env.HUEPAY_NOTIFY_URL  || 'http://localhost:4000/cloud/payCallback',
  currency:   process.env.HUEPAY_CURRENCY    || 'CNY',

  // 支付渠道(wechat / alipay / card)
  defaultChannel: 'wechat',
  // 子渠道(wechat jsapi / alipay h5 等)
  defaultTradeType: 'JSAPI',

  // 请求超时(毫秒)
  timeoutMs: 20000,
};

module.exports = config;
