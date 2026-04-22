# mogu_express

接龙团购微信小程序(对标快团团),**面向澳洲华人社区的跨境场景**:

- **顾客**:大多在中国大陆(或澳洲),微信里下单,用**微信支付 / 支付宝**付**人民币(CNY)**
- **商家(团长)**:在澳洲运营,最终收**澳币(AUD)**结算
- **HuePay**:澳洲持牌聚合支付,做 CNY 收单 → AUD 结算 + 跨境清算

所以小程序和 Web 后台**显示人民币 `¥`**(顾客视角 / 订单金额),时区按 **UTC+8 北京时间**;HuePay 商户后台显示的是 **AUD** 入账金额(两者的差 = 汇率 + HuePay 手续费)。

## 状态

- **M0** 脚手架 ✅
- **M1** 团/商品浏览 ✅
- **M2** 购物车 + 下单 ✅
- **M3** HuePay SDK 骨架(stub)✅ — 跨境支付对接,等 HuePay 文档/凭证替换 5 行即可走真实
- **M4** Web 后台增强(Excel 导出 + 统计 + 小程序管理 tab + cron)✅
- **Docker 本地完整栈** ✅
- **M5** 分享(卡片+海报)✅
- **生产部署** ⏳ — 文档 `docs/deploy.md` 已就绪

## 仓库结构

```
mogu_express/
├── miniprogram/            # 顾客端微信小程序(原生 JS + TDesign · 时区 UTC+8 · 显示 ¥)
├── cloudfunctions/         # 云函数(可部署到云开发,也可在本地 Docker 跑)
│   ├── _lib/auth/          # 共享 JWT/密码哈希
│   └── _lib/huepay/        # HuePay SDK(跨境支付:收 CNY → 结算 AUD)
├── web-admin/              # Vite + React + antd 管理后台(显示 ¥,时区 UTC+8)
├── local-backend/          # Docker 本地后端栈(Asia/Shanghai 时区)
│   ├── docker-compose.yml  # mongo + minio + api · 三容器都设 TZ
│   └── api/                # Express + wx-server-sdk shim
├── scripts/sync-lib.js     # 共享 lib 同步到各云函数
└── docs/                   # 部署 + 本地开发文档
    ├── local-dev.md        # 5 分钟跑起整个本地栈
    ├── deploy.md           # VPS 上线指南(Nginx + HTTPS + 安全 checklist)
    ├── STATUS_REPORT.md    # 给甲方/产品方的现状报告
    └── DEMO_SCRIPT.md      # 3-5 分钟演示脚本
```

## 快速开始(本地 Docker 完整栈)

详见 `docs/local-dev.md`。3 步:

```bash
# 1. 起后端(TZ=Asia/Shanghai 已在 compose 配好)
cd local-backend && docker compose up -d
sleep 15

# 2. 灌种子(admin/admin)
cd api && npm install && node seed.js

# 3. 起 Web 后台
cd ../../web-admin && cp .env.example .env.local && npm install && npm run dev
```

→ http://localhost:5173

## 上线架构

详见 `docs/deploy.md`。

```
微信小程序(顾客,CNY 付款)
       │
       ▼  HTTPS
┌───────────────┐
│ Nginx(公网)   │
│               │     HuePay 异步回调(跨境支付完成时)
└──┬────────────┘         ▲
   │                      │
   ▼                      │
┌──────────────────────────┐    结算路径
│  Express API             │     顾客 CNY
│  (处理下单/鉴权/状态)      │       │
└──┬────────┬──────────────┘       ▼
   │        │                 HuePay(跨境清算)
   ▼        ▼                      │
 Mongo    MinIO                    ▼
                              澳洲商户 AUD 账户
```

关键决策:**商家在澳洲 → 推荐 AU 机房 VPS**(Sydney / Melbourne),顾客在国内访问 HTTPS 走跨境,可用 Cloudflare 加速。

## 关键路径(数据后端切换)

- **小程序**:`miniprogram/config/index.js`
  - `useMock: true` → 本地 wx.storage(演示用)
  - `useHttpBackend: true` + `httpApiBase` → Docker / VPS HTTP API
  - 都 false → 微信云开发(需要正式账号,测试号不可)
- **Web admin**:`web-admin/.env.local`
  - `VITE_USE_MOCK=false` + `VITE_API_BASE=http://localhost:4000`
- **HuePay 切真**:容器环境变量 `HUEPAY_STUB=0` + 5 项真凭证(见 `cloudfunctions/_lib/huepay/README.md`)

## 货币与时区说明

| 层 | 货币 | 时区 | 备注 |
|---|---|---|---|
| 顾客小程序 | `¥`(CNY) | UTC+8 | 顾客视角 |
| Web 管理后台 | `¥`(CNY) | UTC+8 | 订单金额以顾客付款为准 |
| 数据库 | 整数分(CNY) | UTC(ISO 8601) | 存储标准 |
| HuePay 商户后台 | AUD | AU 当地 | 跨境结算后的到账金额(by HuePay) |

## 测试

`local-backend/api/test-shim.js`(纯内存,不需要 Docker):

```bash
cd local-backend/api && npm test
```

30 个 case 覆盖:订单事务、HuePay stub 流程、JWT 鉴权、Excel 导出、中国地址校验等。

## 完整全栈实测(本机 Docker)

```
✓ 3 容器(mongo/minio/api)启动,TZ=Asia/Shanghai
✓ 30 个云函数加载,/cloud 列出
✓ adminLogin 签 JWT,tuanCRUD 鉴权通过
✓ 多顾客并发下单 → HuePay stub 模拟支付成功
✓ Dashboard ¥ GMV + 热销 TOP + 各团表现
✓ Excel 导出有效 xlsx(列头 ¥)
✓ cron_tuanStatus 正常
```

## 备选方案:直接部署到微信云开发

如果使用**正式企业账号**(非测试号),不走 Docker 路线:

1. 开发者工具打开本项目,填真 AppID + cloudEnvId
2. `config/index.js`:`useMock: false`,`useHttpBackend: false`
3. 工具 → 构建 npm → 云开发 → 部署所有 `cloudfunctions/*`
4. 改完 `_lib/*` 跑 `node scripts/sync-lib.js` 再上传 admin 函数
