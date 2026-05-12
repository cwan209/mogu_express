## IaC 化 — Terraform + GitHub Actions(2026-05-12)

### Context

H5 已跑通(M0' → M3' 完成),手动部署文档 `docs/deploy-tencent-hk.md` 可用。现要把基础设施(VPS / COS / DNS / SMS)做成 Terraform 声明式管理,并通过 GitHub Actions 自动 plan/apply/deploy。降低后续多环境(staging/prod)、多商家、灾备重建的成本;基础设施变更纳入 PR review。

### 范围

| 层 | 工具 | 自动化程度 |
|---|---|---|
| 基础设施 | Terraform(`tencentcloudstack/tencentcloud` 一家通吃 VPS/COS/DNS) | 100% |
| VPS 首次配置 | cloud-init(yaml,Terraform 注入到 Lighthouse user_data) | 100% |
| 应用构建 + 部署 | GitHub Actions(rsync over SSH + docker compose) | 100% |
| SMS 签名/模板审核 | 手动(Tencent 控制台,1-3 天) | 0%,文档化 |
| HuePay 接入 | 手动(商务对接) | 0%,文档化 |
| 微信公众平台合法域名 | 手动 | 0% |

### 目录结构

```
terraform/
├── versions.tf            # required providers
├── backend.tf             # Terraform Cloud workspace
├── main.tf                # 顶层 module 调用
├── variables.tf
├── outputs.tf             # VPS IP / COS endpoint / DNS records 等
├── environments/
│   └── prod.tfvars        # 域名 / region / 套餐规格等环境差异变量
└── modules/
    ├── lighthouse/        # 腾讯云轻量服务器 HK + 防火墙 + user_data
    │   ├── main.tf
    │   ├── variables.tf
    │   ├── outputs.tf
    │   └── cloud-init.yaml.tpl
    ├── cos/               # COS bucket(公有读)+ CAM 子账号 + 策略
    │   ├── main.tf
    │   ├── variables.tf
    │   └── outputs.tf
    └── dnspod/           # 腾讯云 DNSPod:shop/admin/api 三条 A 记录(国内解析 <20ms)
        ├── main.tf
        ├── variables.tf
        └── outputs.tf

.github/workflows/
├── terraform-plan.yml     # PR 触发,plan 结果贴 PR comment
├── terraform-apply.yml    # main merge 触发(paths: terraform/**)
└── deploy-app.yml         # main merge 触发(paths: web-shop/**, web-admin/**, cloudfunctions/**)

docs/iac.md                # 一份操作手册:首次初始化、添加新环境、销毁
```

### 关键模块设计

**modules/lighthouse**
- `tencentcloud_lighthouse_instance` 实例,套餐变量化(`bundle_id` / `blueprint_id`)
- `tencentcloud_lighthouse_firewall_template` 开 22 / 80 / 443
- `user_data` 加载 `cloud-init.yaml.tpl`,内含:装 Docker / clone repo / 启动 docker compose
- `lifecycle { ignore_changes = [bundle_id] }` 防套餐升级导致 force replace
- output:`public_ip` `instance_id`

**modules/cos**
- `tencentcloud_cos_bucket` HK region,acl=public-read
- `tencentcloud_cam_user` 子账号 + `tencentcloud_cam_user_policy_attachment` 仅 PutObject/GetObject/DeleteObject on this bucket
- `tencentcloud_cam_user_access_key` 生成 AK/SK
- output:`bucket_endpoint` `public_url_prefix` `access_key` `secret_key`(sensitive)

**modules/dnspod**
- 3 条 `tencentcloud_dnspod_record`:`shop` / `admin` / `api` 子域名 → VPS IP
- record_type=A,sub_domain=shop/admin/api,domain=${root_domain}
- DNSPod 国内解析延迟 <20ms,跟腾讯云 VPS/COS 同账号同 token
- 不需 Cloudflare(国内 DNS 解析慢且部分省份被劫持)
- output:`fqdns`

### State 后端

**推荐 Terraform Cloud 免费版**:
- 免运维(state、lock、history 都他家管)
- VCS-driven 模式可直接监听 GitHub PR
- GitHub Actions 通过 `TF_API_TOKEN` 鉴权

备选 COS backend(state 存腾讯云 COS,自己管 lock 文件)—— 不推荐,初期复杂度高。

### GitHub Actions 设计

**terraform-plan.yml**
```yaml
on:
  pull_request:
    paths: [terraform/**]
jobs:
  plan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: hashicorp/setup-terraform@v3
      - run: terraform -chdir=terraform fmt -check
      - run: terraform -chdir=terraform init
      - run: terraform -chdir=terraform validate
      - run: terraform -chdir=terraform plan -var-file=environments/prod.tfvars -no-color | tee plan.txt
      - uses: actions/github-script@v7   # plan 输出贴到 PR comment
        with: { script: "...truncate to 60k chars and post..." }
```

