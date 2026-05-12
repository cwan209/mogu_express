# mogu_express 接龙团购小程序 - 实施计划

## Context

在空目录 `/Users/lukewang/WeChatProjects/mogu_express` 从零开发一个**单商家**的接龙式团购微信小程序(对标快团团但服务澳洲华人社区)。商家(团长)以**"团(批次)"** 为发布单位——每个团有开始和结束时间,包含多个商品,每个商品在详情页公开展示**已订购参与者名单**。顾客跨团加购/下单,只支持**快递(完整地址必填)**,使用 **HuePay 聚合支付**完成澳币结算。配套一个 **Web 管理后台**做团/商品/订单/数据导出等重操作,**小程序内**也有轻量管理 tab 给团长在手机上随时查看订单。分享支持**微信转发卡片**和**可保存的海报图(带商品图+价格+小程序码)**两种。

## 角色

- **顾客(C 端)**:浏览商品 → 加购物车 → 下单付款 → 看订单
- **团长(管理员)**:配置在数据库的 admin openid。Web 后台做商品上下架/分类管理/订单导出;小程序里看实时订单和总数
- **平台/HuePay**:支付通道与清结算

## 技术选型

| 部分 | 选型 |
|---|---|
| 小程序 | 原生微信小程序(JS/WXML/WXSS),`tdesign-miniprogram` UI 库 |
| 后端 | 微信云开发(云函数 + 云数据库 + 云存储) |
| Web 管理后台 | React + Vite + `antd` 或 `tdesign-react`,通过云函数 HTTP 触发器调用后端 |
| 支付 | **HuePay**(澳洲持牌聚合支付,微信小程序 JSAPI 通道,AUD 结算) |
| 部署 Web 后台 | 静态托管(微信云开发静态托管 / Vercel / Cloudflare Pages) |
| 数据导出 | 云函数生成 xlsx(`exceljs`)→ 云存储下载 |

## 需用户提前准备(实施前阻塞项)

1. **小程序 AppID**(必需,目前缺)
2. **云开发环境 ID**(在开发者工具开通)
3. **HuePay 商户接入**(M2 阻塞项):
   - 联系商务(`service@huepay.com.au`)完成 KYB
   - 拿到 `merchant_id` / `app_id` / `api_key` / `secret`
   - 索取:**API 文档(PDF/Postman)、签名算法、沙箱账号、回调格式**
   - HuePay 公开文档极少,所有接入细节必须靠商务对接
   - **备选**:若 HuePay 受阻,可换 Airwallex / Pingpong / Lianlian
4. **管理员 openid**(团长用自己微信扫一次拿到,写入 DB `admins`)
5. **Web 后台管理员账号**(用户名+初始密码,首次登录强制改)
6. **素材**:首页 banner、TabBar 图标、默认商品占位图
7. **类目与合规**:ICP 备案、用户协议、隐私政策、HuePay KYB 资料

## 仓库结构

