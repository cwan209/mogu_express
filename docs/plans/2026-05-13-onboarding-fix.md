## 当前活动 plan — 修正 onboarding doc(2026-05-13)

### Context

用户阅读 `docs/onboarding-tencent.md` 后困惑:"为什么让我手动买 VPS?Terraform 不就能一键创建吗?"

确实如此。Terraform 已能自动创建 Lighthouse 实例、COS bucket、DNS 记录、TencentDB 副本集、安全组等。**真正必须人工的只有 bootstrap 性质的事**:
- 创建腾讯云账号(实名/人脸识别 — Terraform 救不了)
- 域名注册 + 实名(工信部要求)
- CAM 第一个子账号 + AK/SK(生成 Terraform 用的凭证)
- State bucket(state 自己得有个家,鸡蛋问题)
- SSH key 生成(本地操作)
- GitHub Secrets 配置(另一个服务)

原 doc 步骤 2 让用户去腾讯云控制台买 Lighthouse,这是冗余的。同时区域确认保持 HK(海外主体不能 ICP 备案,无法用大陆服务器)。

### 改动范围

**唯一文件**:`docs/onboarding-tencent.md`

### 具体修改

1. **步骤 2 重写**:从"买 Lighthouse 香港 VPS"改为"账号充值就绪 — VPS 由 Terraform 创建"
   - 删除控制台手动购买步骤
   - 保留套餐选型说明(成本/规格参考,让用户心里有数)
   - 强调:`terraform apply` 会用 `tencentcloud_lighthouse_instance` 资源自动创建
   - 提醒:确保账号余额够 ≥ ¥50

2. **步骤 5 标题强调"bootstrap"**:State bucket 是真正必须手动的,标注鸡蛋问题原因

3. **步骤 9 重写**:`terraform apply` 这一步现在实际创建了:VPS + COS images bucket + CAM cos_writer 子账号 + DNS 三条 A 记录 + **TencentDB Mongo 副本集** + 安全组
   - 列出 apply 后会创建什么,让用户对"自动化范围"有信心
   - 强调 apply 时长 ~20 分钟(TencentDB 创建慢)

4. **顶部加段"哪些手动 vs 哪些自动"对照表**(类似今天聊天里的那张表),让读者一上来就知道全局

5. **区域说明加 note**:明确"海外主体当前选香港,因 ICP 备案限制",指向未来若有境内代备案主体可迁上海

6. **删除"先只买 staging,验证 OK 再加 prod"那句多余话**(Terraform 用 workspaces 切两环境,没有"先买后买")

### 关键文件

- 改:`docs/onboarding-tencent.md`

### 验证

写完后:
- `cat docs/onboarding-tencent.md | head -80` 确认对照表清晰
- 步骤 2 不再让用户手动买 VPS
- 步骤 9 列出 terraform apply 创建的全部资源
- 香港区域选择有明确合规原因说明

### 提交

完成后:
1. 改 `docs/onboarding-tencent.md`
2. 归档此 plan 到 `docs/plans/2026-05-13-onboarding-fix.md`(或追加到已有 `2026-05-13-onboarding-doc.md`)
3. commit + push
