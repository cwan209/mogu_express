## 团详情页:团内分组 + 搜索(2026-04-19)

### Context

参考快团团截图,团详情页当前只有单栏商品列表,体验薄。加两个功能:

1. **团内独立分组**:每个商品在自己所属的"团"内有一个可选分组名(如"蔬菜"、"浆果"、"运费必拍项")。跟现有全局 `categories` 分开 — 全局 categories 保留(后台统计用),团内分组是团长为该团自由定义的。
2. **团内搜索**:顶部搜索栏,本地过滤该团内商品的 title + description。

UI 参考快团团:左侧垂直 sidebar 显示分组 tab、右侧商品列表按分组展开。搜索激活时切换到单列结果列表。

### 数据模型

- `products` 新增 `section?: string` 字段(可选,空为"其他")
- 不改 `tuans`,不改 `categories`
- 分组顺序 = 每组内最小 `product.sort` 升序(复用现有字段,不加 `sectionOrder`)
- "其他"组永远排最后

### 小程序端改动

**`miniprogram/pages/tuan-detail/index.js`**
- data 加 `groupedSections`(`[{section, products, minSort}]`)、`activeSection`、`searchKeyword`、`filteredProducts`
- 新建 `utils/groupProducts.js` 纯函数:分组 + 排序 + 归"其他"
- 滚动监听(throttled 100ms)反写 `activeSection` 高亮 sidebar
- 搜索非空时切换到单列过滤视图

**`miniprogram/pages/tuan-detail/index.wxml`**
- 顶部加 `<t-search>`
- 条件渲染:搜索态 → 单列结果;正常态 → 左右双栏 scroll-view(anchor + scroll-into-view)

**`miniprogram/pages/tuan-detail/index.wxss`**
- 双栏 flex 容器,sidebar 180rpx 宽
- sidebar 选中态左侧红色竖条高亮(品牌色)
- section 标题 sticky 到 scroll-view 顶部

**`miniprogram/pages/tuan-detail/index.json`**
- usingComponents 加 `t-search`

**`miniprogram/utils/mock.js`** — 补 section 字段:
- tuan_001 生鲜团:prod_101 "蔬菜"、prod_102 "浆果"、prod_103 "水果"
- tuan_002 肉类团:prod_201 "牛肉"、prod_202 "羊肉"
- tuan_003 乳制品团:prod_301 "液态奶"、prod_302 "发酵乳"

### 云函数改动

- `cloudfunctions/getTuanDetail/index.js`:products 查询自然返回 section 字段(Mongo 默认返全字段)。不用改代码,加几行注释说明即可。
- `cloudfunctions/_admin/productCRUD/index.js`:`create` 和 `update` 的 payload 透传 section 字段(trim 后,空串存 null)。

### Web 后台改动

- `web-admin/src/types.ts`:`Product.section?: string`
- `web-admin/src/mock/seed.ts`:跟 miniprogram/utils/mock.js 同步加 section
- `web-admin/src/mock/store.ts`:create/update 保留 section 字段
- `web-admin/src/api/client.ts`:mockProductCRUD 透传 section
- `web-admin/src/pages/ProductEdit.tsx`:categoryIds 下方加 antd `AutoComplete`,label "团内分组",options = 当前 tuanId 下所有 products 的 distinct sections。允许自由输入。
- `web-admin/src/pages/Products.tsx`:表格加 "分组" 列

### 后端 seed

- `local-backend/api/seed.js`:跟小程序 mock 同步补 section

### 测试

- `local-backend/api/test-shim.js` 加 3 个 case:
  - getTuanDetail 返回的 products 包含 section 字段
  - productCRUD create + section 能正确落库 + 读回来一致
  - section 空串或未提供时处理为 null 不崩
- 确保原 18 case 全绿

### 关键设计决策

- **搜索激活时隐藏 sidebar**:切单列结果页,避免 UI 复杂度炸
- **分组顺序**:复用 product.sort 的 min,不加新字段。团长调整分组顺序 = 改某个商品 sort
- **"其他"组**:未填 section 的商品归这里,永远排最后。整团都没填 section 时退化成单列布局(不显示 sidebar)
- **section UX**:AutoComplete 前端 trim 避免 typo 碎片化,允许新值

### 关键文件(实施时改)

- `miniprogram/pages/tuan-detail/index.{js,wxml,wxss,json}` — 4 个
- `miniprogram/utils/groupProducts.js` — 新建
- `miniprogram/utils/mock.js` — 补 section
- `cloudfunctions/_admin/productCRUD/index.js` — 透传 section
- `local-backend/api/seed.js` — 补 section
- `web-admin/src/types.ts` / `mock/seed.ts` / `mock/store.ts` / `api/client.ts` / `pages/ProductEdit.tsx` / `pages/Products.tsx`
- `local-backend/api/test-shim.js` — 加 3 case

### 验证

1. 小程序 Cmd+B 编译 → 进团详情 → 顶部有搜索栏 → 左侧显示分组("蔬菜"/"浆果"/"水果"等)
2. 点左侧分组 → 右侧商品区域平滑滚动到对应 section
3. 搜索"蓝莓" → 切换到单列结果,显示塔斯马尼亚蓝莓
4. 清空搜索 → 恢复双栏
5. Web 后台 → 编辑商品 → "团内分组"AutoComplete 能选已有值 / 新输入值 → 保存后 → 小程序端看到改动
6. `npm test` 21 个 test case 全绿

---