```
mogu_express/
├── miniprogram/                   # 顾客小程序
│   ├── project.config.json
│   ├── app.js / app.json / app.wxss
│   ├── pages/
│   │   ├── index/                 # 首页(banner + 进行中的"团"列表)
│   │   ├── tuan-detail/           # 团详情(团文案/倒计时/团内商品列表/分类筛选)
│   │   ├── product-detail/        # 商品详情(图轮播/描述/团倒计时/已订购名单/加购)
│   │   ├── poster/                # 海报生成页(canvas 合成 商品图+价格+小程序码)
│   │   ├── cart/                  # 购物车
│   │   ├── order-confirm/         # 提交订单(选地址+备注+总价)
│   │   ├── pay-result/            # 支付结果
│   │   ├── orders/                # 我的订单列表
│   │   ├── order-detail/          # 订单详情
│   │   ├── profile/               # 个人中心(姓名/电话/地址/退出)
│   │   ├── address-edit/          # 收货地址编辑
│   │   ├── register/              # 首次绑定微信(姓名/电话/地址)
│   │   └── admin/                 # 团长 tab(订单总览/今日数据/导出入口)
│   ├── components/
│   │   ├── product-card/
│   │   ├── category-tabs/         # 可展开/合并的分类标签
│   │   ├── participant-strip/     # 商品详情页"已订购名单"
│   │   ├── countdown/             # 截止倒计时
│   │   └── cart-stepper/
│   ├── services/                  # 云函数封装
│   │   ├── tuan.js  product.js  category.js  cart.js  order.js  user.js  upload.js  admin.js  share.js
│   ├── model/                     # 枚举(OrderStatus, PayStatus)
│   ├── utils/                     # money(AUD格式)、date、share
│   ├── config/index.js            # cloudEnvId
│   ├── style/
│   └── custom-tab-bar/            # 首页 / 购物车 / 订单 / 我的(管理员多一个"管理")
│
├── cloudfunctions/                # 云函数(被小程序和 Web 后台共用)
│   ├── login/                     # wx.login → openid + upsert users
│   ├── registerProfile/           # 完善姓名/电话/地址(首次注册)
│   ├── listTuans/                 # 首页:进行中+即将开始的团
│   ├── getTuanDetail/             # 团详情 + 团内商品列表
│   ├── listProducts/              # 跨团商品查询(按分类搜索时用)
│   ├── getProductDetail/          # 商品详情 + 已订购参与者(脱敏)+ 团倒计时
│   ├── listCategories/
│   ├── genShareQrCode/            # wxacode.getUnlimited → 小程序码 fileId
│   ├── upsertCart/                # 购物车增删改(服务端持久化)
│   ├── getCart/
│   ├── createOrder/               # **核心**:事务校验/扣库存/建单/调 HuePay
│   ├── payCallback/               # HTTP 触发,HuePay 回调,验签+幂等
│   ├── queryHuepayOrder/          # 主动查单兜底
│   ├── cancelOrder/
│   ├── listMyOrders/
│   ├── getOrderDetail/
│   ├── listAddresses/  upsertAddress/  deleteAddress/
│   ├── _admin/                    # 管理员云函数(都校验 openid ∈ admins)
│   │   ├── adminLogin/            # Web 后台用户名密码登录,签 JWT
│   │   ├── tuanCRUD/              # 团的增删改 + 开始/关闭
│   │   ├── productCRUD/           # 商品上下架/编辑(必须属于某个团)
│   │   ├── categoryCRUD/
│   │   ├── listAllOrders/         # 后台订单查询(状态/日期/团/关键字)
│   │   ├── orderStats/            # 商品销量统计 / 按团汇总
│   │   ├── exportOrders/          # 生成 xlsx → 云存储 fileId
│   │   └── markShipped/
│   ├── _lib/huepay/               # HuePay SDK(签名/下单/查询/退款)
│   ├── _lib/auth/                 # JWT + admin 校验中间件
│   └── cron_tuanStatus/           # 定时:scheduled→on_sale(startAt到)、on_sale→closed(endAt到)、扫超时 pending
│
├── web-admin/                     # Web 管理后台(独立 SPA)
│   ├── package.json               # vite + react + antd + axios
│   ├── vite.config.js
│   └── src/
│       ├── api/                   # axios 调云函数 HTTP 触发器
│       ├── pages/
│       │   ├── Login.tsx
│       │   ├── Dashboard.tsx      # 今日 GMV / 订单数 / 进行中团数
│       │   ├── Tuans.tsx          # 团列表(草稿/进行中/已结束)
│       │   ├── TuanEdit.tsx       # 编辑团 标题/封面/开始结束时间/文案/商品列表
│       │   ├── Products.tsx       # 商品列表(可按团筛选)/上下架/编辑
│       │   ├── ProductEdit.tsx    # 归属团/分类/库存/价格/封面/多图
│       │   ├── Categories.tsx
│       │   ├── Orders.tsx         # 筛选(状态/日期/团)+ 导出按钮
│       │   └── OrderDetail.tsx
│       ├── auth/                  # JWT 存储 + 路由守卫
│       └── App.tsx
│
└── docs/                          # 接入文档(HuePay 私有,git ignore)
```

## 云数据库集合

### `users`
```
{ _openid (PK), nickName, avatar, name, phone, defaultAddressId, registeredAt, updatedAt }
```
`registeredAt` 区分"仅授权"和"完成注册"。索引:`_openid` unique。

