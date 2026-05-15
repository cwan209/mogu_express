# IaC 操作手册

> 基础设施全部用 Terraform 声明,GitHub Actions 自动 plan/apply/deploy。
> 这是 H5 商城 + 团长后台的**生产部署唯一推荐路径**。手动部署见 `docs/deploy-tencent-hk.md`(已废弃,仅作 fallback)。

## 三个环境

| 环境 | 触发 | 域名 | VPS 套餐 | 用途 |
|---|---|---|---|---|
| **local** | `local-backend/docker-compose.yml up` | `localhost:5174/5173/4000` | — | 开发机 docker 栈,无 Terraform |
| **staging** | PR open / sync | `*-staging.${ROOT_DOMAIN}` | 1C2G ~¥18/月 | 集成验证、商家试用、HuePay 沙箱 |
| **prod** | merge to main | `*.${ROOT_DOMAIN}` | 2C4G ~¥24/月 | 生产服务 |

环境变量自动注入:
- **前端**(Vite):`--mode staging` / `--mode prod`,加载对应 `.env.staging` / `.env.prod`
- **后端**:GH secret `APP_ENV_STAGING` / `APP_ENV_PROD`(base64 编码 deploy/.env)+ Terraform 输出的 COS 凭证拼接

## 一次性初始化(开发只做一次)

### 1. 注册账号 & 收齐凭证

| 项 | 拿到什么 | 用途 |
|---|---|---|
| 腾讯云账号 | SecretId / SecretKey(访问管理 → API 密钥) | Terraform 调腾讯云 API + COS state |
| GitHub repo | 仓库管理员权限 | 配置 secrets |
| 域名注册商 | Cloudflare(推荐) / 任一注册商 + NS 切 Cloudflare | DNS 解析 |
| Cloudflare API token | DNS Edit 权限(仅限你的 zone) | Terraform 改 DNS 记录 |

> State 后端用**腾讯云 COS**(不再依赖 Terraform Cloud),减少外部账号。

**域名 DNS 由 Cloudflare 管**(海外主体 + 国际版账号路径下,DNSPod 国内解析不直接对接):
- 在 Cloudflare 买域名(或第三方买后 NS 切 Cloudflare)
- 进域名 overview 拿 zone_id(32 位 hex,右下角)
- API token: Edit zone DNS,限定该 zone
- 把域名注册商处的 nameserver 改成 `f1g1ns1.dnspod.net` 和 `f1g1ns2.dnspod.net`
- 等 1-24 小时生效

### 2. 创建 Terraform State Bucket(一次性 bootstrap)

State 存腾讯云 COS。**鸡蛋问题** — state bucket 自己不能用 TF 管,手动建一次:

1. 腾讯云控制台 → 对象存储 COS → 创建存储桶
   - 名称:`mogu-tfstate-<你起的随机后缀>`(腾讯云会自动拼上 `-<appid>`)
   - 地域:**香港(ap-hongkong)**
   - 访问权限:**私有读写**(state 含敏感数据,必须私有!)
   - 版本控制:**开启**(防 state 损坏可回滚)
2. 复制完整 bucket 名(含 `-<appid>` 后缀)
3. 编辑 `terraform/backend.tf`,把 `bucket` 字段改成实际值
4. 本地 / CI 鉴权靠环境变量 `TENCENTCLOUD_SECRET_ID` 和 `TENCENTCLOUD_SECRET_KEY`(TF backend 自动读)

**Workspaces**(本地 / CI 通过 `TF_WORKSPACE` env 切换,或 `terraform workspace select <name>`):
- `mogu-staging` — staging state
- `mogu-prod` — prod state

State 实际存放路径:`<bucket>/terraform/state/<workspace>.tfstate`

### 3. 生成 SSH 密钥对

```bash
ssh-keygen -t ed25519 -C 'mogu-deploy' -f ~/.ssh/mogu_deploy -N ''
cat ~/.ssh/mogu_deploy.pub   # 公钥 → Terraform Cloud workspace var ssh_public_key
cat ~/.ssh/mogu_deploy       # 私钥 → GitHub repo secret SSH_DEPLOY_KEY
```

