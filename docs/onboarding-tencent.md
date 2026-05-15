# Onboarding — 从零到上线指南(腾讯云国际版 + Cloudflare DNS)

> **采购视角**:第一次部署的人按这份从零配齐资源、跑首次部署。
> 开发视角(日常运维 / IaC 修改)见 [`iac.md`](./iac.md)。
> 灾备恢复见 [`disaster-recovery.md`](./disaster-recovery.md)。

## 路径选择

本指南覆盖**腾讯云国际版账号(海外主体)+ Cloudflare DNS** 路径。

为什么这个组合:
- **海外主体**(澳洲 ABN)走腾讯云国内版 实名认证拦路;国际版用 Visa 卡 + 营业执照即可
- 国际版账号**没有直接的 DNSPod 国内解析**,Cloudflare DNS 兼容性更好,跨账号干净
- Cloudflare 用 DNS-only 模式(灰云),只解析不走 CF 代理,流量直连 HK VPS,国内访客延迟 60-90ms

> **国内主体走原路径**:如果你后来用国内身份证开了国内版账号,可以走 DNSPod。Terraform `cloudflare_zone_id` 留空 + 改回 dnspod 模块即可。这份 doc 只描述国际版主推路径。

## 真正手动 vs Terraform 自动 — 一目了然

| 内容 | 谁做 | 原因 |
|---|---|---|
| 腾讯云国际版账号 + 实名 | **手动** | 营业执照审核,Terraform 救不了 |
| Cloudflare 账号 + 买域名 + 拿 zone_id | **手动** | 注册商 + 用户认证 |
| Cloudflare API Token | **手动**(bootstrap) | Terraform 自己需要 token 才能跑 |
| 第一对 CAM 子账号 + AK/SK | **手动**(bootstrap) | 同上 |
| State bucket | **手动**(bootstrap) | state 自己得有家(鸡蛋问题) |
| SSH key 生成 | **手动** | 本地操作 |
| GitHub Secrets 配置 | **手动** | GitHub 是另一个服务 |
| **Lighthouse HK VPS** | **Terraform** | `tencentcloud_lighthouse_instance` |
| **COS 图片 bucket + 子账号** | **Terraform** | `tencentcloud_cos_bucket` |
| **DNS A 记录(shop / admin / api)** | **Terraform** | `cloudflare_record` |
| **TencentDB MongoDB 副本集** | **Terraform** | `tencentcloud_mongodb_instance` |
| **安全组规则**(VPS、Mongo 白名单) | **Terraform** | `tencentcloud_security_group` |
| **首次 VPS 上 docker compose up** | **GitHub Actions** | `deploy-app.yml` workflow 自动 |

**核心**:8 个手动 bootstrap 动作 → 然后 `terraform apply` + `git push` 把剩余全做完。

## 总成本预估

| 项 | 一次性 | 月费 |
|---|---|---|
| Cloudflare `.com` 域名(成本价注册商) | ~$10/年 | — |
| Cloudflare DNS | 免费版够用 | 0 |
| Lighthouse HK 2C4G(prod) | — | ~$10/月 |
| Lighthouse HK 1C2G(staging) | — | ~$5/月 |
| TencentDB MongoDB HK 3 节点(每环境) | — | ~$50/月 × 2 = ~$100/月 |
| COS 存储(图片+state+备份) | — | ~$0.2/月 |
| 腾讯云国际版 SMS OTP | 按量 | ~$0.007/条 |
| **合计** | **~$10** | **~$115/月**(双环境含托管 DB) |

> 国际版按 USD 计费,Visa 卡扣款。

---

## 步骤 1 — Cloudflare 注册 + 买域名 + 拿 zone_id(~10 分钟)

1. https://cloudflare.com 注册账号
2. https://dash.cloudflare.com → Registrar(域名注册) → 搜你想要的域名,如 `moguexpress.com`
3. ~$10/年,Visa 卡付款
4. 买完后域名自动接入 Cloudflare DNS(无需改 NS)
5. **拿 zone_id**:进域名 overview 页 → 右下角 `Zone ID` 一栏,复制(32 位 hex)

