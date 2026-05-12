# IaC 操作手册

> 基础设施全部用 Terraform 声明,GitHub Actions 自动 plan/apply/deploy。
> 这是 H5 商城 + 团长后台的**生产部署唯一推荐路径**。手动部署见 `docs/deploy-tencent-hk.md`(已废弃,仅作 fallback)。

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

### 2. 配置 Terraform Cloud

1. 注册 https://app.terraform.io,创建 organization `mogu-express`
2. 创建 workspace `prod`,Execution Mode 选 **Remote**
3. workspace → Variables 添加:
   - `TF_VAR_tencent_secret_id` (sensitive)
   - `TF_VAR_tencent_secret_key` (sensitive)
   - `TF_VAR_ssh_public_key`(SSH 公钥,见下)
   - `TF_VAR_root_domain`(你的域名)

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
- `SSH_DEPLOY_PUBLIC_KEY` — SSH 公钥(给 terraform plan/apply 用)
- `APP_ENV_PROD` — 整个 `.env` 文件用 `base64 -w0 .env` 后的内容(含 JWT_SECRET / HuePay / SMS 凭证)

**Repository variables:**
- `ROOT_DOMAIN` — 你的根域名,如 `mogu-express.com`

### 5. 首次 apply(本地或 GHA 都行)

**本地走一次**(验证语法 + 创建资源):
```bash
cd terraform
terraform login                       # 写入 TF Cloud token
terraform init                        # 拉 providers + 接 backend
cp environments/prod.tfvars.example environments/prod.tfvars
nano environments/prod.tfvars         # 填实际值
terraform plan
terraform apply
```

**或直接通过 GHA 自动 apply**:开 PR 改 `terraform/`,merge 后 GHA 自动 apply。

apply 成功后 outputs 会列出:
- `vps_public_ip` — VPS 公网 IP
- `cos_bucket` — COS 名
- `fqdns` — shop/admin/api 三个完整域名

## 日常运维流程

### 改基础设施(改 VPS 套餐 / 加 COS lifecycle / 改 DNS)

1. 改 `terraform/**` 文件
2. 开 PR
3. **terraform-plan.yml** workflow 自动跑 plan,把 diff 贴到 PR comment
4. Review,merge
5. **terraform-apply.yml** workflow 自动 apply

### 改应用代码(web-shop / web-admin / cloudfunctions)

1. 直接 push 到 main(或开 PR merge)
2. **deploy-app.yml** workflow 自动:
   - npm ci + build web-shop / web-admin
   - 同步 _lib 到云函数
   - 从最新 terraform-apply artifact 拿 VPS IP
   - rsync 仓库 → VPS:/opt/mogu_express
   - ssh 跑 `docker compose up -d --build`
   - curl /health 健康检查

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
