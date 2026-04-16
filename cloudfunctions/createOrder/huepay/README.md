# HuePay SDK

轻量级 HuePay 聚合支付客户端。当前为**骨架版** — 支持 stub 模式在没有真实凭证时也能跑完整链路。

## 使用

```js
const huepay = require('./huepay');

// 下单
const { payParams, raw } = await huepay.createOrder({
  outTradeNo: 'TRADE123',
  amount: 1998,          // AUD 分
  body: '接龙团购',
  openid: 'user_openid',
  notifyUrl: 'https://your-domain/cloud/payCallback',  // 可选,默认读 config
});
// payParams 直接传给小程序 wx.requestPayment

// 查单(兜底)
const q = await huepay.queryOrder({ outTradeNo: 'TRADE123' });
if (q.paid) { /* update order */ }

// 退款
await huepay.refund({
  outTradeNo: 'TRADE123', refundNo: 'R123', refundAmount: 1998, reason: '用户取消',
});

// 回调验签(payCallback 云函数内)
const v = huepay.verifyCallback(req.body);
if (!v.valid) return 401;
```

## 环境变量

| Key | 用途 | Stub 默认 |
|---|---|---|
| `HUEPAY_STUB` | `1`=stub 模式 / `0`=真实 | `1` |
| `HUEPAY_API_BASE` | HuePay API 基址 | `https://api.huepay.com.au` |
| `HUEPAY_MERCHANT_ID` | 商户号 | `STUB_MERCHANT` |
| `HUEPAY_APP_ID` | 小程序应用 ID | `STUB_APPID` |
| `HUEPAY_API_KEY` | API Key | `STUB_APIKEY` |
| `HUEPAY_SECRET` | 签名密钥 | `STUB_SECRET_REPLACE_ME` |
| `HUEPAY_SIGN_ALGO` | `HMAC-SHA256` / `MD5` / `SHA256` | `HMAC-SHA256` |
| `HUEPAY_NOTIFY_URL` | 回调 URL(公网) | `http://localhost:4000/cloud/payCallback` |
| `HUEPAY_CURRENCY` | 结算币种 | `AUD` |

## 拿到 HuePay 文档后需改的地方

按优先级:

1. **`config.js` 的 `HUEPAY_API_BASE`** — 改成文档里的生产/沙箱地址
2. **`index.js` 的 `/api/v1/orders/create` 等路径** — 按文档改
3. **`sign.js` 的签名算法** — HuePay 很可能用 HMAC-SHA256,如果是 RSA 或其他改这里
4. **`createOrder` 返回字段映射** — 文档的 prepay_id/pay_sign 字段名可能叫别的
5. **`verifyCallback` 的状态字段** — HuePay 用 `status` 还是 `trade_status`,paid 值是 `SUCCESS` 还是 `1`

## 签名规则(默认)

1. 剔除 `sign`、null、undefined、空字符串字段
2. 按 key ASCII 升序排序
3. 拼接 `key1=value1&key2=value2&...`
4. HMAC-SHA256 用 `HUEPAY_SECRET` 做 key 生成 hex 大写

## Stub 模式

- `createOrder` 返回 `payParams.__stub = true`,业务代码据此跳过真实 `wx.requestPayment`
- `queryOrder` 随机返回 paid/unpaid(便于测试)
- `verifyCallback` 接受带 `__stub: true` 的回调体
- **所有 HTTP 都不发**,纯内存
