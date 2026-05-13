# 腾讯云 Onboarding — 从零到上线指南

> **采购视角**:第一次部署的人按这份从零配齐资源、跑首次部署。
> 开发视角(日常运维 / IaC 修改)见 [`iac.md`](./iac.md)。
> 灾备恢复见 [`disaster-recovery.md`](./disaster-recovery.md)。

## 真正手动 vs Terraform 自动 — 一目了然

| 内容 | 谁做 | 原因 |
|---|---|---|
| 腾讯云账号注册 + 实名 | **手动** | 人脸识别,Terraform 救不了 |
| 域名注册 + 实名 | **手动** | 工信部要求 |
| 第一对 CAM 子账号 + AK/SK | **手动**(bootstrap) | Terraform 自己需要凭证才能跑 |
| State bucket | **手动**(bootstrap) | state 自己得有家(鸡蛋问题) |
| SSH key 生成 | **手动** | 本地操作 |
| GitHub Secrets 配置 | **手动** | GitHub 是另一个服务 |
| **Lighthouse VPS 实例** | **Terraform** | `tencentcloud_lighthouse_instance` |
| **COS 图片 bucket + 子账号 + AK/SK** | **Terraform** | `tencentcloud_cos_bucket` + CAM 模块 |
| **DNSPod A 记录(shop / admin / api)** | **Terraform** | `tencentcloud_dnspod_record` |
| **TencentDB MongoDB 副本集** | **Terraform** | `tencentcloud_mongodb_instance` |
| **安全组规则**(VPS、Mongo 白名单) | **Terraform** | `tencentcloud_security_group` |
| **首次 VPS 上 docker compose up** | **GitHub Actions** | `deploy-app.yml` workflow 自动 |

**核心思路**:手动只做 7 个 bootstrap 动作(账号 / 域名 / 子账号 / state bucket / SSH key / GH secrets / `terraform/backend.tf` 改一行)。其余**一切**靠 `terraform apply` + 一次 `git push`。

## 总成本预估

| 项 | 一次性 | 月费 |
|---|---|---|
| 域名 `.com` | ~¥55-100/年 | — |
| Lighthouse HK 2C4G(prod) | — | ¥24/月 |
| Lighthouse HK 1C2G(staging) | — | ¥18/月 |
| TencentDB MongoDB HK 3 节点副本集(每环境) | — | ¥350/月 × 2 = ¥700/月 |
| COS 存储(图片+state+备份) | — | ~¥1/月 |
| DNSPod 域名解析 | 免费版够用 | 0 |
| 腾讯云 SMS OTP | 按量 | ¥0.045/条 |
| **合计** | **~¥80** | **~¥760/月**(双环境含托管 DB) |

> **区域为什么是香港?** 海外主体(澳洲营业执照)无法 ICP 备案,不能直接用大陆服务器(80/443 会被运营商封)。香港节点免备案,腾讯云 CN2 GIA 优化线路下到江浙沪 60-90ms,体验接近大陆。若将来甲方有境内代备案主体,可迁上海(20-40ms)。

---

## 步骤 1 — 腾讯云账号(~10 分钟)

