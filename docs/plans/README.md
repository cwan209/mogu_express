# Plans Archive

每个 plan 一个文件,按日期 + 主题命名。`brainstorming` skill / `writing-plans` skill 应往这里写新文件,不再往单个 plan 文件 append。

## 索引(按时间)

| 日期 | 主题 | 状态 |
|---|---|---|
| 2026-04-12 | [初始规格 — M0-M5 + 数据库 + 云函数](./2026-04-12-initial-spec.md) | M0-M5 已实施 |
| 2026-04-15 | [真机首验修正(TDesign 品牌色 + 图片)](./2026-04-15-real-device-fixes.md) | 已实施 |
| 2026-04-19 | [团详情:团内分组 + 搜索](./2026-04-19-tuan-sections-search.md) | 已实施 |
| 2026-04-19 | [拿到正式 AppID:测试号 → 企业号 + 云开发(海外主体禁用)](./2026-04-19-real-appid-cloud-migration.md) | 阶段 A 已实施,B-E 因海外主体被拒中止 |
| 2026-04-22 | [Web 后台本地图片上传(MinIO/COS)](./2026-04-22-image-upload.md) | 已实施 |
| 2026-04-26 | [退款功能(请求 + 审批)](./2026-04-26-refund-feature.md) | 已实施 |
| 2026-05-09 | [项目暂停 — 商业模式重新评估](./2026-05-09-business-model-pause.md) | 决策点,无代码 |
| 2026-05-11 | [H5 商城重做(替代微信小程序)](./2026-05-11-h5-pivot.md) | M0' → M3' 已实施 |
| 2026-05-12 | [IaC 化 — Terraform + GitHub Actions](./2026-05-12-iac-terraform.md) | 已实施 |
| 2026-05-13 | [COS state backend + Mongo 备份](./2026-05-13-cos-backend-mongo-backup.md) | 已实施 |
| 2026-05-13 | [腾讯云 Onboarding 指南](./2026-05-13-onboarding-doc.md) | 已实施 |
| 2026-05-13 | [迁移到 TencentDB for MongoDB](./2026-05-13-tencentdb-mongo.md) | 已实施 |

## 写新 plan 的约定

- 文件名:`YYYY-MM-DD-<short-topic>.md`
- 每个 plan **独立成文**,不要 append 到已有文件
- Plan 模式生成的 `~/.claude/plans/<name>.md` 在 ExitPlanMode 后**搬到这里**,plan 文件清空
- 主索引(这个 README)由开发手动维护一行
