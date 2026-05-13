# 灾备 / Disaster Recovery

> 目标 RPO ≤24h(最近一次每日备份),RTO ≤30min(手动跑命令)。
> 适用范围:staging / prod 都同一套流程。

## 备份是怎么生效的

**自动**:VPS 上 `/etc/cron.d/mogu-mongo-backup` 每天 03:00 跑 `/opt/mogu_express/scripts/backup-mongo.sh`:
1. `docker exec mogu_mongo mongodump --archive --gzip --db mogu_express`
2. coscli 上传到 `cos://<bucket>/backup/<env>/YYYY-MM-DD-HHMM.gz`
3. 写日志 `/var/log/mongo-backup.log`

**lifecycle**(Terraform 已声明):
- 30 天:STANDARD → STANDARD_IA(半价)
- 60 天:→ ARCHIVE(深度归档,几乎免费)
- 365 天:自动删除

**核查**:
```bash
ssh ubuntu@<vps> 'tail -50 /var/log/mongo-backup.log'
# 或者
coscli ls cos://app/backup/prod/ | head
```

## 场景 1:整机崩溃 / VPS 整台挂了

腾讯云控制台 → Lighthouse → 该实例 → 备份与恢复 → 选最近一次自动快照恢复。整机文件系统 5 分钟回来。

**好消息**:Mongo 已迁到 TencentDB(托管),VPS 上不存任何业务数据。VPS 挂掉只丢应用进程(几秒就能 docker compose 重新拉起),数据完全不受影响。

如果连快照都丢了 → 场景 4。

## 场景 2:Mongo 数据损坏 / 删错集合

**首选 — TencentDB 控制台 PITR**(point-in-time recovery,精确到秒)

1. 腾讯云 → 数据库 → MongoDB → 找到该实例 → **备份与恢复**
2. **回档** 标签 → 选恢复到具体时间点(例:删错前 5 分钟)
3. 选**就地覆盖**(原实例)或**新建实例**(更安全)
4. 提交,等 10-30 分钟
5. 应用 MONGO_URL 不变(就地覆盖)/ 或改 Terraform `mongo_uri` 指向新实例

**RPO**:1-5 分钟(binlog 粒度) **RTO**:10-30 分钟。

---

**Fallback — 我们的应用层 dump**(TencentDB 备份意外丢失时)

```bash
# 1. SSH 上 VPS
ssh ubuntu@<vps>

# 2. 找最近的备份文件
coscli ls cos://app/backup/prod/ | sort | tail -5

# 3. 下载
DUMP=2026-05-13-0300.gz
coscli cp "cos://app/backup/prod/${DUMP}" "/tmp/${DUMP}"

# 4. 停应用
cd /opt/mogu_express
sudo docker compose -f deploy/docker-compose.production.yml stop api

# 5. 从 .env 读 MONGO_URL,直接 restore 到 TencentDB
source /opt/mogu_express/deploy/.env
mongorestore --uri "$MONGO_URL" --archive --gzip --drop --nsInclude='mogu_express.*' < "/tmp/${DUMP}"

# 6. 重启 api
sudo docker compose -f deploy/docker-compose.production.yml start api

# 7. 验证
curl -s https://api.your-domain.com/health
```

**耗时**:数据 <100MB 时整套 15 分钟。RPO 24h(每日 dump 粒度,不如 TencentDB 自带的 PITR 细)。

## 场景 3:回到某个时间点(point-in-time)

我们的备份是每日级,**最细粒度 24h**。要更细需上副本集 + oplog 或 TencentDB。

操作同场景 2,挑对应日期的 dump 文件即可。

## 场景 4:VPS 完全失联 / 区域故障

需要重建 VPS + 数据恢复:

```bash
# 1. 本地有 terraform/ 的话
cd terraform
terraform workspace select mogu-prod
terraform taint module.lighthouse.tencentcloud_lighthouse_instance.main
terraform apply   # 重建实例,DNS 会指向新 IP

# 2. 等 cloud-init 跑完(约 3-5 分钟)— GHA deploy-app workflow 会自动接管
#    手动触发:GitHub → Actions → Deploy App → Run workflow

# 3. 等服务起来后,数据恢复同场景 2
ssh ubuntu@<new-vps>
coscli ls cos://app/backup/prod/ | sort | tail -5
# ... mongorestore ...
```

**注意**:
- 场景 4 需要域名 DNS 已迁到新 IP(Terraform apply 自动改 DNSPod 记录),但 DNS 缓存可能延迟 10 分钟
- 应用配置(JWT_SECRET、HuePay 凭证)从 `APP_ENV_PROD` GH secret 重新注入,不丢

## 场景 5:误删 GitHub repo / 代码丢失

代码在 GitHub,有镜像 fork 即可。基础设施声明在 `terraform/`,数据在 COS,只要凭证还在 1Password / 团长心里,**所有东西都能重建**。

测试一下:试试 `git clone https://github.com/cwan209/mogu_express.git` 再 `terraform apply`,看能不能从零拉起一套。

## 手动跑一次备份(灾备演练)

```bash
ssh ubuntu@<vps>
/opt/mogu_express/scripts/backup-mongo.sh
# 看 /var/log/mongo-backup.log 有 "backup done" 即成功
# 立即在 COS 看到一份 backup/<env>/YYYY-MM-DD-HHMM.gz
```

每月做一次,确保 cron 没坏。

## 监控备份是否还在跑

简单做法:GHA scheduled workflow `.github/workflows/backup-watchdog.yml`(**TODO,未实现**):
- 每周一 09:00 跑
- 列 `cos://app/backup/prod/` 最近 7 天
- 如果空 → 给 owner 发邮件告警

短期手动:`ssh vps tail /var/log/mongo-backup.log` 偶尔看一眼。

## 永远不要做

- ❌ 把 backup-mongo.sh 改成 `--drop=false`(会让 restore 时合并旧数据,数据集错乱)
- ❌ 把 lifecycle 的 365 天删除规则调成永久保留(成本失控)
- ❌ 在生产 mongo 上跑 `--eval "db.dropDatabase()"`,即使是脚本
- ❌ 把 COS bucket 改成 public-read 后又往里塞 backup/(会公开订单数据)