> ✅ **已完成** — 根域名 `moguexpress.com`,zone_id `83d7ed862c332ac3b8b23b5b2b0507cc`

记下:**根域名** + **zone_id**。

---

## 步骤 2 — Cloudflare API Token(~5 分钟)

Terraform 需要一个 token 来创建 DNS 记录。

1. https://dash.cloudflare.com/profile/api-tokens → **Create Token**
2. 模板:**Edit zone DNS**
3. **Zone Resources** → Include → Specific zone → 选你刚买的域名(限定权限,不让 token 改其他 zone)
4. Create → **复制 token**(只显示一次!)

> ✅ **已完成** — token 已生成,稍后填进 GitHub Secret `CLOUDFLARE_API_TOKEN`

记下:**Cloudflare API Token**。

---

## 步骤 3 — 腾讯云国际版账号(~15 分钟)

1. https://intl.cloud.tencent.com 注册账号
2. **企业认证**:
   - 上传澳洲营业执照 / ABN
   - 法人姓名 / 邮箱 / 电话
   - 审核 1-3 个工作日(可能要补充材料)
3. 实名通过后,**Billing → Top up** Visa 卡充值 $50(staging 跑通最少)

> ✅ **已完成** — APPID `1432854412`

记下:**APPID**(账号信息页右上角 10 位数字)。

> **注意**:国际版账号实名审核可能拖几天。如果有 demo deadline,先用个人 Visa 卡走"个人开发者"路径(实名简单)。

---

## 步骤 4 — 创建 CAM 子账号 + AK/SK(~10 分钟)

绝对**不要**给 Terraform 用主账号的 AK/SK。

1. https://console.intl.cloud.tencent.com/cam → Users → Create User → "Allow programmatic access"
2. Username: `terraform-deployer`
3. **Permissions**: 暂给 `AdministratorAccess`,后期再做最小权限
4. **下载 CSV** 含 SecretId/SecretKey(只显示一次!)
5. 存到 1Password / Bitwarden

> ✅ **已完成** — `terraform-deployer` 子账号已建,AK/SK 待填进 GitHub Secrets `TENCENTCLOUD_SECRET_ID/KEY`

> 这是 Terraform 用的。**应用读写 COS 的子账号 `cos_writer` 由 Terraform 自己创建**,不用再手动建。

---

## 步骤 5 — 创建 Terraform State Bucket(~5 分钟,bootstrap 必须)

**鸡蛋问题** — Terraform 的 state 自己得有家。手动建一次:

1. https://console.intl.cloud.tencent.com/cos → Create Bucket
2. 配置:
   - **Name**: `mogu-tfstate-<6 位随机后缀>`(实际名会加 `-<APPID>` 后缀)
   - **Region**: **Hong Kong (ap-hongkong)**
   - **Access Permission**: **Private Read/Write**(state 含敏感数据,必须私有!)
3. 进 bucket → **Basic Configuration** → **Versioning** → Enable(防 state 损坏可回滚)
4. 复制**完整 bucket 名**(含 `-<APPID>` 后缀)

> ✅ **已完成** — bucket `mogu-tfstate-x7k2pq-1432854412`(已写进 `terraform/backend.tf`)

记下:**完整 bucket 名**。

---

## 步骤 6 — 生成 SSH 密钥(~2 分钟)

```bash
ssh-keygen -t ed25519 -C 'mogu-deploy' -f ~/.ssh/mogu_deploy -N ''

# 公钥(贴到 GitHub Secrets,Terraform 注入 VPS)
cat ~/.ssh/mogu_deploy.pub

# 私钥(贴到 GitHub Secrets,GHA 部署时 ssh 登 VPS 用)
cat ~/.ssh/mogu_deploy
```

---

## 步骤 7 — 配 GitHub Repo Secrets / Variables(~10 分钟)

GitHub 仓库 → Settings → Secrets and variables → Actions:

