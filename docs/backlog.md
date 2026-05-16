# Backlog

> 甲方提出的功能需求清单(分批),按 P 级分 sprint。
> 已实现的标 ✅ 跳过;clarify 的标 ❓ 等答案;未做的标 🆕。
> 每条带工作量估算(我方),帮排期。

---

## Batch 1 — 2026-05-16 甲方需求

来源:聊天记录"未实现要求"长列表。
分析配套:`docs/decisions/2026-05-16-auth-and-notifications.md`(之前的 OAuth + 小红点决策)。

### ✅ 已实现(在 Phase 1 + Phase 2 工作中顺便做了,无需再做)

| 项 | 落地 commit |
|---|---|
| OAuth 第一次弹窗询问授权 | `05b9dbb` snsapi_userinfo |
| 微信昵称 / 头像 作为账号显示 | `585b116` Profile.tsx |
| 不显示电话号码 | `1731806` |
| 订单 tab 红点 | Task 15 (`b44b87d`) |
| 首页待付订单弹窗 banner | Task 13 (`0e00b42`) |
| 单笔尾款支付(admin 输金额 + 用户支付) | Task 8-14 |
| 退款处理 | 现有 `_admin/processRefund` |
| 复制团购模板含价格 | 现有 `_admin/tuanCRUD copyFromTuan` |
| 商品图片上传 | 现有 `_admin/uploadImage` |

### Sprint 1(P0 核心,~3 天)— 业务最迫切

> **驱动**:团购上线后立刻要用的功能,没有它生产跑不动。

- [ ] **群号字段**(~1h)
  - user schema 加 `groupId?: string`
  - RegisterProfile 改为单字段"群号"(替代姓名+电话)— OAuth 已拿昵称头像
  - admin OrderDetail 显示用户群号
- [ ] **订单 tracking 备注**(~30min)
  - order schema 加 `tracking: { weight?, courierNo? }`
  - admin UI:跟 setShippingFee 同 Card,加 2 输入框
  - 用户订单详情显示
- [ ] **Excel 批量上传运费**(~1 天)
  - 后端 cf `_admin/uploadShippingFeesXlsx`:接 base64 xlsx → 用 `exceljs`(已有依赖)解析 → 按订单号 batch update `shippingFee` + `tracking`
  - admin 加批量上传 UI(选 xlsx → 预览匹配结果 → 确认)
  - 模板格式:`订单号 | 实际总重量(kg) | 应补尾款(¥) | 快递单号`(待 clarify 列名)
- [ ] **商品 schema 扩展**(~1 天)
  - product 加字段:`brand`, `spec`, `basePrice`(正常收录价), `englishName`, `courierName`, `courierFactor`, `secondaryImages: [{url, caption}]`
  - admin productCRUD UI 加输入框
  - 创建 tuan 模板时自动调取(已有 copyFromTuan)
- [ ] **订单买家/卖家备注**(~30min)
  - order schema 加 `notes: { buyer?, seller? }`
  - admin OrderDetail 编辑框
  - 用户端订单详情显示 buyer 备注

### Sprint 2(P1 增强,~4-5 天)— UX 提升

- [ ] **我的页顺序调整**(~15min)
  - 当前:用户卡片 → 订单/购物车/地址 → 完善资料 → 退出
  - 改:账号信息 → 收货地址 → 我的订单 → 优惠券(等优惠券做完才能加)
- [ ] **首页 Swiper 滚动 banner**(~半天)
  - announcements collection: `{id, image, link, sortOrder, active, startAt, endAt}`
  - admin CRUD 公告
  - 首页用 antd-mobile `Swiper` 组件渲染
- [ ] **购物车后端持久化**(~半天)
  - 后端 cf `saveCart` / `getCart`,按 `_openid`
  - 前端首次 OAuth 后 sync localStorage → mongo;每次改 cart 双写
  - 跨设备一致(Luke 的手机和电脑微信都看到同一购物车)
