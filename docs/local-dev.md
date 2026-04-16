# 本地开发完整栈 — 5 分钟跑起来

无需任何"真实"账号(微信云开发 / HuePay 商户号),全部用本地 Docker 容器替代。

## 前提

- macOS / Linux + **Docker Desktop**(`docker version` 能看到 server 号)
- Node.js 18+(执行 seed 脚本和部分构建)
- 微信开发者工具(看小程序)

## 三步跑起来

```bash
# 1. 起 MongoDB(单节点副本集) + MinIO + API server
cd local-backend
docker compose up -d

# 2. 等 ~10 秒让 Mongo 副本集就绪,然后灌种子数据
cd api && npm install   # 首次需要
node seed.js            # 输出:admins: 1 (user: admin / pass: admin)

# 3. 起 Web 后台
cd ../../web-admin
cp .env.example .env.local       # 切到真实后端模式
npm install                      # 首次需要
npm run dev                      # http://localhost:5173
```

打开 http://localhost:5173,用 `admin / admin` 登录。

Dashboard 顶部应显示 **"本地后端 http://localhost:4000"**(绿色标签)。

## 验证 API

```bash
# 健康检查
curl http://localhost:4000/health
# {"code":0,"ok":true,"ts":"..."}

# 列出已加载的云函数
curl http://localhost:4000/cloud
# {"code":0,"functions":["adminLogin","cancelOrder",...]}

# 调登录(随便给个 mock openid)
curl -X POST http://localhost:4000/cloud/login \
  -H 'x-mock-openid: u1' -H 'content-type: application/json' -d '{}'
# {"code":0,"openid":"u1","isRegistered":false,...}

# 调团列表
curl -X POST http://localhost:4000/cloud/listTuans \
  -H 'content-type: application/json' -d '{}'
```

## 端口分配

| 服务 | 端口 | 说明 |
|---|---|---|
| MongoDB | 27017 | 副本集 rs0,本地 connection string `mongodb://localhost:27017/mogu_express?replicaSet=rs0` |
| MinIO API | 9000 | S3 兼容 API |
| MinIO Console | 9001 | http://localhost:9001 (mogu_admin / mogu_admin_pass) |
| API server | 4000 | Express,云函数 HTTP 入口 |
| Web admin | 5173 | Vite |

## 常用操作

```bash
# 查看 API 容器日志
docker logs -f mogu_api

# 进 Mongo shell
docker exec -it mogu_mongo mongosh mogu_express

# 重置数据
cd local-backend/api && node seed.js --reset

# 停所有容器(数据保留)
cd local-backend && docker compose down

# 销毁所有容器+数据
docker compose down -v
```

## 常见问题

**Q: API 启动后立刻报 "MongoServerSelectionError"**
A: Mongo 副本集还没初始化,等 ~10 秒重试。或:
```bash
docker exec -it mogu_mongo mongosh --eval 'rs.initiate({_id:"rs0",members:[{_id:0,host:"localhost:27017"}]})'
```

**Q: Web admin Dashboard 显示"本地后端连接失败"**
A: 检查 `.env.local` 是否存在并设置:
```
VITE_USE_MOCK=false
VITE_API_BASE=http://localhost:4000
```
Vite 改 `.env.local` 后自动 hot-reload,但有时需要刷浏览器。

**Q: 小程序怎么连本地后端?**
A: 微信开发者工具:
1. 打开"详情" → "本地设置" → 勾选"不校验合法域名..."
2. 编辑 `miniprogram/config/index.js`:
   ```js
   useMock: false,
   useHttpBackend: true,
   httpApiBase: 'http://<你 Mac 的局域网 IP>:4000',  // 真机用
   // 或开发者工具模拟器用 'http://localhost:4000'
   ```
3. 重新编译

**Q: stub 模式 vs 真实 HuePay 怎么切?**
A: API 容器的环境变量。`local-backend/docker-compose.yml` 默认没设 `HUEPAY_STUB`,SDK config 默认 stub=true。要切真实:
```yaml
environment:
  HUEPAY_STUB: "0"
  HUEPAY_API_BASE: https://api.huepay.com.au
  HUEPAY_MERCHANT_ID: <真实商户号>
  HUEPAY_API_KEY: <Key>
  HUEPAY_SECRET: <Secret>
  HUEPAY_NOTIFY_URL: https://your-public-domain/cloud/payCallback
```
然后 `docker compose up -d --force-recreate api`。
