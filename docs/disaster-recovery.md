# 灾备 / Disaster Recovery

> **架构**:Mongo 单节点 docker 容器,数据持久化到 CVM 独立 CBS 数据盘(`/data/mongo`)。
> 数据盘生命周期独立于 CVM,Terraform 重建 CVM 实例时数据保留。
> 备份:每日 dump → COS,保留 365 天。
>
> **目标**:RPO ≤24h(最近一次每日备份),RTO ≤30min(手动跑命令)。
> staging / prod 同一套流程。

## 备份是怎么生效的

**自动**:CVM 上 `/etc/cron.d/mogu-backup` 每天 03:00(VPS 时区)跑
`/opt/mogu_express/scripts/backup-mongo.sh`:
1. `docker exec mogu_mongo mongodump --username $MONGO_ROOT_USER --password ... --db mogu_express --archive --gzip`
2. coscli 上传到 `cos://<bucket>/backup/<env>/YYYY-MM-DD-HHMM.gz`
3. 写日志 `/var/log/mogu-backup.log`

**Lifecycle**(Terraform `modules/cos`):
- 30 天:STANDARD → STANDARD_IA(半价)
- 60 天:→ ARCHIVE(深度归档,几乎免费)
- 365 天:自动删除

**核查**:
```bash
ssh ubuntu@<vps> 'tail -50 /var/log/mogu-backup.log'
# 或者列 COS 上最近几份:
ssh ubuntu@<vps> 'coscli ls cos://app/backup/staging/' | sort | tail -10
```

## 场景 1:CVM 整机挂了 / 区域故障

**好消息**:Mongo 数据写在独立 CBS 数据盘(`disk-xxxxxxxx`),不在 CVM 系统盘。
Terraform 重建 CVM 时数据盘保留,只需重新挂载 + 启 mongo 容器。

```bash
# 1. 让 Terraform 重建 CVM
cd terraform
export TF_WORKSPACE=mogu-staging   # 或 mogu-prod
terraform taint module.cvm.tencentcloud_instance.main
terraform apply -var-file=environments/staging.tfvars

# 2. 等新 CVM 起来后,GH Actions Deploy App workflow 会自动跑:
#    - server-init.sh 重挂数据盘 /dev/vdb → /data(数据盘是同一块,数据还在)
#    - docker compose 起 mongo 容器,挂 /data/mongo → 容器看到完整数据
#    - api 直连 mongo 容器,业务恢复

# 3. 验证
curl -s https://api-staging.moguexpress.com/health
```

**RPO**:0(数据盘没动),**RTO**:~10 分钟(CVM 重建 + deploy workflow)。

如果数据盘也丢了 → 场景 3。

## 场景 2:Mongo 数据损坏 / 删错集合

每日 dump 粒度,最多回到昨天 03:00 的状态。从 COS 拉最近一份 restore:

```bash
# 1. SSH 上 CVM
ssh ubuntu@<vps>

# 2. 找最近备份
coscli ls cos://app/backup/staging/ | sort | tail -5

# 3. 下载
DUMP=2026-05-15-0300.gz
coscli cp "cos://app/backup/staging/${DUMP}" "/tmp/${DUMP}"

# 4. 停 api(不停 mongo,直接覆盖 mongo)
cd /opt/mogu_express
sudo docker compose -f deploy/docker-compose.production.yml stop api

# 5. 读 root 凭证,restore
source deploy/.env
docker exec -i mogu_mongo mongorestore \
  --username "$MONGO_ROOT_USER" --password "$MONGO_ROOT_PASSWORD" \
  --authenticationDatabase admin \
  --archive --gzip --drop --nsInclude='mogu_express.*' < "/tmp/${DUMP}"

# 6. 重启 api
sudo docker compose -f deploy/docker-compose.production.yml start api

# 7. 验证
curl -s https://api-staging.moguexpress.com/health
```

**RPO**:最多 24h(每日 dump 粒度) **RTO**:15 分钟。

## 场景 3:数据盘也丢了 / 整套 destroy 重建

```bash
# 1. 灭一切
cd terraform
terraform workspace select mogu-staging
terraform destroy -var-file=environments/staging.tfvars

# 2. 重建一切(新 CBS 数据盘是空的)
terraform apply -var-file=environments/staging.tfvars

# 3. 等 Deploy App workflow 跑完(GH UI 触发或自动)
gh workflow run deploy-app.yml -f env=staging

# 4. 数据恢复同场景 2:
ssh ubuntu@$(cd terraform && terraform output -raw vps_public_ip)
coscli ls cos://app/backup/staging/ | sort | tail -5
# ... mongorestore ...
```

**RPO**:24h,**RTO**:~30 分钟(整套 IaC + restore)。

## 场景 4:误删 GitHub repo / 代码丢失

代码在 GitHub。基础设施声明在 `terraform/`,数据备份在 COS。
只要 1Password 里凭证(腾讯云 AK/SK + Cloudflare token + GH 个人 token)还在,**全部可重建**。

演练:克隆到新机器 → `terraform apply` → 同场景 3 跑恢复。

## 手动跑一次备份(每月演练)

```bash
ssh ubuntu@<vps>
sudo -u ubuntu /opt/mogu_express/scripts/backup-mongo.sh
# 看 /var/log/mogu-backup.log 有 "backup done" 即成功
# 立刻在 COS 看到一份新的 backup/<env>/YYYY-MM-DD-HHMM.gz
```

每月做一次,确保 cron + 凭证 + coscli 都正常。

## 监控备份是否还在跑

短期手动:`ssh vps tail /var/log/mogu-backup.log`,偶尔扫一眼。

长期(**TODO**):GH Actions scheduled workflow `.github/workflows/backup-watchdog.yml`:
- 每周一 09:00 跑
- 列 `cos://app/backup/prod/` 最近 7 天
- 如果数量 < 5 → email 告警

## 永远不要做

- ❌ `--drop=false` 跑 restore(会让旧/新数据合并错乱)
- ❌ lifecycle 365 天删除规则调成永久(成本失控)
- ❌ 在生产 mongo 上跑 `db.dropDatabase()`,即使是 root 用户
- ❌ COS bucket 改成 public-read 又往里塞 `backup/*`(订单数据公开)
- ❌ 不带 auth 的 mongorestore(认证规则升级后会静默失败)
