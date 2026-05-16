# 风险登记册 / Risk Register

> 2026-05-16 首次梳理。staging 跑起来后扫的,prod 上线前需逐条回头看。
> 优先级 P0 = 可能丢数据/丢业务,P1 = 可能丢钱/可用性,P2 = 运维痛点,P3 = 长期治理。
> 每次 revisit 时把已处理的标 ✅,移到底部"已关闭"区。

## P0 — 可能造成不可逆损失

| # | 风险 | 触发概率 | 现状 / 已防御 | 补强建议 |
|---|---|---|---|---|
| 1 | **Mongo 数据全丢** — 单节点容器,数据盘也在同一 AZ,AZ 整挂 → 数据盘+CVM 一起没 | 低,但发生即灾难 | 每日 dump → COS,365 天保留 | 备份链路要**手跑一次**验证(`/opt/mogu_express/scripts/backup-mongo.sh` + `coscli ls`),不验证等于没有 |
| 2 | **OTP 短信 bomb** — `/sendOtp` 没限流没 captcha,攻击者写脚本一秒打 100 条,SMS 账单瞬间几千刀 | 高(暴露 API 公网 + 短信走真实通道时) | 当前 `SMS_STUB=1` 没真发,**风险尚未激活** | 上真短信前必须加:IP 频控(60s 1 次)+ 手机号频控(1 小时 5 次)+ 滑动验证码;否则别开 `SMS_STUB=0` |
| 3 | **HuePay 假回调** — `/huepay/notify` 若不验签,攻击者伪造"已付款"通知,免费拿货 | 高(支付一上线) | 当前 `HUEPAY_STUB=1`,**风险尚未激活** | 接 HuePay 时务必 verify 签名 + 校验 amount + 防 replay(订单状态机:只接受 pending → paid) |
| 4 | **腾讯云 AK/SK 泄露** — `terraform-deployer` 子账号有 AdministratorAccess,泄露 = 全账号沦陷 | 中(凭证生命周期未做轮换) | 只存 GH Secrets + 1Password | 1) 子账号权限最小化(只给 CVM/CBS/COS/VPC/CAM/Cloudflare 几个 service);2) 90 天轮换一次 |
| 5 | **JWT_SECRET 泄露** → 所有用户 token 可伪造 | 低 | 只在 GH Secret + .env | 同 #4,加 90 天轮换流程;轮换 = 重 deploy 即生效,所有 token 失效要求重登 |

## P1 — 可能丢钱 / 可用性下降

| # | 风险 | 触发概率 | 现状 | 补强 |
|---|---|---|---|---|
| 6 | **Caddy LE 证书续签失败** — 80 端口被防火墙拦 / 域名 A 记录被改 → 90 天后 HTTPS 全挂 | 低-中 | 80 端口开着,DNS 由 TF 管 | 加监控:每周 cron 检查 `openssl x509 ... -checkend` 剩余天数 <30 → 告警 |
| 7 | **CVM 公网带宽爆** — 按量计费 10Mbps 峰值,DDoS 或刷图 → 流量费失控 | 中(图片站常被刷) | MinIO 没限速,商品图量大时尤甚 | 商品图早点切到 COS(自带防盗链 + CDN);CVM 装 fail2ban;考虑买带宽包封顶 |
| 8 | **数据盘和 CVM 同 AZ** — AZ 故障双失 | 低 | 都在 `ap-hongkong-2` | 短期接受;真正多 AZ 要副本集 mongo + 跨 AZ subnet,成本翻倍 |
| 9 | **APP_ENV_STAGING/PROD 是 GH Secret,丢就找不回** — base64 后的整 `.env` 含 JWT + Mongo 密码 | 低 | 本地 `deploy/.env.*` + GH | 在 1Password 里也存一份,标"DR 用" |
| 10 | **mongo 容器无 TLS** — 任何登 CVM 的人,localhost root 直连 mongo | 中(SSH 失守时) | 在 VPC 内网 27017 只开给本机 | SSH 加 fail2ban + 禁 password auth(应该已是 key-only,确认下);定期 audit `last -a` |

## P2 — 运维痛点

