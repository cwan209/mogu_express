## 退款功能(2026-04-26)

### Context

用户希望在团还在进行（tuan.status === 'on_sale'）期间，对**已支付（paid）且未发货**的订单发起退款申请。管理员在 Web 后台审核后批准/拒绝；批准时调 HuePay 退款并回滚库存，拒绝时订单恢复 paid。

### 状态机扩展

```
paid → refund_requested  (用户申请，仅当 tuan 还在进行)
refund_requested → refunded   (管理员批准 → HuePay 退款 + 库存回滚)
refund_requested → paid       (管理员拒绝)
```

原有流程（pending_pay→cancelled、paid→shipped→completed）不变。

### 数据模型变化

**`web-admin/src/types.ts`** — OrderStatus 加 `'refund_requested'`；Order 接口加可选字段：
```
refundRequestedAt?: string
refundedAt?: string
refundId?: string
refundRejectReason?: string
```

**云数据库 orders**：同上，字段按需写入，不改 schema。

### 云函数（新建）

**`cloudfunctions/requestRefund/index.js`**（C 端调用，OPENID 鉴权）
1. 取 OPENID，查 orderId 对应订单
2. 验证 order._openid === OPENID（防越权）
3. 验证 order.status === 'paid'
4. 查 order.items[0].tuanId 的 tuan，验证 tuan.status === 'on_sale'
5. 更新 order: `status → 'refund_requested'`, `refundRequestedAt = now`
6. 返回 `{ code: 0 }`

**`cloudfunctions/_admin/processRefund/index.js`**（管理员调用，JWT 鉴权）
- 入参：`{ orderId, action: 'approve'|'reject', rejectReason? }`
- approve 分支：
  1. 验 order.status === 'refund_requested'
  2. 调 `huepay.refund({ outTradeNo, refundNo: 'REFUND_'+orderId+'_'+Date.now(), refundAmount: order.amount })`
  3. `db.runTransaction`：回滚库存（各 tuanItem sold--）+ 更新 order: `status→'refunded', payStatus→'refunded', refundedAt, refundId`
- reject 分支：
  1. 验 order.status === 'refund_requested'
  2. 更新 order: `status → 'paid', refundRejectedAt, refundRejectReason`
- 返回 `{ code: 0 }`

### 关键设计决策

- **库存回滚在 approve 时**（不在 request 时），与 cancelOrder 事务模式一致
- **refundNo 唯一性**：`'REFUND_' + orderId + '_' + Date.now()`（orderId 唯一 + 时间戳防重）
- **全额退款**：`refundAmount = order.amount`，不做部分退款
- **管理员不受 tuan.status 限制**：admin 可对已关团的 refund_requested 订单操作
- **服务端二次验 tuan.status**：前端只做 UI 控制，云函数兜底防绕过

### 小程序端改动

**`miniprogram/services/order.js`**
- 加 `requestRefund(orderId)` → `callFunction('requestRefund', { orderId })`

**`miniprogram/pages/order-detail/index.js`**
- data 加 `showRefundConfirm: false`
- 加 `onRequestRefund()` handler：弹确认对话框（"申请退款后需等待审核，确认申请？"）→ 确认 → 调 `orderService.requestRefund` → toast → reload
- 加 `onRefundConfirm()` / `onRefundCancel()` 对话框回调

**`miniprogram/pages/order-detail/index.wxml`**
- 操作区域加 "申请退款" 按钮（`wx:if="{{order.status === 'paid'}}"`）
- 加 `t-dialog` 确认弹窗

**`miniprogram/pages/orders/index.js`**
- statusLabel 映射加 `refund_requested: '退款申请中'`

### Web 后台改动

**`web-admin/src/types.ts`**
- `OrderStatus` 加 `'refund_requested'`
- `Order` 加 4 个可选字段（见数据模型）

**`web-admin/src/api/order.ts`**
- STATUS_LABEL 加 `refund_requested: '退款申请中'`
- 导出函数的排除列表加 `'refund_requested'`（申请中的订单不计入销量）
- 加 `processRefund(orderId: string, action: 'approve'|'reject', rejectReason?: string)` 方法

**`web-admin/src/pages/Orders.tsx`**
- 状态下拉选项加 `退款申请中`（标橙色 tag）
- 表格操作列：对 `refund_requested` 状态订单显示"处理退款"按钮
- 点击弹 antd `Modal.confirm` 展示两个选项（批准 / 拒绝），拒绝时弹 Input 填原因
- 调 `orderApi.processRefund` 后刷新列表

**`web-admin/src/mock/store.ts`**
- `updateOrderStatus` 扩展：
  - `refund_requested` → 设 `refundRequestedAt`
  - `refunded` → 设 `refundedAt` + 假 `refundId`（`'MOCK_REFUND_'+id`）
- 加 `rollbackSold(orderItems)` 方法（按 tuanItemId 或 productId+tuanId 找 tuanItem，sold--）

**`web-admin/src/mock/seed.ts`**
- 加一条 `refund_requested` 种子订单（方便前端调试）

**`web-admin/src/api/client.ts`**
- mockDispatch 加 `'requestRefund'` → `mockRequestRefund`
- mockDispatch 加 `'_admin/processRefund'` → `mockProcessRefund`
- `mockRequestRefund({ orderId })`: 查 order，验 status==='paid'，更新到 refund_requested
- `mockProcessRefund({ orderId, action, rejectReason })`: approve→refunded+rollback, reject→paid

### 本地后端改动

**`local-backend/api/src/shim/index.js`**
- 加 `requestRefund` / `processRefund` shim，转发给对应云函数

**`scripts/sync-lib.js`**
- `_admin/processRefund` 加入 jwt.js 同步列表

### 测试（`local-backend/api/test-shim.js`，加 6 个 case）

1. requestRefund 成功路径：paid 订单 + on_sale 团 → 变 refund_requested
2. requestRefund 越权：用其他用户 OPENID 请求 → code ≠ 0
3. requestRefund 状态错误：shipped 订单 → code ≠ 0
4. requestRefund 团已关闭：tuan.status=closed → code ≠ 0
5. processRefund approve：refund_requested → refunded，sold 回滚验证
6. processRefund reject：refund_requested → paid，refundRejectReason 保存

### 验证

1. 小程序 → 我的订单 → 点已支付订单 → 出现"申请退款"按钮 → 确认 → 状态变"退款申请中"
2. Web 后台 → 订单列表 → 筛选"退款申请中" → 看到该订单 → 点"处理退款" → 批准 → 状态变"已退款"，HuePay stub 日志出现 refund 调用
3. 再测拒绝路径：填拒绝原因 → 状态回 paid
4. 测 tuan 已关闭时用户申请退款 → 报错"团购已结束，无法申请退款"
5. `npm test` — 新增 6 case 全绿（原有 case 不回归）

---

