## 当前活动 plan — 腾讯云 Onboarding 指南(2026-05-13)

### Context

用户准备买 VPS + 域名 + 配账号,需要一份可独立操作的指南记到仓库,方便:
- 用户自己买完不需要翻聊天记录
- 中途接手的人或团长能照着做
- 跟 `docs/iac.md`(开发视角)互补,这份是**采购视角**

### 实现

新建一个文件:`docs/onboarding-tencent.md`

内容覆盖 10 步:
1. 腾讯云账号注册 + 实名(10 分钟)
2. 买 Lighthouse 香港 VPS(15 分钟,先买 staging 一台)
3. 买域名 + 接入 DNSPod(10 分钟)
4. 创建 CAM 子账号 + AK/SK(10 分钟)
5. 创建 Terraform state COS bucket(5 分钟)
6. 生成 SSH 密钥(2 分钟)
7. 配 GitHub repo secrets / vars(10 分钟)
8. 改 `terraform/backend.tf` 填 bucket 名(2 分钟)
9. 本地首次 `terraform apply`(15 分钟)
10. 准备 `APP_ENV_STAGING` + push 代码触发部署(10 分钟)

附:
- 总成本估算表(¥80 一次性 + ¥43/月)
- 常见坑速查(VPS 创建超时 / 域名实名审核 / DNSPod 找不到域名 / 子账号策略名)
- 回来给开发的清单(APPID / VPS IP / 域名 / bucket 名,**不要贴 secret**)

### 关键文件

新建:`docs/onboarding-tencent.md`(~150 行)

### 关联文档

链接到:
- `docs/iac.md`(部署后日常运维)
- `docs/disaster-recovery.md`(灾备)
- `terraform/environments/*.tfvars.example`(变量参考)

### 验证

写完后 `cat docs/onboarding-tencent.md` 自己复习一遍,确认:
- 步骤连续,中间不需要看别的文档
- 命令可复制粘贴
- 链接全部可点
- 没贴任何示例的真实凭证

实施完成后,把本节挪到 `docs/plans/2026-05-13-onboarding-doc.md`。