### 4. GitHub Repo Secrets

仓库 Settings → Secrets and variables → Actions:

**Repository secrets:**
- `TENCENTCLOUD_SECRET_ID` — 腾讯云 AK(同时给 TF provider + COS state backend 用)
- `TENCENTCLOUD_SECRET_KEY` — 腾讯云 SK
- `CLOUDFLARE_API_TOKEN` — Cloudflare API token(DNS Edit 权限,限定该 zone)
- `SSH_DEPLOY_KEY` — SSH 私钥内容(`cat ~/.ssh/mogu_deploy`)
- `SSH_DEPLOY_PUBLIC_KEY` — SSH 公钥(用作 TF_VAR_ssh_public_key)
- `APP_ENV_PROD` — Prod `.env` 文件 `base64 -w0 deploy/.env` 后的内容
- `APP_ENV_STAGING` — Staging `.env` 文件 `base64 -w0 deploy/.env` 后的内容(JWT/HuePay/SMS 凭证跟 prod 必须不同!)

> 不再需要 `TF_API_TOKEN`。State 后端走 COS,鉴权复用腾讯云凭证。

**Repository variables:**
- `ROOT_DOMAIN` — `moguexpress.com`
- `CLOUDFLARE_ZONE_ID` — `83d7ed862c332ac3b8b23b5b2b0507cc`

### 5. 首次 apply(本地走一次)

```bash
cd terraform
# 凭证靠环境变量(也可写进 ~/.tencentcloud/credentials)
export TENCENTCLOUD_SECRET_ID=AKIDxxxxxx
export TENCENTCLOUD_SECRET_KEY=xxxxxx

# 先 apply staging
export TF_WORKSPACE=mogu-staging
terraform init                        # 初次会问要不要创建 workspace,选 yes
cp environments/staging.tfvars.example environments/staging.tfvars
nano environments/staging.tfvars      # 填实际值
terraform plan  -var-file=environments/staging.tfvars
terraform apply -var-file=environments/staging.tfvars

# 再 apply prod
export TF_WORKSPACE=mogu-prod
cp environments/prod.tfvars.example environments/prod.tfvars
nano environments/prod.tfvars
terraform plan  -var-file=environments/prod.tfvars
terraform apply -var-file=environments/prod.tfvars
```

