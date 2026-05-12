## 当前活动 plan — 减少外部依赖 + Mongo 备份(2026-05-13)

实施完成后,本节会移动到 `docs/plans/2026-05-13-cos-backend-mongo-backup.md`。

### Context

用户三个核心担心:
1. 多一家 Terraform Cloud 服务依赖,不必要 → **换成腾讯云 COS backend**
2. 自托管 MongoDB 数据丢失风险 → **加每日 dump 到 COS + lifecycle 自动归档**
3. 数据规模长大后迁移 → **保证 MONGO_URL 单一入口 + 备份文件即迁移工件**

云厂商保持腾讯,MongoDB 自托管不变,只增加备份机制和换 state 后端。

### 工作量分解

🔴 **大改 / 新建**:
- `terraform/backend.tf` — 从 TF Cloud 改为 `backend "cos"`
- `terraform/bootstrap/` 新目录 — 一份单独的 TF 配置专门创建 state bucket(鸡蛋问题,必须有个 bucket 才能存别的 state)
- `scripts/backup-mongo.sh` 新建 — VPS 上跑,mongodump + 上传 COS
- `docs/disaster-recovery.md` 新建 — 恢复步骤

🟡 **中改**:
- `terraform/modules/cos/main.tf` — 加 lifecycle_rules for `backup/` 前缀(30d → STANDARD_IA、90d → 删)
- `terraform/modules/cos/main.tf` — 加 lifecycle_rules for `tmp/`(已有的保留)
- `terraform/modules/lighthouse/cloud-init.yaml.tpl` — 装 coscli,加 cron `0 3 * * * /opt/mogu_express/scripts/backup-mongo.sh`
- `.github/workflows/terraform-plan.yml` — 移除 `TF_API_TOKEN`,加 `TENCENTCLOUD_SECRET_ID/KEY` 作 backend init 用
- `.github/workflows/terraform-apply.yml` — 同上
- `.github/workflows/deploy-app.yml` — 不动(只是消费 artifact)
- `docs/iac.md` — TF Cloud 章节改 COS backend + bootstrap 步骤
- `deploy/.env.example` — 加 `COS_BACKUP_BUCKET` 字段说明

🟢 **小改**:
- `scripts/sync-lib.js` — 不动

### COS State Backend 设计

```hcl
# terraform/backend.tf
terraform {
  backend "cos" {
    region = "ap-hongkong"
    bucket = "mogu-tfstate-<random-suffix>"   # 必须全局唯一,手动创建
    prefix = "terraform/state"
    encrypt = true
  }
}
```

State 在 COS 路径:`bucket/terraform/state/<workspace>.tfstate`
工作空间通过 `TF_WORKSPACE` 切换:`mogu-staging` / `mogu-prod`

#### 鸡蛋问题处理

State bucket 自身不能用 Terraform 管(没有 state),解决方案:

**方案 A(推荐)**:用户手动在腾讯云控制台创建一次 state bucket
- 名字:`mogu-tfstate-<手动起的随机后缀>`
- 区域:ap-hongkong
- 权限:**私有读写**(state 含敏感数据)
- 版本控制:**开启**(防 state 损坏)
- 把 bucket 名填进 `backend.tf`

**方案 B**:写一份独立的 `terraform/bootstrap/` 配置,本地 local backend 跑一次创建 state bucket,然后主配置 init -migrate-state

**推荐 A**:更简单,一次性操作,不引入 bootstrap 复杂度。

### Mongo 备份脚本设计

`scripts/backup-mongo.sh`:
```bash
#!/bin/bash
set -euo pipefail

# env from /opt/mogu_express/deploy/.env(deploy 时已经在)
source /opt/mogu_express/deploy/.env

DATE=$(date +%Y-%m-%d-%H%M)
DUMP_FILE=/tmp/mogu-${DATE}.gz

docker exec mogu_mongo mongodump --archive --gzip --db mogu_express > "$DUMP_FILE"

# coscli env:secret-id / secret-key / bucket-region 从 .env 读
COSCLI_ACCESS_KEY="$S3_ACCESS_KEY" \
COSCLI_SECRET_KEY="$S3_SECRET_KEY" \
coscli cp "$DUMP_FILE" "cos://${S3_BUCKET}/backup/${DATE}.gz" \
  -e cos.${S3_REGION}.myqcloud.com

rm -f "$DUMP_FILE"
echo "[$(date)] backup OK: backup/${DATE}.gz ($(stat -c%s "$DUMP_FILE" 2>/dev/null || echo '?') bytes)"
```

每天 3am cron(由 cloud-init.yaml.tpl 注入):
```
0 3 * * * ubuntu /opt/mogu_express/scripts/backup-mongo.sh >> /var/log/mongo-backup.log 2>&1
```

监控:VPS 上加 `cron-alert` 或简单 `tail -f /var/log/mongo-backup.log`;后期可加 GHA 跑 healthcheck 定时拉日志看上次时间戳。