### `addresses`
```
{ _id, _openid, recipient, phone, line1, line2, suburb, state, postcode, isDefault }
```
索引:`_openid`。

### `admins`
```
{ _id, openid, username, passwordHash, role:'owner'|'staff', createdAt }
```
单商家场景通常 1 条 owner。Web 登录用 `username/passwordHash`,小程序内管理 tab 用 `openid` 校验。

### `categories`
```
{ _id, name, sort, isActive, createdAt }
```

### `tuans`(团/批次)
```
{
  _id, title, description, coverFileId,
  startAt: Date, endAt: Date,
  status: 'draft'|'scheduled'|'on_sale'|'closed'|'archived',
  productCount,                      // 冗余,加速列表
  createdAt, updatedAt
}
```
索引:`status+endAt`、`startAt`。状态机:`draft`→`scheduled`(startAt 未到)→`on_sale`→`closed`(endAt 已过或手动关团)。

### `products`
```
{
  _id, tuanId,                       // 所属团(必须)
  title, description, coverFileId,
  imageFileIds: [string],            // 多图轮播
  categoryIds: [string],             // 可多分类(分类跨团共享)
  price,                             // AUD 分(整数,1AUD=100)
  stock, sold,                       // 不分 SKU,简单库存
  sort,                              // 团内排序
  participantCount,                  // 已订购人数(冗余,加速详情页)
  createdAt, updatedAt
}
```
商品**不单独存截止时间**,继承自所属 `tuan.endAt`。商品销售可用性 = `tuan.status='on_sale' && tuan.endAt>now && stock-sold>0`。索引:`tuanId+sort`、`categoryIds`、`createdAt`。规则:`read: true`,`write: false`。

### `carts`
```
{ _openid (PK), items: [{ productId, quantity, addedAt }], updatedAt }
```
单文档/用户。索引:`_openid` unique。

### `orders`
```
{
  _id, orderNo,                       // 订单号(展示用)
  outTradeNo,                         // 给 HuePay 的商户单号(unique)
  _openid, userSnapshot:{name,phone},
  items: [{ productId, title, price, quantity, subtotal, coverFileId }],
  amount,                             // AUD 分
  shipping: { recipient, phone, line1, line2, suburb, state, postcode },
  remark,
  status: 'pending_pay'|'paid'|'shipped'|'completed'|'cancelled'|'refunded',
  payStatus: 'none'|'pending'|'paid'|'failed'|'refunded',
  paidAt?, shippedAt?,
  createdAt, updatedAt
}
```
索引:`_openid+createdAt`、`status+createdAt`、`outTradeNo` unique、`items.productId`(销量统计)。规则:`read/write: false`,全走云函数。

### `pay_logs`
HuePay 回调原始日志,云函数写。

### `participant_index`(可选,详情页性能)
按 `productId` 维护已付款顾客的脱敏快照(`{productId, _openid, nickName, avatar, paidAt}`),从 `payCallback` 写入。

## 云函数关键职责

