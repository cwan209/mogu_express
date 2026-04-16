# mogu_express 本地后端(Docker)

用 MongoDB + MinIO + Express 在本地模拟微信云开发,让 `cloudfunctions/` 里的代码**不改一行**就能跑。

## 架构

```
┌──────────────────┐      ┌──────────────────┐
│  Web admin       │      │  微信小程序        │
│  localhost:5173  │      │  (开发者工具)       │
└────────┬─────────┘      └────────┬─────────┘
         │ HTTP                     │ HTTP (useHttpBackend=true)
         ▼                          ▼
   ┌──────────────────────────────────────┐
   │  api server  (localhost:4000)        │
   │   POST /cloud/:name → exports.main() │
   │   + wx-server-sdk shim               │
   └───────────┬──────────────────┬───────┘
               │                  │
         ┌─────▼──────┐     ┌─────▼──────┐
         │  MongoDB   │     │   MinIO    │
         │   :27017   │     │   :9000    │
         └────────────┘     └────────────┘
```

**关键 trick**:
- API server 用 `Module._resolveFilename` 钩子,把所有 `require('wx-server-sdk')` 重定向到本地 shim
- shim 把 `cloud.database().collection(x).where(y)` 翻译成 MongoDB 查询
- cloud function 里的 `db.runTransaction` 用 Mongo session 实现
- `cloud.getWXContext()` 从 HTTP header `x-mock-openid` 取值

## 快速启动

```bash
cd local-backend
docker compose up -d mongo minio      # 只起基础设施
cd api && npm install                  # 装依赖
node seed.js                           # 灌入 mock 数据
node server.js                         # 起 API server
```

或者全部容器化:

```bash
docker compose up
```

## 验证

```bash
# 健康检查
curl http://localhost:4000/health

# 调 login 云函数
curl -X POST http://localhost:4000/cloud/login \
  -H 'x-mock-openid: test_user_1' \
  -H 'content-type: application/json' -d '{}'

# 调 listTuans
curl -X POST http://localhost:4000/cloud/listTuans \
  -H 'content-type: application/json' -d '{}'
```

## 配给前端

- **Web admin**:把 `.env.local` 里的 `VITE_API_BASE` 指向 `http://localhost:4000/admin`
- **小程序**:在 `config/index.js` 里加 `useHttpBackend: true` + `httpApiBase: 'http://localhost:4000'`,并在微信开发者工具勾选"不校验合法域名"

## 局限

- **微信专属 API 无法本地测**:`wx.openapi.payment.unifiedOrder`(M3 由 HuePay 替代,不受影响)、`wxacode.getUnlimited`(M5 小程序码,stub 返回假 URL)
- **UNIONID** 永远 null
- Mongo 事务不是乐观锁,语义与云数据库略有差异;但并发扣库存场景正确