- [ ] **商品 tag 功能**(~半天)
  - tuan_item 加 `tags: string[]`(新品 / 过敏 / 易变形 等)
  - admin 输入框(下拉多选 + 自由填)
  - 前端 TuanDetail 商品卡上展示彩色 tag
- [ ] **订单导出 verify + 微信号字段**(~半天)
  - check `_admin/exportOrders` 是否含 `wechat.nickname` / openid
  - 没有则加;格式跟甲方对齐
- [ ] **优惠券系统**(~1.5 天)
  - coupons collection: `{code, type:'fixed'|'percent', value, validFrom, validTo, perUserLimit, totalLimit, used}`
  - user_coupons collection: 用户领的券(状态)
  - admin 发券 UI(批量生成 + 列表 + 失效)
  - 前端 Checkout 选券 + 显示减免后总价
  - createOrder 校验券有效性 + 标记 used
- [ ] **尾款 summary 页**(~2h)
  - 单独 route `/pending-shipping`,列出所有待付尾款订单清单
  - 首页 banner 点击跳这,而不是混在 `/orders?filter=...`
- [ ] **我的页"优惠券"入口**(随优惠券)
  - 顺手补 Sprint 2 第一项的待补 entry

### Sprint 3(P2 后续,~1 天)— admin 加强

- [ ] **批量创建商品(Excel)**(~半天)
  - 后端 cf `_admin/uploadProductsXlsx`:接 xlsx → 批量 insert
  - 模板格式待定(品牌 / 规格 / 价格 / 名称 / 英文名 / 快递名 / 系数)
  - 图片不在 xlsx,后续单独上传
- [ ] **用户管理**(~半天)
  - admin 加 `/users` 页面:列表(分页)+ 搜索(手机/昵称/openid)+ 看详情
  - 操作:加备注 / 标签 / 禁用(soft delete with `disabled: true` flag)
  - 用 user.disabled = true 时,wxLogin / verifyOtp 拒绝返 token

---

## ❓ Clarify(等甲方答复后再开 sprint 1)

1. **"账号 login 保存"** 啥意思?换设备保留?如果是 → OAuth 已经做到(同微信号在任何设备进自动登录)
2. **群号干嘛用**?统计每团从哪个群来?用户分组运营?
3. **"运费限制为一个"** 啥意思?每团一笔运费?每订单一笔?
4. **优惠券规则**:
   - 减免规则:固定金额(-¥10)还是百分比(8 折)还是两种都要?
   - 能跟运费叠加吗?
   - 单订单限用一张还是多张?
   - 用户怎么领:管理员发到指定 openid?还是自助领?
5. **用户管理深度**:
   - 只看 list + 搜索?
   - 加 ban?
   - 改密码 / 解绑微信?
6. **批量创建商品**:
   - Excel 哪些列?
   - 图片是否在 Excel 里 URL?还是先建空商品再人工传?
7. **Excel 模板**:运费上传 / 商品上传 — 甲方有现成模板吗?第一行 header 中文/英文?

---

## 排期建议

```
Week 1 (5 工作日):
  Mon-Tue:   Sprint 1 P0 全部 (3 天) — 群号/tracking/Excel 运费/商品扩展/订单备注
  Wed-Thu:   Sprint 2 前半 — 我的页 / 首页 banner / 购物车后端 / tag
  Fri:       Sprint 2 后半 — 订单导出 / 尾款 summary

Week 2 (3-5 工作日):
  Mon-Tue:   优惠券系统(独立大模块)
  Wed:       Sprint 3 批量创建商品 / 用户管理
  Thu-Fri:   集成测试 + bugfix + 跟甲方过一遍验收
```

每个 sprint 结束后:
- 写 plan 到 `docs/superpowers/plans/`
- 走 subagent-driven 实施
- staging 验证
- prod 上线(等公众号 + HuePay 真凭证 ready)
