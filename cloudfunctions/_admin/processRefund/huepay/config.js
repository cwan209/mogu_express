// _lib/huepay/config.js
//
// 真 HuePay 接入配置(2026.05 文档对齐版本)。
// 2-stage auth: GET /authorize 拿 JWT → 业务 POST 用 Bearer。
//
// Env vars (.env 通过 docker-compose 注入):
//   HUEPAY_STUB=0|1                    stub 模式(默认 1, prod 上线切 0)
//   HUEPAY_ENV=prod|uat                决定 gw URL(默认 uat, 上线手动切 prod)
//   HUEPAY_ACCESS_CODE=<32 char>       Huepay 分配的 X-AccessCode
//   HUEPAY_SECRET_KEY=<2048 char>      Huepay 分配的 X-SecretKey,亦作签名密钥
//   HUEPAY_NOTIFY_URL=https://api.../cloud/payCallback   异步通知地址
//   HUEPAY_CURRENCY=AUD                收单币种(HuePay 当前只支持 AUD)
//
// 旧 env(MERCHANT_ID/APP_ID/API_KEY/SECRET/SIGN_ALGO/API_BASE)已废弃,
// 部署时若仍设置不会读取,推荐从 docker-compose 删除。

function envBool(name, defVal) {
  const v = process.env[name];
  if (v == null || v === '') return defVal;
  return v === '1' || v.toLowerCase() === 'true';
}

const ENV = (process.env.HUEPAY_ENV || 'uat').toLowerCase();

const URL_BASES = {
  prod: { auth: 'https://gw.huepay.com.au/authorize',    api: 'https://gw.huepay.com.au/api' },
  uat:  { auth: 'https://uatgw.huepay.com.au/authorize', api: 'https://uatgw.huepay.com.au/api' },
};

const bases = URL_BASES[ENV] || URL_BASES.uat;

const config = {
  // stub=true 时:SDK 返回假数据,绕过真实 HTTP 请求
  stub: envBool('HUEPAY_STUB', true),
  env: ENV,

  // 两个 base 是分开的:authorize 不带 /api;业务全在 /api 下
  authUrl:  process.env.HUEPAY_AUTH_URL || bases.auth,
  apiBase:  process.env.HUEPAY_API_BASE || bases.api,

  accessCode: process.env.HUEPAY_ACCESS_CODE || 'STUB_ACCESS_CODE',
  secretKey:  process.env.HUEPAY_SECRET_KEY  || 'STUB_SECRET_KEY',
  notifyUrl:  process.env.HUEPAY_NOTIFY_URL  || 'http://localhost:4000/cloud/payCallback',

  // HuePay 当前规范只支持 AUD,留 env 以便将来支持
  currency:   process.env.HUEPAY_CURRENCY    || 'AUD',

  // 请求超时
  timeoutMs:  20000,
  // Token cache:剩余有效期低于此时刷新
  tokenRefreshSkewMs: 60 * 1000,
};

module.exports = config;