| # | 风险 | 影响 | 处理 |
|---|---|---|---|
| 11 | **Cron 跑在 UTC 不是 HK 时间** — 03:00 UTC = 11:00 HK,可能撞高峰 | 备份扰流量 | `timedatectl set-timezone Asia/Hong_Kong` 加进 server-init.sh |
| 12 | **`/var/log/mogu-backup.log` 不轮转** — 久了占满磁盘 | 系统日志阻塞 | 加 logrotate 配置 |
| 13 | **没有任何告警** — health 挂了 / cron 没跑 / 流量爆 都不知道 | 故障后才发现 | 接 uptime monitor(免费:UptimeRobot / Better Uptime),探 `/health` 5min 一次,挂了发邮件 |
| 14 | **没测过 disaster recovery 实际流程** — 文档写了,从没演练 | 真出事时手忙脚乱 | 第一次 prod 上线**前**完整跑一遍场景 2(restore)+ 场景 3(整套 destroy+rebuild) |
| 15 | **state lock tag 残留** — `tencentcloud-terraform-lock` 在腾讯云标签里没清 | 下次 plan 又卡 | 控制台标签 → 删 `tencentcloud-terraform-lock` |
| 16 | **MinIO 还在 staging compose 里** — prod 应该切 COS | 一致性差 | prod 上线前 `deploy/.env.prod` 配 `S3_*` 指向 COS bucket,docker-compose minio 段保留但不启 |

## P3 — 长期治理

| # | 风险 | 时机 |
|---|---|---|
| 17 | **Tencent 全栈锁定** — 换云需重写 modules + COS → S3 + CVM → EC2 | 业务扩到非中文区时才需要,先不管 |
| 18 | **Mongo 单点不可水平扩** — 数据量上 5GB+ / 写 QPS 上 100+ 时,垂直加机器开始吃力 | 出现性能问题再迁 TencentDB 副本集或自建 3 节点 |
| 19 | **数据存 HK,合规** — 大陆用户 PII 出境若量大,触发 PIPL(《个人信息保护法》)申报 | 用户量上 10 万 / 月活上 1 万时找律师 |
| 20 | **HK → 大陆延迟** — 西部用户 150ms+,体验比国内站差 | 用户反馈再说,迁国内需 ICP 备案 |

---

## 立刻 ROI 最高 3 件(prod 上线前必做)

1. **手跑一次 backup 验证** — 0 成本,5 分钟,化解 P0 #1 黑天鹅
2. **APP_ENV_STAGING 存 1Password** — 0 成本,2 分钟,化解 P1 #9
3. **接 UptimeRobot 探 `/health`** — 0 成本,5 分钟,化解 P2 #13

## Prod 上线前必清的 P0 / P1

- [x] #1 备份链路验过(staging 2026-05-16,prod 上线后再验一次)
- [ ] #2 SMS 上真线前必须做频控 + 验证码
- [ ] #3 HuePay 接入时签名 + amount + replay 防御
- [ ] #6 LE 证书剩余天数监控
- [ ] #7 商品图切 COS,卸掉 staging MinIO
- [ ] #9 secrets 落 1Password

## 已关闭

### 2026-05-16

- **P0 #1 Mongo 数据全丢** — 备份链路端到端跑通验证:
  - `backup-mongo.sh` 跑成 → COS `cos://app/backup/staging/` 看到 gz
  - cron 注册在 `/etc/cron.d/mogu-backup`,每天 03:00 自动跑
  - 灾备步骤见 `docs/disaster-recovery.md` 场景 1-3

  **过程中踩的坑(供后续 prod 上线 / 其他 service 接 COS 时参考)**:
  1. `tencentcloud_cam_access_key.id` 是 `<uin>#<AKID>` 复合 ID,不是 pure AKID。
     output 必须 `split("#", id)[1]`,否则 .env 里的 AK 格式无效,COS 返
     `InvalidAccessKeyId`。后续接 sub-account 类资源都要查这个语义。
  2. CAM policy 写枚举动作(PutObject/HeadObject/...)容易漏 — coscli/sdk
     的各种 precheck 操作(HeadBucket / GetBucketLocation)会一个个 403。
     正解:`cos:*` 限定到 resource(bucket ARN)维度,动作维度全开。
  3. coscli 配置文件路径是 `~/.cos.yaml`(单文件),不是 `~/.cos/config.yaml`。
     写错会触发交互向导,在 cron 模式下挂死。
  4. coscli GitHub release asset 命名带版本号:
     `coscli-v1.0.8-linux-amd64`,不是 `coscli-linux-amd64`。
