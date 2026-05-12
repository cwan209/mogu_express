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
| 腾讯云账号 | SecretId / SecretKey(访问管理 → API 密钥) | Terraform 调腾讯云 API |
| Terraform Cloud | API Token(用户设置 → Tokens) | TF 远程 state 后端 |
| GitHub repo | 仓库管理员权限 | 配置 secrets |
| 域名注册商 | 任一已实名的域名 | DNSPod 接管 |

**域名接入 DNSPod**:
- 腾讯云控制台 → DNSPod → 添加域名
- 把域名注册商处的 nameserver 改成 `f1g1ns1.dnspod.net` 和 `f1g1ns2.dnspod.net`
- 等 1-24 小时生效

### 2. 配置 Terraform Cloud(多 workspace)

1. 注册 https://app.terraform.io,创建 organization `mogu-express`
2. 创建 **两个** workspace,都打 tag `mogu-express`:
   - `mogu-staging` — Execution Mode = Remote
   - `mogu-prod` — Execution Mode = Remote
3. **每个 workspace** → Variables 添加(env category):
   - `TF_VAR_tencent_secret_id` (sensitive)
   - `TF_VAR_tencent_secret_key` (sensitive)
   - `TF_VAR_ssh_public_key`(SSH 公钥,见下)
   - `TF_VAR_root_domain`(你的域名,两个 workspace 同一个)
   - `TF_VAR_env_name` = `staging` / `prod`(对应 workspace 名)
   - `TF_VAR_lighthouse_bundle_id` = `bundle_starter_lin_1c2g80g_h_intl`(staging) / `bundle_starter_lin_2c4g80g_h_intl`(prod)

### 3. 生成 SSH 密钥对

```bash
ssh-keygen -t ed25519 -C 'mogu-deploy' -f ~/.ssh/mogu_deploy -N ''
cat ~/.ssh/mogu_deploy.pub   # 公钥 → Terraform Cloud workspace var ssh_public_key
cat ~/.ssh/mogu_deploy       # 私钥 → GitHub repo secret SSH_DEPLOY_KEY
```

### 4. GitHub Repo Secrets

仓库 Settings → Secrets and variables → Actions:

**Repository secrets:**
- `TF_API_TOKEN` — Terraform Cloud token
- `TENCENTCLOUD_SECRET_ID`
- `TENCENTCLOUD_SECRET_KEY`
- `SSH_DEPLOY_KEY` — SSH 私钥内容(`cat ~/.ssh/mogu_deploy`)
- `SSH_DEPLOY_PUBLIC_KEY` — SSH 公钥
- `APP_ENV_PROD` — Prod `.env` 文件 `base64 -w0 deploy/.env` 后的内容
- `APP_ENV_STAGING` — Staging `.env` 文件 `base64 -w0 deploy/.env` 后的内容(JWT/HuePay/SMS 凭证跟 prod 必须不同!)

**Repository variables:**
- `ROOT_DOMAIN` — 你的根域名,如 `mogu-express.com`

### 5. 首次 apply(本地走一次)

```bash
cd terraform
terraform login                       # 写入 TF Cloud token

# 先 apply staging
terraform workspace select mogu-staging
terraform init
cp environments/staging.tfvars.example environments/staging.tfvars
nano environments/staging.tfvars      # 填实际值
terraform plan  -var-file=environments/staging.tfvars
terraform apply -var-file=environments/staging.tfvars

# 再 apply prod
terraform workspace select mogu-prod
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
| `terraform plan` 报 invalid credentials | TF Cloud workspace vars 是否填了 `TF_VAR_tencent_secret_*`?secretId 是否正确 |
| Lighthouse 实例 force replace | 改了 `bundle_id` 或 `blueprint_id` 触发。生产期不要改套餐;要升级请走腾讯云控制台 + `terraform import` |
| COS bucket 创建失败 (`BucketAlreadyExists`) | 全局重名;改 `cos_bucket_basename` 或重 apply 让 random_id 重新生成后缀 |
| DNSPod 记录 apply 报域名未授权 | 域名 nameserver 还没切到 DNSPod;等 24h 重试 |
| Caddy SSL 证书签不下来 | 域名 A 记录是否真指向 VPS?80/443 端口是否开?`docker logs mogu_caddy` 看 LE 错 |
| deploy-app workflow 找不到 artifact | terraform-apply 还没跑过一次。先手动触发 workflow_dispatch |
| SSH 鉴权失败 | `SSH_DEPLOY_KEY` 是否是**私钥**全文(含 `-----BEGIN OPENSSH PRIVATE KEY-----`)?`SSH_DEPLOY_PUBLIC_KEY` 是否一致 |

## 安全注意

- **永远不要**把 `terraform/environments/*.tfvars` 提交到 git(已 .gitignore)
- COS 子账号 AK/SK 只在 Terraform output 里(sensitive),GHA 通过 `terraform output -json` 拉取
- `APP_ENV_PROD` secret 含 JWT 签名密钥,泄露 → 所有用户 token 可伪造,要轮换:改 secret + 重 deploy
- GitHub repo 设置 → Branches → 给 main 加保护规则,强制 PR review