### COS Lifecycle 规则

在 `modules/cos/main.tf` 加(已有 tmp/ 规则保留):

```hcl
lifecycle_rules {
  filter_prefix = "backup/"
  transition {
    days          = 30
    storage_class = "STANDARD_IA"      # 低频存储,半价
  }
  transition {
    days          = 60
    storage_class = "ARCHIVE"          # 归档,再降一档
  }
  expiration {
    days = 365
  }
}
```

成本估算:
- 每天 dump ~5MB(乐观估计前 3 个月)
- 30 天热数据 = 150MB STANDARD ¥0.05/GB·月 = 几乎免费
- 30-60 天 = 150MB STANDARD_IA = ¥0.025
- 60-365 天 = 1.5GB ARCHIVE = ¥0.02
- **总成本 ≤¥0.10/月**

### 灾备恢复文档(docs/disaster-recovery.md)

涵盖场景:
1. **整机崩溃** — Lighthouse 整机快照恢复(腾讯云控制台 5 分钟)
2. **Mongo 数据损坏** — 从 COS 拉最近 dump → mongorestore(下面贴完整命令)
3. **意外 truncate** — 同上,但指定时间点的 dump
4. **VPS 失联** — Terraform destroy + apply 重建实例,数据从 COS 备份恢复

每条都给具体命令,新人能跑通。

### GHA Workflow 改动

移除 `TF_API_TOKEN`,改用 COS backend(直接读 `TENCENTCLOUD_SECRET_ID/KEY` env):

```yaml
env:
  TF_WORKSPACE: mogu-${{ matrix.env }}
  TENCENTCLOUD_SECRET_ID:  ${{ secrets.TENCENTCLOUD_SECRET_ID }}
  TENCENTCLOUD_SECRET_KEY: ${{ secrets.TENCENTCLOUD_SECRET_KEY }}
  TF_VAR_env_name:           ${{ matrix.env }}
  TF_VAR_tencent_secret_id:  ${{ secrets.TENCENTCLOUD_SECRET_ID }}
  TF_VAR_tencent_secret_key: ${{ secrets.TENCENTCLOUD_SECRET_KEY }}
  ...
```

`hashicorp/setup-terraform` 不再传 `cli_config_credentials_token`。

### 风险

1. **COS backend lock 机制弱** — TF COS backend 用 LOCK 文件实现,理论上有 race condition,但单人项目极不可能并发触发
2. **bootstrap 鸡蛋** — 第一次必须手动建 state bucket,文档化清晰
3. **coscli 在 Lighthouse Ubuntu 22.04 ARM/x86 区分** — 用 `dpkg --print-architecture` 自动选
4. **备份脚本失败静默** — cron 用 `MAILTO` 或加 telegram 通知;MVP 先靠 `/var/log/mongo-backup.log` 手动看
5. **mongo 容器名是 `mogu_mongo` 写死** — 万一改了会断;脚本里参数化或 `docker ps --filter` 找

### 阶段(一气呵成,~1.5 小时)

| 阶段 | 内容 |
|---|---|
| 1 | terraform/backend.tf 改 COS;documents bootstrap 手动步骤 |
| 2 | COS module 加 backup/ lifecycle_rules |
| 3 | scripts/backup-mongo.sh + cloud-init.yaml.tpl 加 cron + coscli 安装 |
| 4 | docs/disaster-recovery.md |
| 5 | 3 个 GHA workflow 改 secrets(移 TF_API_TOKEN) |
| 6 | docs/iac.md 更新(state 后端章节、secrets 列表) |
| 7 | commit + push |

### 关键文件清单

新建:
- `scripts/backup-mongo.sh`
- `docs/disaster-recovery.md`

改:
- `terraform/backend.tf`
- `terraform/modules/cos/main.tf`(加 lifecycle)
- `terraform/modules/lighthouse/cloud-init.yaml.tpl`(装 coscli + cron)
- `.github/workflows/terraform-plan.yml`(移 TF_API_TOKEN)
- `.github/workflows/terraform-apply.yml`(同上)
- `docs/iac.md`(state backend 章节重写)
- `deploy/.env.example`(加 COS_BACKUP 字段说明)

### 验证

1. **状态后端**:本地 `terraform init` 能拉 COS state;workspace 切换正常
2. **备份脚本本地试**:在 Docker 环境跑一次 `backup-mongo.sh`(stub coscli 为 echo),验证 mongodump 成功
3. **lifecycle 规则**:apply 后腾讯云 COS 控制台能看到规则生效
4. **灾备演练(模拟)**:
   - 把本地 docker mongo 数据全删
   - 跑 mongorestore 从 dump 文件还原
   - 端到端验证订单数据还在
5. **GHA 跑通**:开 PR 改 terraform/,看 plan workflow 没用 TF_API_TOKEN 也能成功 init