1. 打开 https://cloud.tencent.com → 注册账号(手机号 + 微信扫码登录)
2. **实名认证**(必做):
   - 个人:身份证 + 人脸识别(支付宝/微信)
   - 企业:营业执照
   - **海外营业执照请走 [腾讯云国际版](https://intl.cloud.tencent.com)**(独立账号体系,Visa 卡付款)
3. **充值**:staging 跑通最少 ¥100;双环境运行月 ¥760+,按月加值

记下:**APPID**(账号信息页右上角,10 位数字),后面 COS bucket 名会用到。

---

## 步骤 2 — 买域名 + 接入 DNSPod(~10 分钟)

**两个路径选一**:

### 路径 A:腾讯云域名(推荐,自动接入 DNSPod)

1. https://buy.cloud.tencent.com/domain
2. 搜你想要的域名,如 `mogu-express.com` → ~¥55 首年
3. 填入域名信息模板(用账号已实名信息)→ 付款
4. 等 ~30 分钟实名审核
5. 域名买完后自动用 DNSPod 解析,无需手动迁移

### 路径 B:Cloudflare Registrar / Namecheap

1. 国外注册商买完,~$10/年
2. 国内法规要求实名 → 提交身份证图片审核(通常 3-7 天)
3. **NS 改 DNSPod**:
   - 登录 [DNSPod 控制台](https://console.cloud.tencent.com/cns) → 添加域名 → 拿到 `f1g1ns1.dnspod.net` + `f1g1ns2.dnspod.net`
   - 在注册商处把 NS 改成上面这两个
   - 等 1-24 小时全球生效

**验证 DNS 生效**:`dig NS your-domain.com` 应该返回 dnspod.net。

记下:**根域名**(如 `mogu-express.com`)。

---

## 步骤 3 — 创建 CAM 子账号 + AK/SK(~10 分钟)

**绝对不要**给 Terraform 用主账号的 AK/SK,泄露后果不可控。

1. [访问管理 CAM](https://console.cloud.tencent.com/cam) → 用户 → 新建用户 → **「可访问资源并接收消息」**
2. 用户名:`terraform-deployer`
3. 访问方式:**勾选编程访问**,不勾控制台登录
4. 权限策略 — 暂时给 `AdministratorAccess`(或 `QcloudResourceFullAccess`),后期再做最小权限收敛
5. 创建完成 → **立即下载 csv** 含 SecretId/SecretKey(**只显示这一次**!)
6. 把 SecretId/SecretKey 存到 1Password / Bitwarden / 类似密码管理器

> 这个子账号是 Terraform 用的。**后续 COS 应用读写用的另一个子账号 `cos_writer` 由 Terraform 自己创建**,不用再手动建。

---

## 步骤 4 — 创建 Terraform State Bucket(~5 分钟,bootstrap 必须)

**鸡蛋问题** — Terraform 的 state 文件得有地方存,但这个 bucket 自己不能用 Terraform 管(没 state 之前)。所以手动建一次:

1. [对象存储 COS](https://console.cloud.tencent.com/cos) → 存储桶列表 → 创建存储桶
2. 配置:
   - **名称**:`mogu-tfstate-<6 位随机后缀>`(如 `mogu-tfstate-x7k2pq`,腾讯云会自动拼上 `-<APPID>`)
   - **所属地域**:中国香港 (ap-hongkong)
   - **访问权限**:**私有读写**(state 含敏感数据,必须私有!)
   - **请求域名**:默认
3. 创建后进入桶 → **基础配置 → 版本控制 → 开启**(防 state 损坏可回滚)
4. **完整 bucket 名** = 你起的名 + `-<APPID>`,如 `mogu-tfstate-x7k2pq-1300123456`(在桶概览页 / 桶列表上能看到完整名)

记下:**完整 bucket 名**。

---

## 步骤 5 — 生成 SSH 密钥(~2 分钟)

```bash
ssh-keygen -t ed25519 -C 'mogu-deploy' -f ~/.ssh/mogu_deploy -N ''

# 公钥(后面贴到 GitHub Secrets,Terraform 会注入到 VPS)
cat ~/.ssh/mogu_deploy.pub

# 私钥(后面贴到 GitHub Secrets,GHA deploy 时 ssh 登 VPS 用)
cat ~/.ssh/mogu_deploy
```

记下两个内容,马上用。

---

## 步骤 6 — 配 GitHub Repo Secrets / Variables(~10 分钟)

GitHub 仓库 → Settings → Secrets and variables → Actions:

### Repository secrets

| 名字 | 值 |
|---|---|
| `TENCENTCLOUD_SECRET_ID` | 步骤 3 csv 的 SecretId |
| `TENCENTCLOUD_SECRET_KEY` | 步骤 3 csv 的 SecretKey |
| `SSH_DEPLOY_KEY` | 步骤 5 私钥完整内容(含 `-----BEGIN/END OPENSSH PRIVATE KEY-----`) |
| `SSH_DEPLOY_PUBLIC_KEY` | 步骤 5 公钥(单行 `ssh-ed25519 AAAA... mogu-deploy`) |
| `APP_ENV_STAGING` | **稍后填**(见步骤 9) |
| `APP_ENV_PROD` | **prod 上线时填**,跟 staging 必须用不同 JWT_SECRET |

### Repository variables

| 名字 | 值 |
|---|---|
| `ROOT_DOMAIN` | 步骤 2 拿到的根域名 |

---

## 步骤 7 — 改 `terraform/backend.tf`(~2 分钟)

编辑文件,把 `bucket` 字段改成步骤 4 拿到的完整名:

```hcl
terraform {
  backend "cos" {
    region  = "ap-hongkong"
    bucket  = "mogu-tfstate-x7k2pq-1300123456"   # ← 替换!
    prefix  = "terraform/state"
    encrypt = true
  }
}
```

Commit 这个改动到 main(或 PR merge),触发首次 `terraform-plan` workflow 测试。

---

## 步骤 8 — 本地首次 `terraform apply`(~20 分钟)

> 这一步**自动创建所有云资源**:VPS / COS images bucket / CAM cos_writer 子账号(应用读写用) / 3 条 DNS A 记录 / TencentDB MongoDB 3 节点副本集 / 安全组规则。
> 时长拉到 20 分钟是因为 TencentDB 实例创建慢。

```bash
cd /path/to/mogu_express/terraform

# 凭证 env(每个新 shell 都要 export)
export TENCENTCLOUD_SECRET_ID=AKID...        # 步骤 3 csv
export TENCENTCLOUD_SECRET_KEY=...

# Staging workspace
export TF_WORKSPACE=mogu-staging

# 准备 tfvars
cp environments/staging.tfvars.example environments/staging.tfvars
nano environments/staging.tfvars
# 必填:
#   root_domain     = "..."   (步骤 2 域名)
#   ssh_public_key  = "..."   (步骤 5 公钥单行)

# 初始化(第一次会问 workspace 名,输入 mogu-staging)
terraform init

# 看计划(不会真应用)
terraform plan -var-file=environments/staging.tfvars

# 应用 — 自动创建所有资源
terraform apply -var-file=environments/staging.tfvars
# 输入 yes,等 ~20 分钟(VPS 5min,DNS 1min,MongoDB 副本集 15min)

# 看输出(VPS IP / 域名 / COS bucket / 等)
terraform output
```

成功后会显示:
```
vps_public_ip      = "43.xxx.xxx.xxx"
fqdns = {
  shop  = "shop-staging.mogu-express.com"
  admin = "admin-staging.mogu-express.com"
  api   = "api-staging.mogu-express.com"
}
cos_bucket         = "mogu-express-images-staging-xxx-1300123456"
mongo_instance_id  = "cmgo-xxxxxxxx"
# 还有 sensitive 输出(密码 / 私钥),用 terraform output -json 查
```

---

## 步骤 9 — 准备 `APP_ENV_STAGING` + 触发部署(~10 分钟)

### 9.1 本地准备 staging `.env`

```bash
cd /path/to/mogu_express
cp deploy/.env.example deploy/.env.staging
```

编辑 `deploy/.env.staging`:
- `ENV_NAME=staging`
- `JWT_SECRET=` 用 `openssl rand -hex 32` 生成 32 字符
- `CADDY_EMAIL=you@example.com`
- `SHOP_DOMAIN / ADMIN_DOMAIN / API_DOMAIN` 由 GHA 自动填(不用动)
- `S3_*` 由 GHA 自动填(不用动)
- `MONGO_URL` 由 GHA 自动填(从 Terraform 输出拿)
- `HUEPAY_STUB=1`(staging 先 stub,真实凭证拿到再切)
- `SMS_STUB=1`(staging 同上)
- `BUMP_EXPIRED_TUANS=1`(staging 开启,方便测试)

### 9.2 编码并上传到 GitHub Secret

```bash
base64 -w0 deploy/.env.staging | pbcopy        # macOS
# 或者 Linux:base64 -w0 deploy/.env.staging | xclip -selection clipboard
```

到 GitHub → Settings → Secrets → 编辑 `APP_ENV_STAGING` → 粘贴。

> **不要把 `deploy/.env.staging` commit 进 git!**(`.gitignore` 已忽略)

### 9.3 触发部署

```bash
git push                          # 或者去 Actions 页面手动 trigger Deploy App workflow
```

5-10 分钟后 staging 跑起来:
- https://shop-staging.your-domain.com
- https://admin-staging.your-domain.com
- https://api-staging.your-domain.com/health

> 第一次访问 HTTPS 域名,Caddy 自动签 LE 证书需要 30-60 秒。

---

## 验证清单

- [ ] `curl https://api-staging.YOUR-DOMAIN/health` 返回 `{"code":0,"ok":true}`
- [ ] 浏览器打开 https://shop-staging.YOUR-DOMAIN 看到首页
- [ ] 浏览器打开 https://admin-staging.YOUR-DOMAIN 看到后台登录
- [ ] `ssh ubuntu@<VPS-IP> 'docker ps'` 看到 3-4 个容器在跑(no mongo container — Mongo 是托管的)
- [ ] 腾讯云控制台 → MongoDB → 实例列表能看到 `mogu-mongo-staging-xxx`

---

## 常见坑速查

| 症状 | 排查 |
|---|---|
| 域名买完没法立即用 | 实名认证审核 30 分钟-3 小时,DNS NS 切换 1-24 小时;`dig` 命令查 |
| DNSPod 找不到我的域名 | 路径 A 自动接入;路径 B 必须手动 "添加域名" + 改 NS |
| 子账号策略 `AdministratorAccess` 不存在 | 关键字搜 "管理员",备选名 `QcloudResourceFullAccess` |
| `terraform init` 报 COS bucket 不存在 | 步骤 4 是否做了?backend.tf 里 bucket 是否填了完整名(含 APPID 后缀)|
| `terraform apply` MongoDB 报 quota exceeded | 账号实名级别太低,需要联系腾讯云客服提额(MongoDB 副本集默认配额低) |
| `terraform apply` 报 `lighthouse bundle id not found` | Bundle ID 区域化,确认 `lighthouse_bundle_id = "bundle_starter_lin_1c2g80g_h_intl"` 对应 HK |
| Caddy 签 SSL 超时 | 域名 A 记录真的指向 VPS?80/443 端口开放?`ssh vps "sudo ufw status"` |
| 浏览器看不到 Caddy 证书 | `dig` 验证 DNS;`docker logs mogu_caddy` 看 ACME 错;Cloudflare 代理是否关 |
| GHA deploy 失败 401 SSH | `SSH_DEPLOY_KEY` 是**私钥**全文?`SSH_DEPLOY_PUBLIC_KEY` 一致? |
| API 连不上 Mongo (`ECONNREFUSED`) | TencentDB 安全组白名单是否含 VPS public IP?(Terraform 自动配,但若 VPS 重建可能 IP 变,`terraform apply` 自动更新) |
| 上线后没法收到 OTP 短信 | `SMS_STUB=1` 时只是日志输出;切到真实需要腾讯云 SMS 签名/模板审核 1-3 天 |

---

## 给开发的回执清单

跑完上述步骤后,把下面这些拿回来:

- ✅ **APPID**(账号信息页 10 位数字)
- ✅ **根域名**(`mogu-express.com` 这种)
- ✅ DNSPod 控制台能看到该域名(`dig NS` 验证)
- ✅ **state bucket 完整名**(含 `-APPID` 后缀)
- ✅ **terraform-deployer 子账号 AK/SK 已下载并安全存放**
- ✅ **SSH 公钥已配 GitHub `SSH_DEPLOY_PUBLIC_KEY`**

**不要贴**:任何 SecretKey / 私钥 / .env 文件内容到聊天里。

---

## 后续 — prod 上线

Staging 跑通 1-2 周稳定后,加 prod 完全靠 Terraform workspace 切换,**不需要去控制台手动建任何东西**:

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
2. push main → GHA `terraform-apply` 自动接管该 workspace + `deploy-app` 自动部署到 prod
