## 拿到正式 AppID:测试号 → 企业号 + 微信云开发(2026-04-19)

### Context

甲方提供了**正式企业小程序 AppID `wx2215d63c22d8e947`**(有营业执照),决定**后端从 Docker 迁到微信云开发**。

这是项目最大解锁:
- 真机扫码、提审、HuePay 关联、订阅消息、wxacode 等,**统统从此可做**。
- 后端从"Docker 自建"切到"微信云开发托管",省运维、自动扩容。
- 项目从"演示状态"开始走向"上线状态"。

### 迁移路线(分 5 阶段,按 ↓ 优先级)

#### 阶段 A — AppID 替换(30 分钟,**先做**)

- `miniprogram/project.config.json`:`appid` 从 `wx47b7abebb8b51fdf` → `wx2215d63c22d8e947`
- 删 `project.private.config.json`(开发者工具会按新 AppID 重生)
- 开发者工具会要求重新登录(用对应企业账号扫码)
- **保持 `useMock: true` 跑** — 验证 AppID 替换本身没破坏其他东西

**验收**:开发者工具能用新 AppID 打开项目,首页能正常显示团列表(走 mock)

#### 阶段 B — 开通云开发 + 拿 envId(用户操作,~10 分钟)

用户在开发者工具:
1. 右上角 **"云开发"** 按钮 → 开通
2. 选**地域:上海**(顾客在国内,延迟最低)
3. 选套餐:**基础版 ¥19.9/月**(2GB DB / 5GB 存储 / 200 万次函数调用,够用)
4. 复制 `envId`(类似 `mogu-express-2gXXXXX`)发给开发

#### 阶段 C — 云函数部署 + 数据初始化(1-2 天)

**3.1 部署所有云函数**

- 跑 `node scripts/sync-lib.js` 同步 jwt + huepay 共享库
- 30 个云函数逐个右键 → **"上传并部署:云端安装依赖"**(或写个 `scripts/deploy-cf.sh` 用 `cloudbase functions:deploy` CLI 批量)
- 重点验:
  - `createOrder`(事务) — 云开发的 runTransaction 跟我们 shim 实现略有差异,要测
  - `_admin/exportOrders` — 用云存储 API 替代 base64 路径
  - `cron_tuanStatus` — `config.json` 里的 `triggers` 部分会自动注册成定时器
  - `payCallback` — **加 HTTP 触发器**(云开发控制台 → 云函数 → payCallback → 触发器面板)

**3.2 云数据库初始化**

- 云开发数据控制台 → 手动建集合:`users` `addresses` `admins` `categories` `tuans` `products` `carts` `orders` `pay_logs` `participant_index` `tuanItems`(若已 catalog/tuanItem 拆分)
- 建初始 admin:用 `cloudfunctions/_lib/auth/jwt.js` 的 `hashPassword('一个真密码')` 生成,手动 insert 一条 admins 文档(`{ openid: '<团长 openid>', username: 'owner', passwordHash: 'pbkdf2$...', role: 'owner' }`)
- 索引:在云开发"数据库 → 集合 → 索引"加(`users._openid` unique、`orders.outTradeNo` unique 等)
- **可选**:把 `local-backend/api/seed.js` 的 categories/tuans/products 改成云开发数据库 add 调用,跑一次灌种子

**3.3 配置切换**

`miniprogram/config/index.js`:
```js
useMock: false,
useHttpBackend: false,        // 不再走 HTTP
cloudEnvId: 'mogu-express-2gXXXXX',
```

**验收**:小程序端到端走云开发(顾客下单 → mongodb 云数据库有记录 → 团长管理台看得到)

#### 阶段 D — Web 后台对接云开发(0.5-1 天)

Web 后台目前打 `http://localhost:4000/cloud/<name>`,要切成云开发的 HTTP 触发器:

- 给所有 `_admin/*` 云函数加 HTTP 触发器(云开发控制台逐个开,拿到 `https://service-XXX.ap-shanghai.tcloudbasegateway.com/<fn>` 地址)
- 改 `web-admin/.env.production`:
  ```
  VITE_USE_MOCK=false
  VITE_API_BASE=https://service-XXX.ap-shanghai.tcloudbasegateway.com
  ```
- `web-admin/src/api/client.ts` 的 `callCloud` 函数改 URL 拼接(`${API_BASE}/${name}` 而不是 `/cloud/${name}`,看具体云开发返回的 URL 模式)
- 部署:`npm run build` → dist/ 上传到云开发**静态托管**(也可以继续传到自己的 nginx)
- CORS:云开发 HTTP 触发器默认不开 CORS,需要在云函数里加 `Access-Control-Allow-Origin` header,或者用 `@cloudbase/node-sdk` 的网关模式

