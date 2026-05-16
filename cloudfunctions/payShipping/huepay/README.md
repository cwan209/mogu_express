# HuePay SDK

HuePay 澳洲持牌跨境聚合支付客户端。**当前为骨架版**,stub 模式下无真实凭证也能跑通完整链路。

## 为什么用 HuePay(业务场景)

本项目面向**澳洲华人社区跨境团购**:

- **顾客**:多在中国大陆(或澳洲),通过小程序下单
- **支付**:顾客用**微信支付 / 支付宝**付款,**货币 CNY(人民币)** ← `currency: 'CNY'`
- **商家(团长)**:澳洲本地商家,**最终收到 AUD**
- **HuePay**:处理跨境,负责 CNY 收单 → 合规清算 → 按汇率折算后打 AUD 到商家银行账户

整体流程:
```
顾客小程序 ──CNY 预支付单──→ HuePay
                              ↓ 调起微信/支付宝
                              ↓ 扣款 ¥19.99
                              ↓ 跨境清算 T+N
                              ↓ 汇率折算 + 手续费
                              ↓
                   澳洲商家银行账户(AUD)入账
```

所以 SDK 的 `createOrder` 入参 `amount` 是**顾客付款的 CNY 金额(分)**,不是 AUD。HuePay 回调的金额也是 CNY。AUD 结算金额在 HuePay 商户后台才能看到。

## 使用

```js
const huepay = require('./huepay');

// 下单(金额单位:CNY 分)
const { payParams, raw } = await huepay.createOrder({
  outTradeNo: 'TRADE123',
  amount: 1999,          // ¥19.99
  body: '接龙团购 · 塔斯马尼亚蓝莓',
  openid: 'user_openid',
  notifyUrl: 'https://your-domain/cloud/payCallback',
});
// payParams 直接传给小程序 wx.requestPayment(调起微信支付)

// 查单(兜底)
const q = await huepay.queryOrder({ outTradeNo: 'TRADE123' });
if (q.paid) { /* update order */ }

// 退款(金额仍是 CNY 分)
await huepay.refund({
  outTradeNo: 'TRADE123', refundNo: 'R123', refundAmount: 1999, reason: '用户取消',
});

// 回调验签(payCallback 云函数内)
const v = huepay.verifyCallback(req.body);
if (!v.valid) return 401;
```

## 环境变量

| Key | 用途 | 默认 |
|---|---|---|
| `HUEPAY_STUB` | `1`=stub 模式 / `0`=真实 | `1` |
| `HUEPAY_API_BASE` | HuePay API 基址 | `https://api.huepay.com.au` |
| `HUEPAY_MERCHANT_ID` | 商户号(HuePay 分配) | `STUB_MERCHANT` |
| `HUEPAY_APP_ID` | 小程序应用 ID(与微信 AppID 关联) | `STUB_APPID` |
| `HUEPAY_API_KEY` | API Key | `STUB_APIKEY` |
| `HUEPAY_SECRET` | 签名密钥 | `STUB_SECRET_REPLACE_ME` |
| `HUEPAY_SIGN_ALGO` | `HMAC-SHA256` / `MD5` / `SHA256` | `HMAC-SHA256` |
| `HUEPAY_NOTIFY_URL` | 回调 URL(公网 HTTPS) | `http://localhost:4000/cloud/payCallback` |
| `HUEPAY_CURRENCY` | **收单币种**(顾客付款币种) | `CNY` |

> **货币说明**:`HUEPAY_CURRENCY` 是**收单币种**(顾客怎么付),中国大陆用户小程序内走微信/支付宝,就是 `CNY`。
> **商户结算币种**(AUD)由 HuePay 商户协议决定,不在 SDK 里配,也不影响小程序侧逻辑。

## 拿到 HuePay 文档后需改的地方

按优先级:

1. **`config.js` 的 `HUEPAY_API_BASE`** — 改成文档里的生产/沙箱地址
2. **`index.js` 的 `/api/v1/orders/create` 等路径** — 按文档改
3. **`sign.js` 的签名算法** — HuePay 多半是 HMAC-SHA256,若是 RSA 或别的改这里
4. **`createOrder` 返回字段映射** — 文档里 `prepay_id` / `pay_sign` 字段名可能叫别的
5. **`verifyCallback` 的状态字段** — HuePay 用 `status` 还是 `trade_status`,paid 值是 `SUCCESS` 还是 `1`

## 签名规则(默认)

1. 剔除 `sign`、null、undefined、空字符串字段
2. 按 key ASCII 升序排序
3. 拼接 `key1=value1&key2=value2&...`
4. HMAC-SHA256 用 `HUEPAY_SECRET` 做 key 生成 hex 大写

## Stub 模式

- `createOrder` 返回 `payParams.__stub = true`,业务代码据此跳过真实 `wx.requestPayment`
- `queryOrder` 随机返回 paid/unpaid(便于测试两种分支)
- `verifyCallback` 接受带 `__stub: true` 的回调体
- **所有 HTTP 都不发**,纯内存,便于 CI / 离线开发

## 上线前最后一步

商户资质拿到位后:

```yaml
# docker-compose.yml(api 服务)
environment:
  HUEPAY_STUB: "0"
  HUEPAY_API_BASE: https://api.huepay.com.au
  HUEPAY_MERCHANT_ID: <真实商户号>
  HUEPAY_APP_ID: <小程序 AppID>
  HUEPAY_API_KEY: <Key>
  HUEPAY_SECRET: <Secret>
  HUEPAY_NOTIFY_URL: https://api.your-domain/cloud/payCallback
```

沙箱环境先跑通 0.01 元端到端 → 切生产凭证。
