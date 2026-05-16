# Staging 收尾 Checklist

> 用法:照清单逐项勾,全部勾完 = staging 充分验证,可以走 prod。
> 配套:`docs/risks.md` 是更广的风险登记册;这份是聚焦"判定 staging
> 是否 ready 上 prod"的执行清单。

## 1. 核心业务流程(手机/浏览器手动跑,~30 分钟)

### 客户端 — https://shop-staging.moguexpress.com
- [x] 首页看到 3 个团 + 18 个商品 ✅ 2026-05-16
- [x] 点商品详情 → 加购物车 ✅ 2026-05-16
- [x] 购物车 → 下单(`HUEPAY_STUB=1` 时跳 PayResult 显示"已支付")✅ 2026-05-16
- [x] 我的订单 → 看到该订单 ✅ 2026-05-16
- [x] 退出 → OTP 登录(`SMS_STUB=1` 时验证码在 api 容器 log 里 print)✅ 2026-05-16
  - 查看方式:`ssh ubuntu@$VPS 'sudo docker logs -f mogu_api 2>&1 | grep -i --line-buffered "otp\|verifyOtp\|sendOtp"'`

### 团长后台 — https://admin-staging.moguexpress.com
- [x] 用 `admin / admin` 登录 ✅ 2026-05-16
- [x] 团管理:看到 3 个团 ✅ 2026-05-16
- [x] 订单管理:看到刚才下的订单 ✅ 2026-05-16
- [x] 改发货状态 → 客户端"我的订单"状态同步刷新 ✅ 2026-05-16

## 2. 基建可靠性(各 5-15 分钟)

- [ ] **UptimeRobot 接 `/health`** — `docs/risks.md` #13,设置步骤见对话历史
- [ ] **灾备场景 2 演练** — 跑 `docs/disaster-recovery.md` 场景 2 一遍,从 COS dump
      restore 回 mongo;**至少证明这条路实际通**,不只是文档好看
- [ ] **控制台标签清掉** `tencentcloud-terraform-lock`(risks #15)
- [ ] **APP_ENV_STAGING 存 1Password** 一份(risks #9)

## 3. 上 prod 前阻塞项(必须先解)

- [ ] **SMS 实名 + 真签名/模板**(等供应商,通常 1-3 工作日)
- [ ] **HuePay 商户开通 + 凭证**(等供应商)
- [ ] **支付 + OTP 端到端在 staging 跑通**(真凭证下,不走 stub)
- [ ] **prod 的 `BUMP_EXPIRED_TUANS` 关掉** — 只 staging 用,prod 别瞎续团
- [ ] **`docs/risks.md` 的"Prod 上线前必清"checklist 全勾**

## 全部勾完后

走 prod 流程:
```bash
# 1. 准备 prod tfvars
cd terraform
cp environments/prod.tfvars.example environments/prod.tfvars
nano environments/prod.tfvars  # 跟 staging 一样填,只是 env_name=prod

# 2. 准备 deploy/.env.prod(同 staging 套路,新 JWT、新 MONGO_ROOT_PASSWORD)
cd ..
JWT=$(openssl rand -hex 32); MONGO_PW=$(openssl rand -hex 24)
# ... 见对话历史里 staging 的 cat 模板 ...

# 3. 塞 APP_ENV_PROD secret
gh secret set APP_ENV_PROD < <(base64 -i deploy/.env.prod)

# 4. terraform apply prod
gh workflow run terraform-apply.yml -f env=prod
gh run watch --workflow=terraform-apply.yml

# 5. deploy app prod
gh workflow run deploy-app.yml -f env=prod
gh run watch --workflow=deploy-app.yml

# 6. 域名 DNS 自动指 prod CVM IP(Cloudflare records 已建)
# 验证
curl -s https://api.moguexpress.com/health
open https://shop.moguexpress.com
```