### Repository secrets

| 名字 | 值 |
|---|---|
| `TENCENTCLOUD_SECRET_ID` | 步骤 4 csv |
| `TENCENTCLOUD_SECRET_KEY` | 步骤 4 csv |
| `CLOUDFLARE_API_TOKEN` | 步骤 2 token |
| `SSH_DEPLOY_KEY` | 步骤 6 私钥(完整含 BEGIN/END) |
| `SSH_DEPLOY_PUBLIC_KEY` | 步骤 6 公钥(单行) |
| `APP_ENV_STAGING` | **稍后填**(见步骤 10) |
| `APP_ENV_PROD` | prod 上线时填 |

### Repository variables

| 名字 | 值 |
|---|---|
| `ROOT_DOMAIN` | `moguexpress.com` |
| `CLOUDFLARE_ZONE_ID` | `83d7ed862c332ac3b8b23b5b2b0507cc` |

---

## 步骤 8 — 改 `terraform/backend.tf`(~2 分钟)

编辑文件,把 `bucket` 字段改成步骤 5 拿到的完整名:

```hcl
terraform {
  backend "cos" {
    region  = "ap-hongkong"
    bucket  = "mogu-tfstate-x7k2pq-1432854412"   # ← 已是实际值,无需再改
    prefix  = "terraform/state"
    encrypt = true
  }
}
```

Commit 到 main(或 PR merge),触发首次 `terraform-plan` workflow 测试。

---

## 步骤 9 — 本地首次 `terraform apply`(~20 分钟)

> 自动创建所有云资源:VPS / COS images bucket / cos_writer 子账号 / 3 条 DNS A 记录(Cloudflare)/ TencentDB MongoDB 副本集 / 安全组。
> 时长 ~20 分钟(TencentDB 实例创建慢)。

```bash
cd /path/to/mogu_express/terraform

# 凭证 env(每个新 shell 都要 export)
export TENCENTCLOUD_SECRET_ID=AKID...        # 步骤 4 csv
export TENCENTCLOUD_SECRET_KEY=...
export TF_VAR_cloudflare_api_token=...       # 步骤 2

# Staging workspace
export TF_WORKSPACE=mogu-staging

# 准备 tfvars
cp environments/staging.tfvars.example environments/staging.tfvars
nano environments/staging.tfvars
# 必填:
#   root_domain         = "..."             (步骤 1 域名)
#   cloudflare_zone_id  = "..."             (步骤 1 zone_id)
#   ssh_public_key      = "..."             (步骤 6 公钥单行)

# 初始化(第一次会问 workspace 名,输入 mogu-staging)
terraform init

# 看计划(不真应用)
terraform plan -var-file=environments/staging.tfvars

# 应用 — 自动创建全部资源
terraform apply -var-file=environments/staging.tfvars
# yes,等 ~20 分钟

# 看输出
terraform output
```

成功输出示例:
```
vps_public_ip      = "43.xxx.xxx.xxx"
fqdns = {
  shop  = "shop-staging.moguexpress.com"
  admin = "admin-staging.moguexpress.com"
  api   = "api-staging.moguexpress.com"
}
cos_bucket         = "mogu-express-images-staging-xxx-1432854412"
mongo_instance_id  = "cmgo-xxxxxxxx"
```

---

## 步骤 10 — 准备 `APP_ENV_STAGING` + 触发部署(~10 分钟)

### 10.1 本地准备 `.env`

```bash
cp deploy/.env.example deploy/.env.staging
nano deploy/.env.staging
```

填:
- `ENV_NAME=staging`
- `JWT_SECRET=`(用 `openssl rand -hex 32`)
- `CADDY_EMAIL=you@example.com`
- `SHOP_DOMAIN / ADMIN_DOMAIN / API_DOMAIN` — GHA 自动填
- `S3_*` — GHA 自动填
- `MONGO_URL` — GHA 自动填
- `HUEPAY_STUB=1`、`SMS_STUB=1`(staging 先 stub)
- `BUMP_EXPIRED_TUANS=1`(staging 测试便利)

