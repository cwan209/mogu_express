## 真机首验修正(2026-04-15)

### 新事实
- 甲方 AppID `wx47b7abebb8b51fdf` 是**测试号** → **永远无法开通微信云开发**
- 长期策略调整:小程序必须走 **HTTP 后端**(Docker 本地开发,上线时部署到公网服务器),云函数代码路径作为后端业务逻辑继续使用,但部署目标从微信云函数改为 Node/容器环境

### 真机表现(截图确认)
- ✅ 首页团列表、团详情、商品详情、参与者名单全部正常渲染
- ✅ 倒计时、TabBar(4 tab)、TDesign 组件加载无误
- ⚠️ "加入购物车"按钮是蓝色 — TDesign 默认品牌色是蓝,未覆盖
- ⚠️ Mock 商品封面(`picsum.photos/seed/xxx`)返回随机图,与商品名严重不符(西兰花显示建筑物图片)

### 修正任务(小)
1. **TDesign 品牌色覆盖** — 已在 `miniprogram/style/theme.wxss` 加入 `--td-brand-color-{1..10}` 和 `--td-brand-color-hover/focus/active/disabled` 共 14 个变量,覆盖红色 `#E34D59` 全阶梯
2. **Mock 图片换源** — 把 `miniprogram/utils/mock.js` 和 `web-admin/src/mock/seed.ts` 里 `https://picsum.photos/seed/xxx/...` 换成 `https://placehold.co/<w>x<h>/E34D59/ffffff?text=<name>` 形式的文字占位图(文字版面清晰,内容与商品名一致)
   - 如果 placehold.co 在中国区不稳,备选:在 `miniprogram/assets/placeholders/` 放几张静态 SVG(不同颜色渐变 + emoji 🥦🫐🍈🥩 等),通过一个工具函数把 productId 映射到本地路径
3. **小程序 `useHttpBackend` 模式真机验证** — 当 Docker 后端起来、手机连同一局域网时,改 `httpApiBase: 'http://<mac-ip>:4000'`,开发者工具勾选"不校验合法域名",验证一次 `login` / `listTuans` 走真实后端

### 修正任务(中)— 测试号限制后的架构微调
- 云函数**继续保留**(`cloudfunctions/` 下代码不变),因为 shim 让它们也能跑在 Node 容器里
- 部署目标文档化:加 `docs/deploy-docker-server.md` 说明如何把 `local-backend/` 部署到 VPS(Fly.io / Railway / DigitalOcean),并让小程序 `httpApiBase` 指向那个公网域名
- 云开发相关的文档(README / cloudfunctions/README.md)加一行"测试号用户请忽略'部署云函数'步骤,直接用 local-backend"

### 关键文件
- `miniprogram/style/theme.wxss` — TDesign 变量覆盖(已改)
- `miniprogram/utils/mock.js` — 产品图 URL 换源(待改)
- `web-admin/src/mock/seed.ts` — 同上(待改)
- `miniprogram/config/index.js` — `useHttpBackend`/`httpApiBase` 开关已预留,无需再改
- 新建 `docs/deploy-docker-server.md`(低优先级,等要上线时再写)

### 验证
1. 重新编译小程序 → 进商品详情页 → "加入购物车"按钮应显示品牌红
2. 首页/团详情/商品详情 → 商品封面应显示文字形式的产品名(如"澳洲有机西兰花"),而不是随机建筑物图
3. 可选:配置 `useHttpBackend: true` + 启动 Docker 后端 → 小程序登录/列团全流程走真实 HTTP

---

