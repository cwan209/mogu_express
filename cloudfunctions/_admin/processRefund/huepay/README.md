# HuePay SDK

HuePay 澳洲跨境聚合支付客户端,对齐 **HuePay 2026.05 真接入文档**。
Stub 模式下无凭证也能跑通完整链路。

## 业务场景

本项目面向澳洲华人社区跨境团购:

- 顾客小程序内点付款 → HuePay JSAPI → 微信支付
- 顾客付 AUD,商家直接收 AUD(都是澳洲本地)
- HuePay 走澳洲牌照清算

## API 设计(2-stage 认证)

### Stage 1: 拿 JWT token
- `GET https://gw.huepay.com.au/authorize` (prod)
- `GET https://uatgw.huepay.com.au/authorize` (uat)
- Headers: `X-AccessCode` (32 chars), `X-SecretKey` (2048 chars)
- 响应 `{ code: "00000000", data: { token, expireIn } }`,内部缓存,过期前 60s 重新拿

### Stage 2: 业务 POST
- Base: `https://gw.huepay.com.au/api`  (prod) / `https://uatgw.huepay.com.au/api` (uat)
- 每次 POST 必带:
  - `Content-Type: application/json`
  - `X-AccessCode: <accessCode>`
  - `Authorization: Bearer <jwt token>`
  - `X-Signature: MD5HEX(rawBody + secretKey)`

### 签名规则
```js
crypto.createHash('md5').update(jsonBody + secretKey, 'utf8').digest('hex')
// 返回 32 字符小写 hex,与 Java DigestUtils.md5Hex 一致
```

## 使用

```js
const huepay = require('./huepay');

// 下单(amount 单位:分(cents)整数,内部转 STRING)
const { payParams, raw } = await huepay.createOrder({
  outTradeNo: 'TRADE_1234',
  amount: 1999,                  // $19.99 AUD
  body: '接龙团购 · 塔斯马尼亚蓝莓',
  openid: 'user_openid',
  notifyUrl: 'https://your-domain/cloud/payCallback',
  returnUrl: 'https://your-domain/order/success',   // optional
  expireMinutes: 30,
});
// payParams = { timeStamp, nonceStr, package, signType, paySign } → wx.requestPayment

// 查单(兜底)
const q = await huepay.queryOrder({ outTradeNo: 'TRADE_1234' });
if (q.paid) { /* update order */ }

// 退款
await huepay.refund({
  outTradeNo: 'TRADE_1234', refundNo: 'REF_1234',
  refundAmount: 1999, reason: '用户取消',
});

// 回调验签(payCallback 云函数内)
const v = huepay.verifyCallback({
  rawBody: rawString,            // express middleware 捕获的原始 body string
  headerSignature: req.headers['x-signature'],
  parsed: req.body,              // 已 JSON.parse 的对象
});
if (!v.valid) return 401;
```

## 环境变量

| Key | 用途 | 默认 |
|---|---|---|
| `HUEPAY_STUB` | `1`=stub 模式 / `0`=真实 | `1` |
| `HUEPAY_ENV` | `prod` / `uat` | `uat` |
| `HUEPAY_ACCESS_CODE` | HuePay 分配的 X-AccessCode | `STUB_ACCESS_CODE` |
| `HUEPAY_SECRET_KEY` | HuePay 分配的 X-SecretKey(亦做签名密钥) | `STUB_SECRET_KEY` |
| `HUEPAY_NOTIFY_URL` | 回调 URL(公网 HTTPS) | `http://localhost:4000/cloud/payCallback` |
| `HUEPAY_CURRENCY` | 收单币种(目前只支持 AUD) | `AUD` |

> 旧 env(`HUEPAY_MERCHANT_ID` / `HUEPAY_APP_ID` / `HUEPAY_API_KEY` / `HUEPAY_SECRET` / `HUEPAY_SIGN_ALGO` / `HUEPAY_API_BASE`)已废弃。

## 错误码

| Code | 含义 |
|---|---|
| `00000000` | 成功 |
| `01100601` | 错误请求 |
| `01100603` | 商户状态有误 |
| `01100610` | 订单进行中, 勿重复支付 |
| `01100611` | 订单状态有误 |
| `01100613` | 资源不存在 |
| `01100615` | 订单已支付(幂等指示) |
| `01100699` | 系统异常 |

## Stub 模式

- `createOrder` 返回 `payParams.__stub = true`,小程序据此跳过真 `wx.requestPayment`
- `queryOrder` 随机返回 paid/unpaid(便于测试两种分支)
- `verifyCallback` 接受任何带 `__stub: true` 的回调体,跳过签名校验
- 不发任何 HTTP,纯内存,可在 CI / 离线 dev 跑

## 上线步骤

1. 凭证拿到位后,在 docker-compose 注入真 env:
```yaml
environment:
  HUEPAY_STUB: "0"
  HUEPAY_ENV: "uat"        # 先 uat 跑通,再切 prod
  HUEPAY_ACCESS_CODE: <32 char>
  HUEPAY_SECRET_KEY:  <2048 char>
  HUEPAY_NOTIFY_URL:  https://api.your-domain/cloud/payCallback
```
2. UAT 跑通 0.01 AUD 端到端 → 切 `HUEPAY_ENV=prod`。
3. 回调 URL 必须公网 HTTPS,HuePay 后台配。

## 限制

- amount: STRING (cents),所以 SDK 内 `String(amountInt)`
- currency: 目前只 AUD
- expireTime 格式: `yyyy-MM-ddTHH:mm:ss±HHMM`(offset 无冒号)
- transactionOrderId: `^[A-Za-z0-9_-]+$`, ≤ 64 chars(现行 `TRADE...` / `SHIP...` 模式 OK)