### 10.2 上传到 GitHub Secret

```bash
base64 -w0 deploy/.env.staging | pbcopy     # macOS
```

到 GitHub → Settings → Secrets → 编辑 `APP_ENV_STAGING` → 粘贴。

> **不要把 `.env.staging` commit 进 git!**(`.gitignore` 已忽略)

### 10.3 触发部署

```bash
git push                          # 或 Actions 页面手动 trigger Deploy App workflow
```

5-10 分钟后 staging 跑起来:
- https://shop-staging.your-domain.com
- https://admin-staging.your-domain.com
- https://api-staging.your-domain.com/health

> 首次 HTTPS 访问,Caddy 自动签 LE 证书要 30-60 秒。

---

## 验证清单

- [ ] `curl https://api-staging.YOUR-DOMAIN/health` 返 `{"code":0,"ok":true}`
- [ ] 浏览器打开 https://shop-staging.YOUR-DOMAIN 看到首页
- [ ] 浏览器打开 https://admin-staging.YOUR-DOMAIN 看到后台登录
- [ ] `ssh ubuntu@<VPS-IP> 'docker ps'` 看到 3-4 个容器(不含 mongo,因为托管)
- [ ] 腾讯云国际版控制台 → MongoDB → 实例列表能看到 `mogu-mongo-staging-xxx`
- [ ] Cloudflare dashboard → DNS → 域名下能看到 shop-staging / admin-staging / api-staging 三条 A 记录(灰云 / DNS only)

---

## 常见坑速查

| 症状 | 排查 |
|---|---|
| Cloudflare 买域名失败 | 卡被风控?换张 Visa 试;或去 Namecheap 买然后 NS 切 Cloudflare |
| 国际版账号审核久 | 国际版企业认证 1-3 天,缺资料可能拖更久;邮件追问 |
| `terraform init` 报 COS bucket 不存在 | 步骤 5 做没?backend.tf 是否填了完整名(含 APPID) |
| `terraform apply` MongoDB 报 quota | 账号配额低,联系腾讯云国际版客服提额 |
| `terraform apply` Cloudflare 报 403 | API token 权限是否含 Zone:DNS:Edit?Zone 是否限定到了正确域名 |
| Caddy 签 SSL 超时 | DNS A 记录是否真指 VPS?Cloudflare 是否是**灰云**(DNS only)?80 端口开? |
| GHA deploy 失败 401 SSH | `SSH_DEPLOY_KEY` 是私钥**全文**(含 BEGIN/END)?`SSH_DEPLOY_PUBLIC_KEY` 一致? |
| API 连不上 Mongo | TencentDB 安全组白名单是否含 VPS IP?(TF 自动配,IP 变会自动更新) |
| OTP 短信收不到 | `SMS_STUB=1` 时只是日志;切真实需国际版 SMS 服务,审核签名 |

---

## 给开发的回执清单

跑完这些后,把下面这些拿回来(**不要贴 secret 内容到聊天**,只确认拿到了):

- ✅ **APPID**(账号信息页 10 位数字)
- ✅ **根域名**(`mogu-express.com` 这种)
- ✅ **Cloudflare zone_id**(32 位 hex)
- ✅ **state bucket 完整名**(含 `-APPID`)
- ✅ Cloudflare API Token / Tencent AK&SK / SSH key 都拿到了并存到密码管理器
- ✅ GitHub repo secrets / variables 已配齐

---

## 后续 — prod 上线

Staging 跑通 1-2 周后:

```bash
cd terraform
export TF_WORKSPACE=mogu-prod
cp environments/prod.tfvars.example environments/prod.tfvars
nano environments/prod.tfvars
terraform plan  -var-file=environments/prod.tfvars
terraform apply -var-file=environments/prod.tfvars
```

然后:
1. 准备 `APP_ENV_PROD`(JWT_SECRET 必须跟 staging 不同!)
2. push main → GHA 自动接管 prod workspace 部署