**验收**:浏览器打开 https://admin.your-domain → admin/owner-pwd 登录 → Dashboard / 订单管理 / 导出 Excel 都正常

#### 阶段 E — HuePay 真凭证 + 提审(异步,等 HuePay 一两周)

- HuePay 商务给的 `merchant_id` / `api_key` / `secret` 填到云开发"云函数 → 环境变量"(`HUEPAY_STUB=0` + 5 项)
- payCallback 的 HTTP 触发器 URL 给 HuePay 后台填回调
- 沙箱跑通 ¥0.01 端到端 → 切生产
- 微信公众平台:
  - 服务器域名 → 加 HuePay 域名(downloadFile / request)
  - 类目:生活服务 → 团购(可能要营业执照)
  - 隐私协议页面、用户协议页面起草
- 提交体验版给团长扫码内测
- 提审 → 1-2 周排队 → 上线

### 关键决策点

| 决策 | 推荐 | 理由 |
|---|---|---|
| 云开发地域 | **上海** | 顾客在国内,延迟最低 |
| 云开发套餐 | **基础版 ¥19.9/月** | 用量满足(详见 cost report);后期超量自动按 CDN 0.21/GB 阶梯 |
| Web 后台部署 | **云开发静态托管** + HTTP 触发器对接 | 免另外搞 VPS,跟云函数同套餐 |
| 是否继续维护 Docker 后端 | **保留作为 CI / 离线开发** | shim + test-shim.js 留着,跑测试用;不再作为生产路径 |
| 数据迁移 | **重新灌种子** | mock 数据本来就不重要,不需要从 Docker MongoDB 迁 |

### 风险

1. **云开发事务语义差异**:`createOrder` 用 `runTransaction`,云开发是真乐观锁,我们的 shim 是假串行。可能在并发场景下出现重试错误。**部署后必须人为制造一次并发下单 stock=1 商品的场景**,验证只能 1 单成
2. **wxacode.getUnlimited 配额限制**:基础版 100次/分钟,商品/团生成海报二维码可能需要预生成缓存
3. **云存储 CDN 流量**:商品图频繁访问可能超基础版 5GB,要监控
4. **CORS 跨域**:Web 后台调云开发 HTTP 触发器,需在云函数里手动加 `Access-Control-Allow-Origin`
5. **微信支付商户号 vs HuePay**:HuePay 是聚合,在企业号下不需要单独申请微信支付商户号,确认 HuePay 商务对接细节
6. **环境变量管理**:云开发的环境变量 UI 一个一个加,15+ 项要细心。建议写一份 `docs/cloud-env-vars.md` 留档

### 关键文件改动

阶段 A:
- `miniprogram/project.config.json` — `appid` 替换
- 删 `project.private.config.json`

阶段 B:无文件改动(用户在开发者工具操作)

阶段 C:
- `miniprogram/config/index.js` — `useMock`/`useHttpBackend`/`cloudEnvId`
- 30 个云函数部署(代码本身不改,但需要先 `node scripts/sync-lib.js`)
- **可能需要新增**:`scripts/deploy-cf.sh` 批量部署脚本

阶段 D:
- `web-admin/.env.production` — `VITE_API_BASE`
- `web-admin/src/api/client.ts` — URL 拼接逻辑(可能要改)
- 各 `_admin/*` 云函数加 CORS header(若不通过云开发网关)
- `web-admin/src/components/ImageUploader` — 上传走云开发 storage(可能要改 API)

阶段 E:
- `cloudfunctions/_lib/huepay/config.js` — env var 替换
- 微信公众平台后台:服务器域名、类目、提审

### 立即行动建议

**今天就做**(无需等任何东西):
1. 阶段 A:替换 AppID
2. 用户在开发者工具**开通云开发**,告诉我 envId(阶段 B)
3. 我开始写 `scripts/deploy-cf.sh` 批量部署脚本

拿到 envId 后,阶段 C-D 一气呵成 1-2 天能完。阶段 E 等 HuePay。

### 验证(整体迁移完成后)

1. 真机扫小程序码 → 顾客身份下单 → 跳支付页(stub 状态)→ 模拟支付成功 → 看订单
2. 浏览器打开 Web 后台 → admin 登录 → Dashboard 数字与小程序订单同步
3. 团长在 Web 后台改商品价格 → 小程序刷新立刻看到
4. cron_tuanStatus 在云开发"日志"面板能看到每 5 分钟跑一次
5. payCallback 用 curl 模拟 HuePay 回调 → 订单状态正确变化
6. 至少跑一次"两个用户同时下单 stock=1 商品" → 只 1 单成
7. Excel 导出 → 真实下载到本地能用 Excel 打开

---