**terraform-apply.yml**
- 触发:push to main,paths: [terraform/**]
- 步骤:apply -auto-approve → 把 `terraform output -json` 存为 GHA artifact,供 deploy-app workflow 取 VPS IP / SSH 配置

**deploy-app.yml**
- 触发:push to main,paths: [web-shop/**, web-admin/**, cloudfunctions/**, local-backend/**, deploy/**]
- 步骤:
  1. checkout
  2. node 20 + npm cache,install + build web-shop / web-admin
  3. node scripts/sync-lib.js
  4. 从 terraform-apply 的 artifact 取 VPS_IP(或从 Terraform Cloud API 直接拉 output)
  5. ssh-action: rsync 仓库 + dist 到 VPS:/opt/mogu_express
  6. ssh 跑 `docker compose -f deploy/docker-compose.production.yml up -d --build`
  7. 健康检查:curl https://api.${domain}/health

### Secrets(GitHub repo Settings → Secrets and variables)

| Name | 来源 | 用途 |
|---|---|---|
| `TF_API_TOKEN` | Terraform Cloud 用户设置 | Terraform Cloud 鉴权 |
| `TENCENTCLOUD_SECRET_ID` | 腾讯云访问管理 | TF provider 调腾讯云 API |
| `TENCENTCLOUD_SECRET_KEY` | 同上 | 同上 |
| (DNS 走 DNSPod,复用 `TENCENTCLOUD_SECRET_*`,无需单独 token) | — | — |
| `SSH_DEPLOY_KEY` | `ssh-keygen` 生成的私钥,公钥放进 Lighthouse 实例 | deploy-app workflow ssh 进 VPS |
| `APP_ENV_PROD` | base64 编码的 deploy/.env 内容 | deploy-app workflow scp 到 VPS |

### 风险

1. **Lighthouse provider 不如 CVM 全** — 套餐升降级会 force replace(实例销毁重建)。生产期建议改用 CVM 资源;Lighthouse 仅 MVP 用
2. **COS bucket 名全局唯一** — 首次 apply 可能撞名,变量里加随机后缀(`random_id` resource)
3. **DNSPod ↔ TF 漂移** — 约定 DNS 只能从 TF 改,手动 console 改会被覆盖;PR 模板加 checklist
4. **GHA 跑 build 慢** — npm install 用 `actions/setup-node` cache;Docker build 用 buildx + cache mount
5. **SSH key 泄露 = VPS 沦陷** — 用 GitHub OIDC + 短期凭证更安全,但 Lighthouse 不支持 instance role。MVP 用 deploy key + 限制 fromIP 兜底
6. **首次 apply 与 GHA 之间的鸡蛋问题** — 先本地 `terraform apply` 一次建出实例,再让 GHA 接管;cloud-init 跑完后 docker stack 就起来,然后 GHA deploy-app 把代码更新上去

### 阶段分解(2-3 天)

| 阶段 | 时长 | 产出 |
|---|---|---|
| T1' Terraform modules | 1 天 | 三个 module 完成,`terraform plan` 本地通过 |
| T2' 首次 apply | 0.5 天 | Terraform Cloud workspace 建好,首次 apply 创建真实 VPS+COS+DNS,SSH 登进 VPS 验证 cloud-init 跑完 |
| T3' GHA workflows | 0.5 天 | 三条 workflow 通过,PR 自动 plan,main 自动 apply + deploy |
| T4' 文档 + 演练 | 0.5 天 | docs/iac.md 完成,演练一次"从零"(销毁 → 重建)整套环境 |

### 关键文件(实施时新建/改)

🔴 **新建**:
- `terraform/` 整目录(~12 文件)
- `.github/workflows/terraform-plan.yml`
- `.github/workflows/terraform-apply.yml`
- `.github/workflows/deploy-app.yml`
- `scripts/cloud-init.yaml`
- `docs/iac.md`

🟡 **改**:
- `deploy/docker-compose.production.yml`:支持从 ENV 读所有变量,避免硬编码
- `README.md`:加 IaC 章节

🟢 **不动**:
- `deploy/.env.example` 保留作为参考(env 实际来源转为 GHA secret 注入)
- 现有手动部署文档 `docs/deploy-tencent-hk.md` 保留作为"无 GHA 时的兜底"

### 验证

1. **PR 流程**:改 `terraform/modules/cos/main.tf` 加个 lifecycle rule → 开 PR → GHA 跑 plan → comment 显示 diff → merge → GHA 自动 apply
2. **应用部署流程**:改 `web-shop/src/pages/Home.tsx` 一行字 → push → GHA 自动 build + scp + docker compose up → 浏览器访问 `https://shop.${domain}` 看到新文字
3. **灾备演练**:`terraform destroy` 销毁所有,再 `terraform apply` 重建 → 数据库需要从备份恢复(MongoDB dump 走另一个 workflow 备份到 COS)→ 验证服务回归
4. **State 安全**:Terraform Cloud workspace 设置 only-from-vcs apply,本地不允许直接 apply
