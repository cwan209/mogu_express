## 当前活动 plan — 迁移到 TencentDB for MongoDB(2026-05-13)

### Context

甲方决定生产用**独立托管数据库**而非自托管 mongo 容器。决策:
- **DB 服务**:腾讯云 TencentDB for MongoDB(与 VPS / COS 同生态)
- **拓扑**:3 节点副本集(HA,prod + staging 都用副本集)
- **时机**:**现在改 Terraform + docker-compose + 应用代码**,等公司账号好了一次 `terraform apply` 直接拉起
- **本地开发**:**不变**,继续 docker mongo 容器(零成本)

新成本:
- TencentDB HK 副本集 1C2G 25G ≈ ¥350/月 × 2 环境 = ¥700/月
- 原自托管(Lighthouse 内 mongo container)是免费的
- 增量月费 ¥700,换 HA + 自动备份 + 监控 + 升级无忧

### 网络拓扑(关键技术决策)

**Lighthouse 跟 TencentDB 默认不在同一 VPC**(Lighthouse 是简化产品,无 VPC peering)。两种连法:

| 方案 | 优点 | 缺点 |
|---|---|---|
| **A. 公网 + 白名单 + TLS** | TF 配置简单,IP 变更只改一行 | 走公网流量 ¥0.5/GB,延迟 +5-10ms;但量小 ≈¥0 |
| B. 把 VPS 从 Lighthouse 换成 CVM | 跟 TencentDB 走内网,更快更稳 | 改型成本大,Lighthouse 套餐换 CVM 价格相近但配置复杂 |

**推荐 A**(MVP 期),将来规模化再上 CVM。

### Terraform 改动

**新 module `terraform/modules/mongodb/`**:
- `main.tf`:
  - `tencentcloud_mongodb_instance`:HK,3 节点副本集,engine MONGO_70_WT(7.0 + WiredTiger),HMONGO_HMASTER 机型
  - `random_password.mongo_root`:8-byte 安全密码
  - `tencentcloud_security_group` + `tencentcloud_security_group_lite_rule`:仅允许 VPS public IP 27017
  - 开启公网访问(`availability_zone` 不变,`network_type = "VPC"` + 公网附加)
- `variables.tf`:`env_name`、`vps_public_ip`、`memory`、`volume`、`replica_count`(默认 3)
- `outputs.tf`:
  - `mongo_uri`(sensitive):`mongodb://root:<pwd>@<host1>:<port1>,<host2>:<port2>,<host3>:<port3>/admin?replicaSet=cmgo-xxx&ssl=true&authSource=admin`
  - `mongo_password`(sensitive)

**改 `terraform/main.tf`**:
```hcl
module "mongodb" {
  source         = "./modules/mongodb"
  env_name       = var.env_name
  vps_public_ip  = module.lighthouse.public_ip
  memory         = var.mongo_memory   # 默认 2,prod 可调大
  volume         = var.mongo_volume   # 默认 25
}
```

**改 `terraform/outputs.tf`**:加 `mongo_uri`(sensitive)和 `mongo_password`(sensitive)

**改 `terraform/variables.tf`**:加 `mongo_memory`(默认 2)、`mongo_volume`(默认 25)

### docker-compose 改动

**`deploy/docker-compose.production.yml`**:
- **移除** `mongo` service 整段(包括 healthcheck、volume)
- `api` service:
  - 移除 `depends_on: mongo`
  - 把 `MONGO_URL` 从硬编码 `mongodb://mongo:27017/...` 改成 `${MONGO_URL}`,由 `.env` 注入
- `volumes:` 段移除 `mongo_data`

**`local-backend/docker-compose.yml`**:**不动**,本地开发继续自托管 mongo,继续用 `mongodb://mongo:27017/mogu_express?replicaSet=rs0`

### 应用代码改动

**`local-backend/api/server.js`** 第 49 行:
```js
// 之前
const client = new MongoClient(MONGO_URL, { directConnection: true });

// 之后:URL 自带 replicaSet 参数时不要 directConnection;本地 docker 单节点也兼容
const isDirect = process.env.MONGO_DIRECT_CONNECTION === '1';
const client = new MongoClient(MONGO_URL, isDirect ? { directConnection: true } : {});
```

**`local-backend/docker-compose.yml`** 的 `api` env 加:`MONGO_DIRECT_CONNECTION=1`(本地单节点保留旧行为)

**生产/staging .env**:不设 `MONGO_DIRECT_CONNECTION`,driver 自动做副本集 discovery

### GHA deploy-app workflow 改动

`.github/workflows/deploy-app.yml` 的 "Render .env" step 追加:
```bash
echo "MONGO_URL=$(jq -r .mongo_uri.value tf-outputs/outputs.json)" >> /tmp/app.env
```

`outputs.json` 现在含 `mongo_uri.value`(从 terraform output 拉)。

### 备份策略调整

**新现实**:TencentDB 自带每日全量备份 + binlog,默认保留 7 天,控制台一键恢复到任意时间点(PITR)。

**我们的 `scripts/backup-mongo.sh`** 改成**可选第二层备份**:
- 默认仍每天 03:00 跑(cron 已配)
- 如 MONGO_URL 是 TencentDB(检测 `replicaSet=cmgo-` 前缀),用 mongodump 拉到 COS 作冗余
- 如本地 docker(`mongodb://mongo:`),保持原行为
- **可考虑**:直接禁用 cron,改成手动月度演练