| 云函数 | 要点 |
|---|---|
| `login` | `cloud.getWXContext` 拿 openid,upsert `users`,返回 `{openid, isRegistered, isAdmin}` |
| `registerProfile` | 校验姓名/电话/地址非空,写入 users + 创建默认 address |
| `listTuans` | 首页:`status in [scheduled, on_sale]`,按 `endAt asc` 排序 |
| `getTuanDetail` | 团 + 商品列表(按 sort)+ 倒计时 |
| `listProducts` | 可按 `tuanId`/`categoryId` 过滤,只返回团处于 on_sale 且 stock>sold 的 |
| `getProductDetail` | 商品 + 团信息(含 endAt)+ 最近 N 个已订购顾客脱敏快照 |
| `genShareQrCode` | 调 `wxacode.getUnlimited`,scene 传短 hash(tuanId/productId),存云存储,返 fileId |
| `upsertCart` / `getCart` | 购物车服务端持久化,合并而非替换 |
| `createOrder` | **`db.runTransaction`**:逐项校验商品所属团 `status=on_sale && endAt>now`、库存 → inc sold → 建 pending 订单 → 调 HuePay `createOrder` → 返 `payParams` |
| `payCallback` | HTTP 触发:验 HuePay 签名 → 按 outTradeNo 幂等更新 paid + 累加 `product.participantCount` + 写 `participant_index` + 落 `pay_logs` |
| `queryHuepayOrder` | 主动查单,回调丢失兜底 |
| `cancelOrder` | 仅 `pending_pay` 可取消,事务回滚 sold |
| `listMyOrders` / `getOrderDetail` | 按 `_openid` 查 |
| `_admin/adminLogin` | bcrypt 校验密码,签 JWT(7 天),返回 token |
| `_admin/tuanCRUD` | 团的增删改;startAt/endAt 校验;已有成交订单时禁改时间 |
| `_admin/productCRUD` | 上传图先到云存储拿 fileId,再保存;商品必须挂在某个 tuanId 下;已售出的限制改价 |
| `_admin/listAllOrders` | 状态/日期/关键字筛选,分页 |
| `_admin/exportOrders` | `exceljs` 生成两个 sheet:订单明细 + 商品销量汇总 → 上传云存储 → 返回临时下载链接 |
| `_admin/markShipped` | 批量/单个标记发货,记录 shippedAt |
| `cron_tuanStatus` | 每 5 分钟:`scheduled && startAt<=now` → on_sale;`on_sale && endAt<=now` → closed;扫 `pending_pay` 超 30 分钟 → 查 HuePay → 未支付则取消并回滚 sold |

**云函数 HTTP 触发器**:`payCallback` 和所有 `_admin/*` 通过 `cloud.callFunction` 走小程序内调用;Web 后台需要 HTTP 触发器开放公网 HTTPS 入口,前面套云函数网关 + JWT 校验。

## Web 管理后台关键点

- 路由:`/login`、`/dashboard`、`/products`、`/products/edit/:id`、`/categories`、`/orders`、`/orders/:id`
- 状态管理:zustand 或 Context(轻量,不引 redux)
- 表格:antd `Table` + 服务端分页/筛选
- 上传:axios → `_admin/uploadImage` 云函数(走 base64 或预签名)
- 导出:点击"导出当前筛选" → 调 `_admin/exportOrders` → 拿到下载链接 → `window.open`
- JWT 存 `localStorage`,axios 拦截器加 header,401 跳登录

## 核心时序

**A. 顾客付费下单**
1. 加购 → 购物车页 → 结算 → `order-confirm`
2. 选地址 + 备注 + 确认 → 调 `createOrder`
3. 云函数事务:校验所有商品 status/deadline/库存 → inc sold → 建订单(pending_pay)→ 调 HuePay → 返回 payParams
4. 小程序 `wx.requestPayment(payParams)`
5. HuePay 回调 → `payCallback` 验签 → 幂等更新 paid + 写参与名单
6. 前端跳 `pay-result` 页 + 调 `queryHuepayOrder` 兜底刷新

**B. 团长 Web 后台导出**
1. 登录 → 订单页选日期范围/状态 → 点"导出"
2. axios 调 `_admin/exportOrders`(带 JWT 和筛选条件)
3. 云函数生成 xlsx → 上传云存储 → 返回 fileId 的临时 URL
4. 浏览器下载

## 里程碑

| PR | 范围 | 验收 |
|---|---|---|
| **M0** 脚手架 | 小程序骨架 + TDesign + 云环境 + login + Web 后台 vite 骨架 + adminLogin | 顾客可登录拿 openid;团长能用密码登 Web 后台 |
| **M1** 团与商品浏览 | 团列表/团详情/商品详情/参与名单/倒计时 + 后台团 CRUD + 商品 CRUD(挂团)+ 分类管理 + 图片上传 | 团长 Web 建团 → 配商品 → 顾客小程序看到团与商品 |
| **M2** 购物车+下单(免支付) | 购物车 + 地址簿 + createOrder(模拟支付直接 paid) + 我的订单 + 后台订单列表 | 端到端下单成功,后台能看到订单 |
| **M3** HuePay 接入 | HuePay SDK + 真实 createOrder 调用 + payCallback + 失败重试 + 取消 | 沙箱+真机 0.01 AUD 下单成功并扣库存 |
| **M4** 后台增强 | 数据导出(xlsx)+ 销量统计 + 标记发货 + cron 自动关团 + 小程序管理 tab | 团长可一键导出今日订单 Excel,过期商品自动下架 |
| **M5** 分享与打磨 | 转发卡片(onShareAppMessage)+ 海报生成页(canvas 合成 商品图+价格+小程序码)+ 订阅消息 + 空态错误 + 真机 | 顾客可一键转发团卡片;可保存商品海报到相册 |

