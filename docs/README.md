# 文档总纲

> 项目所有文档的入口与归类。新人先看 [快速导航](#快速导航);具体找文件用 [完整索引](#完整索引)。
> 写新文档前看 [文档生命周期](#文档生命周期),避免重复或乱放。

仓库根 `README.md` 是项目入口(产品定位 + 里程碑 + 跑起来一句话)。本文是 `docs/` 目录的索引。

---

## 快速导航

| 我是…… | 从哪里开始 |
|---|---|
| **第一次接触这个项目** | 根 [`README.md`](../README.md) → [`onboarding-tencent.md`](./onboarding-tencent.md)(从零到上线)→ [`local-dev.md`](./local-dev.md)(本地跑) |
| **要本地跑起来开发** | [`local-dev.md`](./local-dev.md) — 5 分钟 Docker 全栈 |
| **要部署到生产 / staging** | [`deploy-tencent-hk.md`](./deploy-tencent-hk.md)(腾讯云 HK 主路径)+ [`iac.md`](./iac.md)(Terraform 操作)+ [`staging-readiness.md`](./staging-readiness.md)(收尾清单) |
| **看现在做了什么 / 还要做什么** | [`backlog.md`](./backlog.md)(甲方需求 Sprint 排期)+ [`STATUS_REPORT.md`](./STATUS_REPORT.md)(给甲方看的状态)|
| **要演示给甲方** | [`DEMO_SCRIPT.md`](./DEMO_SCRIPT.md) — 3-5 分钟录屏脚本 |
| **遇到事故 / 数据要恢复** | [`disaster-recovery.md`](./disaster-recovery.md) |
| **过 prod 上线前 review** | [`risks.md`](./risks.md) 风险登记册 + [`staging-readiness.md`](./staging-readiness.md) |
| **想了解为什么这么设计** | [`decisions/`](./decisions/) ADR + [`plans/README.md`](./plans/README.md) 历史 plan |
| **看当前 Sprint 在做什么** | [`superpowers/specs/`](./superpowers/specs/) 设计 + [`superpowers/plans/`](./superpowers/plans/) 实施 |

---

## 完整索引

### 1. 入门 / 现状

| 文件 | 说明 |
|---|---|
| [`../README.md`](../README.md) | 项目主入口:产品定位 + M0-M5 里程碑 + 一句话跑起来 |
| [`onboarding-tencent.md`](./onboarding-tencent.md) | **从零到上线指南**(腾讯云国际版 + Cloudflare DNS 采购视角) |
| [`STATUS_REPORT.md`](./STATUS_REPORT.md) | 给甲方看的现状报告(v0.5 / 2026-04-16) |
| [`DEMO_SCRIPT.md`](./DEMO_SCRIPT.md) | 3-5 分钟录屏演示脚本 |

### 2. 产品 / 需求 / 决策

| 文件 | 说明 |
|---|---|
| [`backlog.md`](./backlog.md) | **甲方需求 Sprint 排期**(Sprint 1.1 ✅ / 1.2 ✅ / 2 ✅ / 3 待做),P 级标注 + 工作量估算 |
| [`risks.md`](./risks.md) | 风险登记册 — staging → prod 前逐条 review |
| [`decisions/2026-05-16-auth-and-notifications.md`](./decisions/2026-05-16-auth-and-notifications.md) | ADR:OAuth + 小红点通知架构 |
| [`../to_do.md`](../to_do.md) | 早期甲方需求草稿(已并入 `backlog.md` Batch 1,保留作历史) |

### 3. 开发

| 文件 | 说明 |
|---|---|
| [`local-dev.md`](./local-dev.md) | **本地 Docker 完整栈** — 无需真实 微信云开发 / HuePay 凭证 |
| [`mongo-viewer.md`](./mongo-viewer.md) | 简易 HTML MongoDB viewer(`npm run viewer`)— 浏览器看本地 / staging 数据 |
| [`cloud-migration.md`](./cloud-migration.md) | 微信云开发迁移指南(早期方案,2026-05-09 后已弃,转 H5) |

### 4. 部署 / 运维

| 文件 | 说明 |
|---|---|
| [`deploy-tencent-hk.md`](./deploy-tencent-hk.md) | **生产部署主路径**:腾讯云轻量香港 + Caddy + Docker Compose |
| [`deploy.md`](./deploy.md) | 通用 VPS 部署(`local-backend/` 整套搬到公网服务器) |
| [`iac.md`](./iac.md) | **IaC 操作手册** — Terraform + GitHub Actions plan/apply/deploy |
| [`staging-readiness.md`](./staging-readiness.md) | Staging 收尾 Checklist — 全部勾完才能走 prod |
| [`disaster-recovery.md`](./disaster-recovery.md) | 灾备 — Mongo 备份/恢复、数据盘、跨区故障 |

### 5. 历史 plans(老风格,append/handoff 模式)

按时间逐个 plan 文件,索引见 [`plans/README.md`](./plans/README.md)。

完整列表(13 个):

- 2026-04-12 [初始规格 M0-M5 + 数据库 + 云函数](./plans/2026-04-12-initial-spec.md)
- 2026-04-15 [真机首验修正](./plans/2026-04-15-real-device-fixes.md)
- 2026-04-19 [团详情:团内分组 + 搜索](./plans/2026-04-19-tuan-sections-search.md)
- 2026-04-19 [正式 AppID 云开发迁移(中止)](./plans/2026-04-19-real-appid-cloud-migration.md)
- 2026-04-22 [Web 后台图片上传 MinIO/COS](./plans/2026-04-22-image-upload.md)
- 2026-04-26 [退款功能](./plans/2026-04-26-refund-feature.md)
- 2026-05-09 [项目暂停 — 商业模式重评](./plans/2026-05-09-business-model-pause.md)
- 2026-05-11 [H5 商城重做(关键转折)](./plans/2026-05-11-h5-pivot.md)
- 2026-05-12 [IaC 化 Terraform + GHA](./plans/2026-05-12-iac-terraform.md)
- 2026-05-13 [COS state backend + Mongo 备份](./plans/2026-05-13-cos-backend-mongo-backup.md)
- 2026-05-13 [腾讯云 Onboarding 文档](./plans/2026-05-13-onboarding-doc.md)
- 2026-05-13 [迁移到 TencentDB for MongoDB](./plans/2026-05-13-tencentdb-mongo.md)
- 2026-05-13 [修正 onboarding doc(去手动买 VPS)](./plans/2026-05-13-onboarding-fix.md)

### 6. 当前 sprints(新风格 superpowers — spec → plan → subagent-driven)

`docs/superpowers/specs/` 是 brainstorming 产物(设计 + trade-offs);`docs/superpowers/plans/` 是 writing-plans 产物(逐步骤实施清单)。

| Sprint | Spec(设计) | Plan(实施) | 状态 |
|---|---|---|---|
| **1.1** 数据 schema + OAuth-only | [`specs/2026-05-18-sprint1.1-data-schema-oauth-cleanup-design.md`](./superpowers/specs/2026-05-18-sprint1.1-data-schema-oauth-cleanup-design.md) | [`plans/2026-05-18-sprint1.1-data-schema-oauth-cleanup.md`](./superpowers/plans/2026-05-18-sprint1.1-data-schema-oauth-cleanup.md) | ✅ 完成(17 commits) |
| **1.2** Excel 批量上传运费 | [`specs/2026-05-18-sprint1.2-excel-batch-shipping-fees-design.md`](./superpowers/specs/2026-05-18-sprint1.2-excel-batch-shipping-fees-design.md) | [`plans/2026-05-18-sprint1.2-excel-batch-shipping-fees.md`](./superpowers/plans/2026-05-18-sprint1.2-excel-batch-shipping-fees.md) | ✅ 完成(8 commits) |
| **2** UX 提升 7 项 | —(无独立 spec) | —(直接 subagent-driven,记录见 `backlog.md`) | ✅ 完成(14 commits) |
| **预备**:OAuth + 待付订单 | — | [`plans/2026-05-16-oauth-and-pending-orders.md`](./superpowers/plans/2026-05-16-oauth-and-pending-orders.md) | 已实施(早于 Sprint 1.x) |

### 7. 子目录 README(代码导览,不在 docs/ 里)

| 文件 | 说明 |
|---|---|
| [`../cloudfunctions/README.md`](../cloudfunctions/README.md) | 云函数目录总览(每个 cf 的职责) |
| [`../local-backend/README.md`](../local-backend/README.md) | 本地 Express 后端(模拟云开发) |
| `../cloudfunctions/**/huepay/README.md` | HuePay SDK README × 7,**vendored 第三方**,不索引 |

---

## 文档生命周期

### 新写文档放哪儿?

| 类型 | 放哪儿 | 命名 |
|---|---|---|
| 设计 trade-off / 决策(为什么这么做) | `docs/decisions/` ADR | `YYYY-MM-DD-<topic>.md` |
| 新 sprint 设计(brainstorming 产物) | `docs/superpowers/specs/` | `YYYY-MM-DD-sprint<N>-<topic>-design.md` |
| 新 sprint 实施清单(writing-plans 产物) | `docs/superpowers/plans/` | `YYYY-MM-DD-sprint<N>-<topic>.md` |
| 长期运维手册 | `docs/` 根 | 全小写 + 短中线,如 `disaster-recovery.md` |
| 状态报告 / 演示稿 | `docs/` 根 | 大写下划线区分,如 `STATUS_REPORT.md` |
| 老风格 free-form plan(不推荐再写) | `docs/plans/` + 手工加索引 | `YYYY-MM-DD-<topic>.md` |

### 文档审查

- **`backlog.md` sign-off**:每个 sprint 完成后,在 `backlog.md` 把 `[ ]` 改成 `[x]`,加 commit SHA + 测试 / deploy 状态。
- **`plans/README.md`**:在 [Plans Archive] 表加一行索引(老风格 plan)。
- **本索引**:加新 sprint 时,在 [当前 sprints](#6-当前-sprintssuperpowers--spec--plan--subagent-driven) 表加一行。

### 已弃文档

如发现文档过期或被 superseded,**不要删** — 在文件顶部加一行:

```markdown
> ⚠️ 已弃(2026-MM-DD),用 [`new-doc.md`](./new-doc.md) 代替。原因:……
```

保留历史可追溯。`docs/cloud-migration.md`(2026-05-09 H5 pivot 后)是个例子。