**`docs/disaster-recovery.md`** 改:
- 场景 2 "Mongo 数据损坏"路径改成 "TencentDB 控制台 → 备份与恢复 → 恢复到时间点" 优先
- 我们的 dump 文件作 fallback
- Lighthouse 整机快照不再含 mongo data(因为 mongo 不在 VPS 上了)

### 安全注意

- TencentDB 公网访问 + 白名单 ≠ 完全安全,**必须开 TLS**(`ssl=true` URI 参数)
- 主用户密码 Terraform 用 `random_password` 生成,存 state(state 在私有 COS bucket,加密)
- mongo_password 不应进 git;通过 terraform output sensitive + GHA 拼 .env
- 万一 VPS public IP 变(罕见),需 `terraform apply` 自动更新白名单

### 工作量分解

🔴 **大改 / 新建**:
- `terraform/modules/mongodb/` 3 个文件(~120 行)
- `terraform/main.tf` 加 module 调用
- `terraform/outputs.tf` + `variables.tf` 加字段
- `deploy/docker-compose.production.yml` 移除 mongo + 改 api 配置
- `.github/workflows/deploy-app.yml` 渲染 .env 加 MONGO_URL
- `docs/iac.md` DB 章节重写
- `docs/disaster-recovery.md` 场景 2 重写

🟡 **中改**:
- `local-backend/api/server.js` MongoClient 选项加 isDirect 开关
- `local-backend/docker-compose.yml` 加 `MONGO_DIRECT_CONNECTION=1`
- `scripts/backup-mongo.sh` 加 TencentDB 检测分支(或简化为可选)
- `deploy/.env.example` 加 `MONGO_URL` 说明 + `MONGO_DIRECT_CONNECTION`

🟢 **小改**:
- 无

### 关键文件清单

新建:
- `terraform/modules/mongodb/main.tf`
- `terraform/modules/mongodb/variables.tf`
- `terraform/modules/mongodb/outputs.tf`

改:
- `terraform/main.tf`
- `terraform/variables.tf`
- `terraform/outputs.tf`
- `terraform/environments/*.tfvars.example`(加 mongo_memory / volume)
- `deploy/docker-compose.production.yml`(去 mongo + 改 api env)
- `deploy/.env.example`(加 MONGO_URL 说明)
- `local-backend/api/server.js`(MongoClient 选项)
- `local-backend/docker-compose.yml`(API service env MONGO_DIRECT_CONNECTION=1)
- `.github/workflows/deploy-app.yml`(.env 渲染加 MONGO_URL)
- `scripts/backup-mongo.sh`(可选 TencentDB 分支)
- `docs/iac.md`(DB 章节)
- `docs/disaster-recovery.md`(场景 2)

### 风险

1. **TencentDB 实例创建慢(10-15 分钟)** → terraform apply 时间从 5 分钟拉到 20 分钟,可接受
2. **公网走流量 ≠ 完全免费** → 每月几 MB 应用 ↔ DB 流量,腾讯云 HK 免费额度内
3. **TLS 客户端兼容** → `mongodb` driver 默认支持,URL 里加 ssl=true 即可。需要测一下 shim 是否好用
4. **直接 connection 模式 vs 副本集** → server.js 改 isDirect 条件,本地保留 directConnection 行为
5. **state 里有 mongo_password** → 强调 state bucket 必须私有 + 加密
6. **公网 IP 变 → 白名单失效** → Lighthouse 在 lifecycle ignore_changes 后实例不会重建,IP 稳定。若意外漂移,`terraform apply` 自动更新安全组
7. **TencentDB 单点故障(磁盘满 / OOM)** → 副本集自动 failover,无需介入。监控告警靠腾讯云控制台

### 阶段(1.5-2 小时)

| 阶段 | 内容 |
|---|---|
| 1 | 写 `terraform/modules/mongodb/`(主资源 + 密码 + 安全组) |
| 2 | 顶层 main.tf / outputs.tf / variables.tf 串起来 |
| 3 | `deploy/docker-compose.production.yml` 移除 mongo + 改 api |
| 4 | `local-backend/api/server.js` MongoClient 加 isDirect 开关 |
| 5 | `local-backend/docker-compose.yml` 加 MONGO_DIRECT_CONNECTION=1,本地验证 |
| 6 | GHA workflow 加 MONGO_URL 注入 |
| 7 | `scripts/backup-mongo.sh` 改可选 + docs/iac.md + disaster-recovery.md 更新 |
| 8 | tf fmt + commit + push |

### 验证

1. **本地 stack 不破**:`docker compose -f local-backend/docker-compose.yml restart api` → /health OK,createOrder/payCallback 不报错
2. **Terraform fmt + validate**:本地无凭证情况下 `terraform validate -no-backend` 应通过(部分语义错可能延后)
3. **后期账号好后**:terraform apply 创建 mongo 实例 → URL 注入 → GHA 自动部署 → 真机端到端跑通(扫码登录 + 下单 + 支付 + 退款)
4. **TLS 测试**:`mongosh "$MONGO_URL" --eval 'db.adminCommand({ping:1})'` 应返 `ok: 1`