完成后,后续修改:
- 改 terraform/* 开 PR → GHA `terraform-plan.yml` 自动 plan **两个环境**,贴 PR comment
- PR open/sync → GHA `terraform-apply.yml` **自动 apply staging**
- merge to main → GHA `terraform-apply.yml` **自动 apply prod**

## 日常运维流程

### 改基础设施(改 VPS 套餐 / 加 COS lifecycle / 改 DNS)

1. 改 `terraform/**` 文件
2. 开 PR
3. **terraform-plan.yml** workflow 自动跑 plan,把 diff 贴到 PR comment
4. Review,merge
5. **terraform-apply.yml** workflow 自动 apply

### 改应用代码(web-shop / web-admin / cloudfunctions)

1. 开 PR(branch → main) → **deploy-app.yml** 自动部署到 **staging**
2. 在 staging 上手机扫码 / 团长 admin 验证
3. Merge to main → **deploy-app.yml** 自动部署到 **prod**

Workflow 自动:
- npm ci + `vite build --mode <staging|prod>`(读对应 `.env.staging` / `.env.prod`)
- 同步 _lib 到云函数
- 从对应环境 terraform-apply artifact 拿 VPS IP + COS 凭证
- 选对应 secret(`APP_ENV_STAGING` / `APP_ENV_PROD`)拼 `.env`
- rsync 仓库 → VPS:`/opt/mogu_express`
- ssh 跑 `docker compose up -d --build`
- curl `/health` 健康检查

### 本地开发(local 环境)

不走 Terraform。直接:
```bash
cd local-backend && docker compose up -d        # mongo + minio + api
cd web-shop && npm run dev                       # 5174
cd web-admin && npm run dev                      # 5173
```

`.env.development` 文件(已就位)默认 mock + localhost:4000。无需配 secret。

### MongoDB(TencentDB 托管)

**生产 / staging**:用 **TencentDB for MongoDB**,3 节点副本集,Terraform 创建。
- 不在 VPS docker-compose 内,API 通过公网 + TLS + 白名单(VPS public IP)访问
- `MONGO_URL` 由 Terraform output 注入 .env(含密码 + replicaSet + ssl=true)
- 控制台:腾讯云 → 数据库 → MongoDB,可看监控、慢日志、备份

**自带备份**:
- 每日全量 + binlog 增量,默认保留 7 天
- 控制台一键 PITR(point-in-time recovery)恢复到任意时刻
- 不需要再手动 mongodump(但仍保留 `scripts/backup-mongo.sh` 作冗余,见下)

**本地开发**:`local-backend/docker-compose.yml` 继续跑 mongo container,零成本。

### 应用层 Mongo 备份(第二层,可选)

VPS 上 cron 每天 03:00 跑 `scripts/backup-mongo.sh`(可保留也可禁):
- 检测 MONGO_URL 是 TencentDB 还是本地 docker → 用不同 dump 路径
- 上传到 `cos://<bucket>/backup/<env>/YYYY-MM-DD-HHMM.gz`
- COS lifecycle:30d 转低频、60d 转归档、365d 删

主备份是 TencentDB 控制台,这层兜底防"控制台备份被误清"。

详见 `docs/disaster-recovery.md`。

### 灾备演练 — 重建整套环境

```bash
# 1. 销毁
cd terraform && terraform destroy

# 2. 重建(同 TF Cloud workspace)
terraform apply

# 3. 数据库恢复(从备份)
ssh ubuntu@<new VPS IP>
cd /opt/mogu_express
docker exec -i mogu_mongo mongorestore --archive=/backup/mongo.gz --gzip
```

### 备份数据库(单独 cron workflow,见 `.github/workflows/backup.yml`,**TODO**)

后期加 GHA scheduled workflow,每天:
- ssh 进 VPS
- mongodump → 压缩 → 上传到 COS `mogu-express-images-xxxx/backup/yyyy-mm-dd.gz`

## 排错速查

| 症状 | 排查 |
|---|---|
| `terraform plan` 报 invalid credentials | 检查 env `TENCENTCLOUD_SECRET_ID/KEY` 是否设置;CI 看 secret 是否拼写正确 |
| `terraform init` 报 COS bucket 不存在 | 是否手动建了 state bucket?backend.tf 里 bucket 字段是否填正确(含 `-<appid>` 后缀)|
| Lighthouse 实例 force replace | 改了 `bundle_id` 或 `blueprint_id` 触发。生产期不要改套餐;要升级请走腾讯云控制台 + `terraform import` |
| COS bucket 创建失败 (`BucketAlreadyExists`) | 全局重名;改 `cos_bucket_basename` 或重 apply 让 random_id 重新生成后缀 |
| Cloudflare apply 报 403 | API token 是否含 Zone:DNS:Edit?Zone 是否限定到了正确域名 |
| Caddy SSL 证书签不下来 | 域名 A 记录是否真指向 VPS?80/443 端口是否开?`docker logs mogu_caddy` 看 LE 错 |
| deploy-app workflow 找不到 artifact | terraform-apply 还没跑过一次。先手动触发 workflow_dispatch |
| SSH 鉴权失败 | `SSH_DEPLOY_KEY` 是否是**私钥**全文(含 `-----BEGIN OPENSSH PRIVATE KEY-----`)?`SSH_DEPLOY_PUBLIC_KEY` 是否一致 |

## 安全注意

- **永远不要**把 `terraform/environments/*.tfvars` 提交到 git(已 .gitignore)
- COS 子账号 AK/SK 只在 Terraform output 里(sensitive),GHA 通过 `terraform output -json` 拉取
- `APP_ENV_PROD` secret 含 JWT 签名密钥,泄露 → 所有用户 token 可伪造,要轮换:改 secret + 重 deploy
- GitHub repo 设置 → Branches → 给 main 加保护规则,强制 PR review
