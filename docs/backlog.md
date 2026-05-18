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

### Sprint 1.1 ✅ 完成(2026-05-18)— 数据 schema + OAuth-only 清理

> 实施 spec: `docs/superpowers/specs/2026-05-18-sprint1.1-data-schema-oauth-cleanup-design.md`
> 实施 plan: `docs/superpowers/plans/2026-05-18-sprint1.1-data-schema-oauth-cleanup.md`
> 17 commits,test-shim 41 → 51 passing,deploy + E2E 全过。

- [x] **群号字段**:user.groupId,RegisterProfile 单字段重写,admin 显示
- [x] **订单 tracking**:order.tracking{weight,courierName,courierNo,setAt},新 _admin/updateTracking cf,用户端"物流信息"Card
- [x] **订单买家/卖家备注**:order.notes{buyer,seller},新 _admin/updateOrderNotes cf,用户端"📣 团长留言"Card
- [x] **商品 schema 扩展**:7 字段(brand/spec/basePrice/englishName/courierName/courierFactor/secondaryImages),admin ProductEdit + 联动 TuanEdit
- [x] **OAuth-only 身份清理**:删 sendOtp/verifyOtp/Login.tsx,createOrder 去 name/phone check,userSnapshot 重定义为 {nickname,avatar,groupId},isRegistered 改用 groupId

### Sprint 1.2 ✅ 完成(2026-05-18)— Excel 批量上传运费

> 实施 spec: `docs/superpowers/specs/2026-05-18-sprint1.2-excel-batch-shipping-fees-design.md`
> 实施 plan: `docs/superpowers/plans/2026-05-18-sprint1.2-excel-batch-shipping-fees.md`
> 7 commits(`b56c91b` → `8b097f0`),test-shim 51 → 56 passing,deploy + E2E 全过(`MG2026051820003932AA07` 实测保留 `courierName: 顺丰`)。

- [x] **后端 cf `_admin/uploadShippingFeesXlsx`**:base64 xlsx → exceljs 解析 → 5 种状态(matched/not_found/already_paid/invalid/duplicate_in_file/apply_failed)+ dryRun bool 双相(预览 / 应用)
- [x] **admin UI**:Orders 页顶部 "Excel 批量运费" 按钮 → BatchShippingFeeModal 3-phase(pick / preview / result),含下载模板按钮 + before 列(显示会被覆盖的数据)
- [x] **模板格式**:`订单号 | 实际总重量(kg) | 应补尾款(¥) | 快递单号`,4 列 header 严格匹配(顺序可变),500 行/2MB 上限
- [x] **加固**:per-row try/catch(部分失败可见)、`tracking.courierName` 保留既有值(不被 null 清空)、audit log 含 admin/total/applied/failed/orderNos(前 50)

### Sprint 2 ✅ 完成(2026-05-18 → 2026-05-19,~5 hours focused)— UX 提升

> Sprint 2 ✅ 完成(2026-05-18 → 2026-05-19)— 7 项全部上 staging。
> 13 commits(`8a5b803` → `f909cd9`),test-shim 56 → 68 passing,deploy 全过。
> Clarify 设计:优惠券 fixed-only / 不叠运费 / 单订单一张 / admin 给指定 openid 发券。

- [x] **我的页顺序调整**(`8a5b803`):账号信息 → 收货地址 → 我的订单 → 修改群号(原"完善资料"按内容改名)→ 退出。删购物车 entry(底 tabbar 已有)
- [x] **首页 Swiper banner**(`a762aa3` `70c7a35` `a51a843`):
  - announcements collection `{image,link,sortOrder,active,createdAt,updatedAt}`(`active` 手动上下架,startAt/endAt YAGNI)
  - 后端 `_admin/announcementCRUD` + 公开 `listAnnouncements` + uploadImage 加 `announcement` purpose
  - admin 新页 `/announcements`(Table + Modal + ImageUploader)
  - web-shop Home 加 antd-mobile `Swiper`(autoplay 4s + loop,点击跳 `b.link` 站内)
- [x] **购物车后端持久化**(`9174b1d` `17a67a2` `82b2be9`):
  - 后端 `upsertCart` 加 `replace` 模式(客户端权威全量覆盖)
  - web-shop store/cart.ts 加 `syncedFromServer` + `hydrateFromServer`;login 时 getCart 覆盖 local(server wins);用户改 cart → debounce 800ms → replaceCart push
  - 修 hydrate echo race(两次 set 分开触发,避免刚拉的 items 被回推)
- [x] **商品 tag 功能**(`7a4931a`):tuan_item.tags string[],trim/dedupe/cap 10/每条≤20;admin TuanEdit Modal `Select mode="tags"` + 6 预设;web-shop TuanDetail 商品卡彩色 Tag 循环 4 色
- [x] **订单导出 verify + 微信号字段**(`b823ebd`):exportOrders 加 3 列(微信昵称 / 群号 / openid)插在姓名前;mock 同步加列
- [x] **优惠券系统**(`b6836f4` `cc3a911` `aea916b`):
  - 后端 coupons collection + 3 cf(`_admin/issueCoupon`、`_admin/listCoupons`、公开 `listMyCoupons`)+ createOrder hook(校验归属/有效期/减 amount/标 used/zero 自动 paid 跳 HuePay)
  - admin 新页 `/coupons`(列表 filter status/openid + 发券 Modal)
  - web-shop Checkout 加 List.Item 选券 + Popup 选项 + 实付价划线 + couponId 传 createOrder
  - 新页 `/coupons` 我的优惠券(3 Tabs:未使用/已使用/已过期)
  - Profile 加 🎟️ 我的优惠券 入口
- [x] **尾款 summary 页**(`f909cd9`):新页 `/pending-shipping`(Card 列表 + 顶部 summary 横条 + 每单立即支付按钮)。PendingOrderBanner 多笔跳转改成 `/pending-shipping`,不再混在订单页。
- [x] **我的页"优惠券"入口**(随优惠券 `aea916b`)

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
