# mongo-viewer — 简易 HTML MongoDB 查看器

> 一个 ~340 行的单文件 Node 工具,跑在本机,浏览器里读 mogu_express 的 MongoDB 数据。
> **只读** — 没有 update / delete / insert 接口,刻意不做,防误删。

代码:`local-backend/api/mongo-viewer.mjs`

---

## 用途

- 在浏览器里翻 collections,看文档结构,debug 数据问题
- 替代 `ssh ... docker exec mogu_mongo mongosh --eval "..."` 那种命令行抠数据
- 比图形化客户端(Compass / Studio 3T)更轻 — 单文件,无安装,跟代码一起走

适用场景:
- **本地 dev mongo**(`docker compose up` 起来的那个)
- **staging mongo**(经 SSH tunnel)
- 任何 mongoose-compatible MongoDB 实例

---

## 前提

- Node.js 18+(项目根目录大概率已有)
- `local-backend/api/node_modules/` 已装(viewer 复用里面的 `mongodb` 驱动)
  - 没装就 `cd local-backend/api && npm install`

---

## 用法

### 场景 A:本地 dev mongo

假设你已经 `cd local-backend && docker compose up -d` 起了本地栈:

```bash
cd local-backend/api
npm run viewer
# 等同于:node mongo-viewer.mjs
```

浏览器开 **http://127.0.0.1:4321**。

### 场景 B:staging mongo(经 SSH tunnel)

staging 的 mongo 容器只绑 VPS 的 `127.0.0.1:27017`(不暴露公网,见
`deploy/docker-compose.production.yml`)。从 laptop 连过去要先开 SSH tunnel。

```bash
# Step 1 — 开 tunnel(单独窗口,保持开着)
ssh -i ~/.ssh/mogu_deploy -L 27017:127.0.0.1:27017 -N ubuntu@43.159.198.145

# Step 2 — 另一窗口跑 viewer
cd /Users/lukewang/WeChatProjects/mogu_express/local-backend/api
npm run viewer
```

> 注意:本地 dev mongo 用的也是 `127.0.0.1:27017`,会跟 tunnel 冲突。
> 同一时间只连一边 — 要么 stop 本地 docker-compose 让出端口,要么改 tunnel 用
> 别的本地端口(`-L 27018:127.0.0.1:27017`)+ `MONGO_URL=mongodb://127.0.0.1:27018`。

### 自定义参数

通过环境变量调:

| 变量 | 默认 | 说明 |
|---|---|---|
| `MONGO_URL` | `mongodb://localhost:27017` | 连接 URI |
| `MONGO_DB` | `mogu_express` | 数据库名 |
| `PORT` | `4321` | viewer HTTP 端口 |
| `HOST` | `127.0.0.1` | viewer 绑哪个网卡(默认只本机可访问) |
| `MONGO_DIRECT_CONNECTION` | `1`(on) | 设 `0` 关 directConnection(多节点 replset 场景) |

例:
```bash
MONGO_URL='mongodb://user:pass@10.0.0.5:27017' \
MONGO_DB=production_db \
PORT=4322 \
  npm run viewer
```

---

## 功能

**左栏 — collections 列表**
- 显示所有 collection 名 + 估算文档数
- 点一个进入查看
- 顶部"刷新"按钮重新拉列表

**主区 — 查询控件**
- `filter`:JSON 格式的 MongoDB filter,例 `{}`、`{"_openid":"oXXX"}`、`{"status":"paid"}`
  - **自动 ObjectId 转换**:`{"_id":"6645a..."}` 写 24-hex string,viewer 自动转 ObjectId
  - `Cmd/Ctrl+Enter` 在 filter 框里触发查询
- `sort`:`-createdAt`(desc)或 `name`(asc),逗号分隔多字段,例 `-createdAt,name`
- `limit`:每页文档数,1–500,默认 50
- 翻页按钮(prev / next)— skip-based 分页

**主区 — 文档展示**
- 每条 `<details>` 折叠,前 3 条默认展开
- 头部显示 `_id` 末尾 + 常见关键字段(orderNo / title / name / nickname 等)
- 复制 `_id` 按钮(快速 chain 到 OrderDetail 等页面 debug)
- JSON 语法高亮:
  - `ObjectId(...)` 紫色
  - `ISODate(...)` 绿色
  - 字符串红 / 数字绿 / 布尔青 / null 灰

