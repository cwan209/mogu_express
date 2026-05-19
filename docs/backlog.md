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

### ⏸️ HuePay 真接入 — 等凭证(2026-05-19 客户端代码已对齐文档 `fc56890`)

> 代码全套已按 2025.10 HuePay 文档重写:`gw.huepay.com.au/api` + MD5HEX 签名 + camelCase + 2-stage JWT token cache + 73 test-shim passing。
> staging 仍 HUEPAY_STUB=1,业务流走 stub 不受影响。

**等 HuePay 业务对接人发的凭证 + 信息**:
- `accessCode`(32 字符,X-AccessCode)
- `secretKey`(2048 字符,X-SecretKey,亦用作签名密钥)
- 凭证分两套:UAT + Prod
- 「查询订单」和「申请退款」endpoint 真实路径(代码当前猜的是 `/acquire/payment/query` 和 `/acquire/payment/refund`,UAT 跑会暴露 404)
- `nextAction.sdkData` 是否含 `signType` 字段(代码默认 `'RSA'`)

**收到 UAT 凭证后**(~30 min):
1. `deploy/.env` 加 4 个 env vars + 重启 api 容器:
   ```bash
   HUEPAY_STUB=0
   HUEPAY_ENV=uat
   HUEPAY_ACCESS_CODE=<32 char>
   HUEPAY_SECRET_KEY=<2048 char>
   HUEPAY_NOTIFY_URL=https://api-staging.moguexpress.com/cloud/payCallback
   ssh ubuntu@VPS 'cd /opt/mogu_express && sudo docker compose -f deploy/docker-compose.production.yml --env-file deploy/.env up -d'
   ```
2. 微信里登 Luke 账号 → 下单 → 确认 wx.requestPayment 弹真支付框(测试通道)→ 完成 → 看 payCallback 落 `pay_logs`,验签通过,订单变 paid。
3. 跑一次 `/admin/processRefund` 验退款 path 对不对 — 若 404 改成 HuePay 给的真路径。
4. 跑 `queryHuepayOrder` cf 验查单 path — 同上。
5. `docs/risks.md` 关 #3(HuePay 假回调风险) — 注上 UAT E2E 跑过的日期。

**UAT 跑稳后切 Prod**(~15 min):
1. `deploy/.env.prod` 同样 4 个 var,把 ENV=prod + 真 prod 凭证。
2. `HUEPAY_NOTIFY_URL=https://api.moguexpress.com/cloud/payCallback`(prod 域名)。
3. 前 7 天密切看 `pay_logs` 集合,有 `bad_sign` / `amount_mismatch` / `ship_amount_mismatch` 立刻告警。

**注**:HuePay 的 `notificationUrl` **必须公网可达 HTTPS**,且 staging.* 跟 prod 走不同回调地址 — 避免 UAT 数据污染 prod 订单。

---

### Sprint 3 ✅ 完成(2026-05-19)— admin 加强

> 2 commits(`450aca4` + `d23b494`),test-shim 73 → 81 passing,deploy 全过。
> Clarify 5/6 已答:用户管理只做 list+搜+详情+备注+标签(不 ban / 不改密码);商品 Excel 7 字段 + 描述(图片后传)。

- [x] **批量创建商品(Excel)**(`450aca4`,~半天):
  - 后端 `_admin/uploadProductsXlsx`:8 列 header(商品名/品牌/规格/基础价元/英文名/快递公司/系数/描述),5 种状态(`created`/`already_exists`/`invalid`/`duplicate_in_file`/`apply_failed`),dryRun 双相,per-row try/catch,basePrice 元→cents,COURIER_ENUM 校验
  - admin Products 页 catalog view 顶部加"Excel 批量上传"按钮(tuan-filter view 不显示,语义对齐)
  - 沿用 Sprint 1.2 BatchShippingFeeModal 3-phase pattern
- [x] **用户管理**(`d23b494`,~半天):
  - 后端 `_admin/userCRUD`:list(分页 + keyword 模糊匹配 nickname/openid/groupId)+ update(白名单严格,只允许改 `adminNotes`/`adminTags`)
  - users 文档加 `adminNotes` (string ≤500) + `adminTags` (string[] ≤10, 每条 ≤30 字)
  - admin /users 页:Table(头像 + 昵称 + openid + 群号 + 备注 + 标签 + 订单数 + 总金额)+ filter bar + 编辑 Modal
  - **未做**:ban / 改密码 / 解绑微信(按 backlog clarify 5 用户回答简化范围)

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
