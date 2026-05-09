# 微信云开发迁移指南

**适用条件**:已拿到正式企业小程序 AppID(本项目 `wx2215d63c22d8e947`),可开通微信云开发。

> 测试号 AppID 永远无法开通云开发,只能继续走 `local-backend/` Docker 路径。

---

## 阶段 A — AppID 替换(已完成)

- [x] `project.config.json`: `appid` → `wx2215d63c22d8e947`
- [x] 删 `project.private.config.json`(开发者工具按新 AppID 重生)
- [x] `miniprogram/config/index.js` 加注释,标记 cloudEnvId 待填

**验证**:开发者工具能用新 AppID 打开项目,首页能正常显示团列表(走 `useHttpBackend` 或 mock)。开发者工具会要求重新登录,扫企业账号即可。

---

## 阶段 B — 开通云开发(用户操作,~10 分钟)

1. 微信开发者工具 → 右上角 **「云开发」** 按钮 → 开通
2. 选择**地域:上海**(顾客在国内,延迟最低)
3. 套餐:**基础版 ¥19.9/月**(2GB DB / 5GB 存储 / 200 万次函数调用)
4. 复制 **环境 ID**(类似 `mogu-express-2gXXXXX`)

把 envId 告诉开发,进入阶段 C。

---

## 阶段 C — 云函数 + 数据库初始化(1-2 天)

### C.1 安装并登录 cloudbase-cli

```bash
npm i -g @cloudbase/cli
tcb login                  # 扫码授权
```

### C.2 同步 _lib 共享代码 + 部署所有云函数

```bash
node scripts/sync-lib.js   # 把 _lib/auth/jwt.js + _lib/huepay/ 拷到各 _admin/* 目录
CLOUD_ENV_ID=mogu-express-2gXXXXX ./scripts/deploy-cf.sh
```

子目录函数(如 `_admin/listAllOrders`)在云端注册名是 `_admin_listAllOrders`(下划线展平)。

### C.3 添加 HTTP 触发器

云开发控制台 → 云函数 → 选中函数 → **触发器** 面板 → 添加 HTTP 触发:

- `payCallback` — HuePay 回调入口(给 HuePay 后台填这个 URL)
- `_admin_*` — Web 后台调用入口(全部 23 个 admin 函数)

记下生成的 URL,例如 `https://service-XXX.ap-shanghai.tcloudbasegateway.com/<fn>`。

### C.4 配置环境变量

云开发控制台 → 环境配置 → 环境变量,逐个添加:

```
JWT_SECRET            <随机 32+ 字符>
ADMIN_OPENIDS         <团长 openid,逗号分隔>
HUEPAY_STUB           1                          # 没拿到凭证前用 stub
HUEPAY_MERCHANT_ID    <来自 HuePay>
HUEPAY_APP_ID         <来自 HuePay>
HUEPAY_API_KEY        <来自 HuePay>
HUEPAY_SECRET         <来自 HuePay>
HUEPAY_NOTIFY_URL     https://service-XXX.../payCallback
```

### C.5 创建数据库集合 + 索引

云开发控制台 → 数据库 → 新建集合(11 个):

`users` `addresses` `admins` `categories` `tuans` `tuanItems` `catalogProducts` `carts` `orders` `pay_logs` `participant_index`

索引(逐集合添加):

| 集合 | 字段 | 类型 |
|---|---|---|
| `users` | `_openid` | unique |
| `addresses` | `_openid` | normal |
| `admins` | `username` | unique |
| `tuans` | `status, endAt` | composite |
| `tuanItems` | `tuanId, sort` | composite |
| `tuanItems` | `productId` | normal |
| `orders` | `_openid, createdAt` | composite |
| `orders` | `outTradeNo` | unique |
| `orders` | `status, createdAt` | composite |
| `carts` | `_openid` | unique |

### C.6 创建初始管理员

```bash
node -e "const {hashPassword} = require('./cloudfunctions/_lib/auth/jwt'); console.log(hashPassword('改成真密码'))"
```

云开发数据库 → admins 集合 → 新建文档:

```json
{
  "openid": "<团长真实 openid>",
  "username": "owner",
  "passwordHash": "pbkdf2$...",
  "role": "owner",
  "createdAt": "2026-04-19T00:00:00.000Z"
}
```

### C.7 灌种子数据(可选)

把 `local-backend/api/seed.js` 改写成云开发版,或手动在数据库面板加几条 `categories` / `tuans` / `tuanItems` 测试数据。

### C.8 切小程序到云开发

`miniprogram/config/index.js`:

```js
useMock: false,
useHttpBackend: false,           // 关闭 HTTP,改走 wx.cloud
cloudEnvId: 'mogu-express-2gXXXXX',
```

**验证**:小程序端到端 — 顾客下单 → 云数据库 orders 出现记录 → 团长 Web 后台看得到。

---

## 阶段 D — Web 后台对接云开发(0.5-1 天)

### D.1 改 API 客户端

`web-admin/.env.production`:
```
VITE_USE_MOCK=false
VITE_API_BASE=https://service-XXX.ap-shanghai.tcloudbasegateway.com
```

`web-admin/src/api/client.ts` 的 `callCloud` URL 拼接:`${API_BASE}/${name.replace('/', '_')}`(把 `_admin/listAllOrders` 转 `_admin_listAllOrders`)。

### D.2 CORS

各 `_admin_*` 云函数响应头加:

```js
return {
  statusCode: 200,
  headers: {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  },
  body: JSON.stringify(...)
};
```

### D.3 部署到云开发静态托管

```bash
cd web-admin
npm run build
tcb hosting deploy dist -e $CLOUD_ENV_ID
```

绑定自有域名(可选)。

**验证**:浏览器打开静态托管 URL → 用 owner 账号登录 → Dashboard / 订单 / 导出 Excel 全部正常。

---

## 阶段 E — HuePay 真凭证 + 提审(等 HuePay,~1-2 周)

1. 拿到 HuePay 凭证 → 替换环境变量(C.4 那 5 项)+ 设 `HUEPAY_STUB=0`
2. 把 payCallback 的 HTTP URL 给 HuePay 商务,在他们后台填
3. 沙箱跑 ¥0.01 端到端 → 切生产
4. 微信公众平台:
   - 服务器域名 → 加 HuePay 域名
   - 类目 → 生活服务/团购
   - 用户协议 + 隐私协议
5. 提交体验版给团长内测 → 提审 → 1-2 周排队 → 上线

---

## 风险清单

1. **云开发事务语义**:`createOrder` 用 `runTransaction`,云开发是真乐观锁,部署后必须人为制造并发下单 stock=1 商品场景验证
2. **wxacode 配额**:基础版限速 100 次/分钟,海报二维码考虑预生成缓存
3. **CDN 流量**:商品图频繁访问可能超 5GB/月,要监控
4. **CORS**:Web 后台调云开发 HTTP 触发器,必须手动加响应头
5. **微信支付商户号**:HuePay 是聚合支付,在企业号下不需要单独申请微信支付商户号,确认 HuePay 商务对接细节