---

## 常用查询例子

针对 mogu_express 业务的几个常用模式:

**找某用户的全部订单**(替换 `oXYZ` 为用户 openid):
```json
{"_openid": "oXYZ"}
```
sort: `-createdAt`

**待付尾款订单**:
```json
{"shippingFee.payStatus": "pending"}
```

**最近 24h 的下单**:
```json
{"createdAt": {"$gte": {"$date": "2026-05-18T00:00:00Z"}}}
```
> 注意:filter 框接的是标准 Mongo extended JSON,日期可以用 `{"$date": "..."}`。但
> viewer 目前只对 `_id` 做自动 ObjectId 转换,日期需要你自己写 `$date` marker
> 或者用比较 string(创建时间是 ISO 字符串时直接比 `{"$gte":"2026-05-18T00:00:00Z"}`)。

**找某团下的所有 tuan_items**:
```json
{"tuanId": "T2026053"}
```

**搜某 openid 的优惠券**:
```json
{"_openid": "oXYZ"}
```
collection: `coupons`

---

## 工作原理

- Node `http` server + MongoDB 官方 driver
- 嵌入式 HTML(无静态资源,启动即用)
- Three endpoints:
  - `GET /` → HTML 页面
  - `GET /api/collections` → `{db, url, collections: [{name, count}]}`
  - `GET /api/find?col=X&filter=...&sort=...&limit=...&skip=...` → `{count, skip, limit, sort, docs}`
- ObjectId / Date / Decimal128 序列化成 `{__oid: "..."}` / `{__date: "..."}` / `{__decimal: "..."}` marker,前端识别后高亮
- `directConnection=true` 默认 on:避免连上 `--replSet=rs0` 的 mongo 后 driver 去
  `rs.config()` 拉到 docker network 内部 hostname `mongo` 解析失败

---

## 安全注意

- 默认绑 `127.0.0.1`,**仅本机访问** — 不要改 `HOST=0.0.0.0` 暴露到内网/公网,除非你知道在干嘛
- 只读 — 没 mutation endpoint。这是设计选择,改这个意味着要加 auth
- staging mongo 的 `127.0.0.1:27017` host-port binding 是开发口子。短期 OK,
  长期建议:用完就把 `deploy/docker-compose.production.yml` 里 mongo 服务的
  `ports:` 行删了(viewer 改走 "VPS 容器内跑 + tunnel viewer HTTP" 那种路径)

---

## 故障排查

**`connect ECONNREFUSED 127.0.0.1:27017`**
- SSH tunnel 没建 / 已断开
- 或本地 docker compose mongo 没起来
- 验:`nc -z 127.0.0.1 27017 && echo OK`

**`getaddrinfo ENOTFOUND mongo`**
- driver 在尝试连 replica set 内部 hostname `mongo`
- 应该被默认 `directConnection: true` 拦下来;如果还出,确认 viewer 版本是
  commit `5ffb992` 以后的(默认 on)

**`MongoServerSelectionError: ...`**
- 一般是 mongo 实例没就绪 / replica set 未 init
- 看错误细节,常见是初次部署时 cron `rs.initiate` 还没跑完;等 30 秒再试

**端口被占**
- viewer 默认 4321,本地 dev 后端用 4000 不冲突
- 占了就 `PORT=4322 npm run viewer`

---

## 限制 / 不做

- **无 aggregate / pipeline** — 用 `mongosh` 跑就好
- **无 update/delete/insert** — 同上,有意为之
- **无 collection 创建 / 索引管理** — 范围之外
- **无 auth** — 假设本机环境受信。要放公网请加 reverse proxy + basic auth
- **无 CSV 导出** — 用 `_admin/exportOrders` 走业务路径
- **大集合 count 慢**:`countDocuments` 在 ~10M 文档级别会慢;不阻塞查询本身,但 summary 数字会延迟

要加什么功能直接说,加在同一个 `.mjs` 里就好,不引入构建/打包。
