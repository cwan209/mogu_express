# mogu_express

接龙团购微信小程序(对标快团团),服务澳洲华人社区,单商家模式 + HuePay 澳币支付。

## 状态

- **M0** 脚手架 ✅
- **M1** 团/商品浏览 ✅
- **M2** 购物车 + 下单 ✅
- **M3** HuePay SDK 骨架(stub) ✅ — 等真凭证只改 5 行
- **M4** Web 后台增强(Excel 导出 + 统计 + 小程序管理 tab + cron) ✅
- **Docker 本地完整栈** ✅(实测 3 容器跑通端到端订单)
- **M5** 分享(卡片+海报) ⏳
- **生产部署** ⏳ — 文档已就绪 `docs/deploy.md`

## 仓库结构

```
mogu_express/
├── miniprogram/            # 顾客端微信小程序(原生 JS + TDesign)
├── cloudfunctions/         # 29 个云函数(可部署到云开发,也可在本地 Docker 跑)
│   ├── _lib/auth/          # 共享 JWT/密码哈希
│   └── _lib/huepay/        # HuePay SDK(stub 模式可无凭证测)
├── web-admin/              # Vite + React + antd 管理后台
├── local-backend/          # Docker 本地后端栈
│   ├── docker-compose.yml  # mongo + minio + api
│   └── api/                # Express + wx-server-sdk shim
├── scripts/sync-lib.js     # 共享 lib 同步到各云函数
└── docs/                   # 部署 + 本地开发文档
    ├── local-dev.md        # 5 分钟跑起整个本地栈
    └── deploy.md           # VPS 上线指南(含 Nginx + HTTPS + 安全 checklist)
```

## 快速开始(本地 Docker 完整栈)

详见 `docs/local-dev.md`。3 步:

```bash
# 1. 起后端
cd local-backend && docker compose up -d
sleep 15

# 2. 灌种子(admin/admin)
cd api && npm install && node seed.js

# 3. 起 Web 后台
cd ../../web-admin && cp .env.example .env.local && npm install && npm run dev
```

→ http://localhost:5173

## 上线

详见 `docs/deploy.md`。核心架构:

```
微信小程序 ──HTTPS──→ Nginx ──→ Express(API) ──→ MongoDB / MinIO
                              ↑
                        HuePay 异步回调
```

## 关键路径(数据后端切换)

- **小程序**:`miniprogram/config/index.js`
  - `useMock: true` (本地 wx.storage)
  - `useHttpBackend: true` + `httpApiBase` (Docker / VPS HTTP API)
  - 都 false → 微信云开发(测试号不可用)
- **Web admin**:`web-admin/.env.local`
  - `VITE_USE_MOCK=false` + `VITE_API_BASE=http://localhost:4000`
- **HuePay 切真**:容器环境变量 `HUEPAY_STUB=0` + 真凭证

## 测试

`local-backend/api/test-shim.js`(不需要 Docker,纯内存 mock):

```bash
cd local-backend/api && node test-shim.js
```

## 完整全栈实测(本机 Docker)

```
✓ 3 容器(mongo/minio/api)启动
✓ 29 个云函数加载,/cloud 列出
✓ adminLogin 签 JWT,tuanCRUD 鉴权通过
✓ 3 顾客并发下单(requirePay=true) → 全部 stub 模拟支付成功
✓ Dashboard 显示今日 GMV A$170.34, 3 单, top products 正确
✓ Excel 导出生成有效 xlsx(PK 魔法字节)
✓ cron_tuanStatus 正常运行
✓ Web admin Vite hot-reload 切到真实 HTTP 模式
```

## 旧的开发方式(改 cloudfunctions 后部署到云开发)

如果使用**正式企业账号**(非测试号):

1. 微信开发者工具打开本项目
2. `project.config.json` 填真 AppID
3. `miniprogram/config/index.js`:`cloudEnvId` 填真值,`useMock: false`,`useHttpBackend: false`
4. 开发者工具:工具 → 构建 npm
5. 开发者工具:云开发 → 上传部署所有 `cloudfunctions/*` 子目录
6. 改完 `_lib/*` 后跑一次 `node scripts/sync-lib.js` 再上传 admin 函数