**实施顺序建议**:M0 → M1 → M2 完整跑通 → 并行联系 HuePay 拿文档 → M3 → M4 → M5

## 关键风险

1. **HuePay 文档缺失(最大风险)**:无公开 API 文档/SDK/沙箱说明。M2 前必须拿到完整接入包,否则 M3 无法启动。先做 M0–M2 免支付版,可避免阻塞
2. **库存并发**:必须 `db.runTransaction`,逐项扣减
3. **支付幂等**:`outTradeNo` unique + `payCallback` 按当前 payStatus 判断
4. **HuePay 内容安全**:调研其官网内容时疑似检出 prompt injection 向量,后续让 AI 抓 HuePay 文档要隔离审阅
5. **Web 后台跨域**:HTTP 触发器配置 CORS;JWT 用 HS256 + 长随机 secret
6. **图片上传**:微信云存储有大小/数量限制,商品图建议前端压缩(`wx.compressImage`)
7. **AUD 货币**:全链路用整数分(int),前端 `$ {(amount/100).toFixed(2)} AUD`
8. **小程序码 scene 32 字符**:商品分享用短 hash
9. **冷启动**:`createOrder`/`payCallback` 设预留实例
10. **管理员误操作**:删除/下架要二次确认;价格修改记审计日志(可后期加)

## 关键文件(实施时创建)

- `mogu_express/project.config.json` — AppID + cloudfunctionRoot
- `mogu_express/miniprogram/app.js` — `wx.cloud.init({env})` + 启动登录
- `mogu_express/cloudfunctions/createOrder/index.js` — **最关键**,事务+HuePay 下单
- `mogu_express/cloudfunctions/payCallback/index.js` — HTTP 触发,验签+幂等
- `mogu_express/cloudfunctions/_lib/huepay/index.js` — HuePay SDK 封装
- `mogu_express/cloudfunctions/_admin/exportOrders/index.js` — exceljs 导出
- `mogu_express/cloudfunctions/_lib/auth/index.js` — JWT + admin 校验
- `mogu_express/web-admin/src/api/client.ts` — axios + JWT 拦截器

## 验证

- **小程序端到端**:开发者工具,登录→注册→浏览→加购→下单→支付→看订单
- **Web 后台**:`vite dev` 起,登录→上传商品→改价→看订单→导出 Excel 打开核对
- **支付**:HuePay 沙箱 + 真机小额(0.01 AUD)
- **并发**:开两个开发者工具实例同时下单 stock=1 的商品,验证只 1 单成
- **回调**:用 ngrok/cpolar 转发 HuePay 回调到本地云函数(若沙箱支持)或直接部署测
- **导出**:筛选最近 7 天 → 导出 → 打开 xlsx 检查列、订单总数、商品销量页

## 关于 dev server 与 launch.json

- 小程序本身由微信开发者工具运行,不是 Node dev server,无需 `launch.json` 条目
- **Web 后台启动**:`web-admin/` 用 `npm run dev`(Vite,默认 5173)
- M0 完成后,在 `mogu_express/` 创建 `.claude/launch.json`,加一条:
  ```json
  {
    "name": "web-admin",
    "runtimeExecutable": "npm",
    "runtimeArgs": ["run", "dev", "--prefix", "web-admin"],
    "port": 5173
  }
  ```
- 当前 `mogu_express/` 为空目录,**没有可启动的 dev server**,先不创建 `launch.json`

## 下一步

1. 收齐:**AppID、云环境 ID、管理员 openid、Web 后台初始用户名密码**
2. 启动 M0(脚手架);并行向 HuePay 商务索取 API 文档
3. 每个 PR 完成后真机+Web 双端验一次

---

