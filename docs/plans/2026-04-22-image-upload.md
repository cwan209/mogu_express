## Web 后台:本地图片上传(2026-04-22)

### Context

Web 后台现在新建/编辑团或商品时,封面图**只能手工填 URL**。团长真实运营时多半是手机拍照或电脑本地存图,复制 URL 的流程不现实。加**从本地上传图片**功能:拖拽 / 点击选择本地文件,自动上传到对象存储,URL 填入字段。

**存储选型**:
- **生产**:**腾讯云 COS**(面向国内用户访问快、价格便宜、微信生态兼容)
- **本地开发**:**MinIO**(开源 S3 兼容,docker-compose 已有,免费)
- **代码层**:用 S3 兼容 SDK(`@aws-sdk/client-s3`)一套代码,两头通过**环境变量**切换,不改一行业务代码

保留 URL 手工输入作兜底(编辑已有外链图片、或用 AI 生成图直接贴链接)。

### 数据模型

**不改 schema**:`coverFileId: string` / `imageFileIds: string[]` 字段名保留,内容语义从"fileID"升级为"完整 HTTP URL"。字段名是历史包袱,但重命名会波及小程序、云函数、订单快照、Excel 导出,不划算。在 types.ts / cloudfunctions README 里加注释说明。

### 后端:对象存储对接(S3 兼容)

**架构决策**:用**腾讯云 COS 作为生产存储**(项目目标市场是中国,腾讯云 COS 国内访问最快,有微信/小程序生态支持);**本地开发用 MinIO 容器**(开源,完全 S3 API 兼容)作为 COS 的 stub。一套代码两头通吃。

**SDK**:`@aws-sdk/client-s3`(AWS SDK v3 的模块化版本,tree-shake 后 ~300KB)。通吃 AWS S3 / 腾讯云 COS / 阿里云 OSS / MinIO —— 它们对外都是 S3 协议。虽然腾讯官方有 `cos-nodejs-sdk-v5`,但只支持 COS,换平台要重写;用 aws-sdk 环境变量改几个就能切换。

**环境变量统一命名**(不绑某一家):
- `S3_ENDPOINT` — 本地 `http://minio:9000` / 生产 `https://cos.ap-guangzhou.myqcloud.com`
- `S3_REGION` — 本地 `us-east-1`(MinIO 忽略)/ 生产 `ap-guangzhou`(或其他)
- `S3_BUCKET` — 本地 `images` / 生产 `mogu-express-images-<appid>`
- `S3_ACCESS_KEY` / `S3_SECRET_KEY`
- `S3_PUBLIC_URL` — 拼回给前端的公网 URL 前缀
  - 本地:`http://localhost:9000/images`
  - 生产:`https://mogu-express-images-xxx.cos.ap-guangzhou.myqcloud.com` 或自有 CDN 域名

**实现步骤**:

1. `local-backend/api/package.json` 加 `@aws-sdk/client-s3`
2. `local-backend/api/src/storage/s3.js` 新建:
   - `getClient()` 单例 S3 client(依 endpoint / region / keys 初始化)
   - `ensureBucket()`:server 启动时 eager 调用
     - 本地 MinIO:不存在则 `CreateBucketCommand` + `PutBucketPolicyCommand` 设匿名 GET
     - 生产 COS:bucket 提前在腾讯云控制台建好 + 设"公有读私有写",代码只检查存在
     - 通过环境变量 `S3_AUTO_CREATE_BUCKET=true` 区分行为(本地开,生产关)
   - `putObject(key, buffer, contentType)` → 返回 public URL
3. `local-backend/api/src/shim/index.js` 的 `uploadFile` 从 stub 变真实:base64 → `putObject` → 返回 `{ fileID: publicUrl }`
   - 兼容现有调用方(`exportOrders` 存 xlsx / `genShareQrCode` 存 PNG)
4. `cloudfunctions/_admin/uploadImage/index.js` 新建:
   - JWT 鉴权(复用 `_admin/*` 现有中间件)
   - 入参:`{ fileBase64, mimeType, fileName, purpose: 'tuan_cover'|'product_cover'|'product_image' }`
   - 服务端二次校验:MIME 白名单(magic bytes 嗅探)+ size ≤ 3MB(base64 膨胀 1.33x,按 decode 后算)
   - key 格式:`{purpose}/{yyyymm}/{uuid}.{ext}`(按月分目录避免单目录文件过多,uuid 防猜测)
   - 调 `cloud.uploadFile`(shim 真实)→ 返回 `{ code: 0, url, key }`

**上线腾讯云 COS 的步骤**(文档化,不在本期实施):
1. 腾讯云开 COS,建 bucket `mogu-express-images-<随机后缀>`
2. bucket 权限:**公有读私有写**
3. 腾讯云访问管理 → 子账号 → 给 COS 最小权限(该 bucket 的 `Put/Get/Delete`)拿到 AK/SK
4. 配 CDN 加速域名(可选,COS 原生 URL 也能直接用,但 CDN 更快更便宜)
5. docker-compose 或生产服务器的环境变量改成生产值,`S3_AUTO_CREATE_BUCKET=false`

### 前端:ImageUploader 复用组件

1. `web-admin/src/components/ImageUploader.tsx` 新建,约 150 行:
   - 基于 antd `<Upload listType="picture-card">`
   - Props:`value: string|string[]`、`onChange`、`mode: 'single'|'multiple'`、`max?: number`、`purpose`
   - `beforeUpload`:前端校验 MIME 白名单 + 3MB,不通过 `message.error + return Upload.LIST_IGNORE`
   - `customRequest`:调 `api/upload.ts`,成功后把 URL 写入 fileList 并 `onChange`
   - **手工 URL 兜底**:底部折叠区"粘贴 URL"输入 + 添加按钮
   - 多图:`dnd-kit` 的 SortableContext 实现拖拽排序(antd Upload 原生不带)

2. `web-admin/src/api/upload.ts` 新建:
   - `uploadImage(file: File, purpose)`:读文件 → base64 → `callCloud('_admin/uploadImage')`
   - **Mock 模式**:`URL.createObjectURL(file)` 返 Blob URL(`blob:http://...`),短路不走 callCloud(避免大 base64 JSON 序列化);`console.warn` 提示"mock 模式图片仅内存可见,刷新丢失"
   - 不用 data URL 写 localStorage(100KB 图 base64 后 130KB,5 张就撑爆 5MB quota)

3. `web-admin/src/api/client.ts` mockDispatch 加 `_admin/uploadImage` 兜底 case(返错误提示用 upload.ts 短路)

### Edit 页改造

- `web-admin/src/pages/TuanEdit.tsx:80-86` — `coverFileId` 的 `<Input>` 换成 `<ImageUploader mode="single" purpose="tuan_cover" />`
- `web-admin/src/pages/ProductEdit.tsx:129-138`:
  - `coverFileId` 换 `<ImageUploader mode="single" purpose="product_cover" />`
  - `imageFileIds` 换 `<ImageUploader mode="multiple" max={5} purpose="product_image" />`(取消原"换行分隔"的 TextArea + form value 映射改成数组)
- `onFinish` 守卫:检测 `coverFileId` / `imageFileIds` 是否含 `blob:` 前缀 → `message.error('图片未完成上传')` + return(mock 误存时兜底)

### 测试

`local-backend/api/test-shim.js` 加 3 个 case:
- uploadImage 成功路径:1x1 PNG base64 → 断言返回 URL 匹配 `/images/tuan_cover/...\.png$/`
- MIME 拒绝:传 `application/pdf` → code ≠ 0
- Size 拒绝:构造 > 3MB base64 → code ≠ 0

现有测试:exportOrders 走 base64 fallback 不经 uploadFile,无影响;genShareQrCode 需确认只断言 url 字段存在。

### 小程序端兼容

- **本地开发**:`<image src="http://localhost:9000/images/...">` 在开发者工具里可渲染(`urlCheck: false` 已有)
- **真机调试**:改 `S3_PUBLIC_URL` 为 Mac LAN IP,加入不校验域名
- **生产**(腾讯云 COS):URL 是 `https://xxx.cos.ap-guangzhou.myqcloud.com/...` 或绑定的 CDN 域名。小程序 `project.config.json` 的 **downloadFile 合法域名**里要加这个域名(微信后台 → 开发设置 → 服务器域名);如果用 CDN 加速,把 CDN 域名加白名单即可

### 关键文件(改动大小分类)

🔴 **大改 / 新建**:
- `web-admin/src/components/ImageUploader.tsx`(新建)
- `local-backend/api/src/shim/index.js`(stub → 真实 uploadFile)

🟡 **中改 / 新建**:
- `cloudfunctions/_admin/uploadImage/{index.js,package.json,config.json,jwt.js}`(新建)
- `local-backend/api/src/storage/s3.js`(新建 — S3 兼容 client,本地 MinIO / 生产 COS 通用)
- `web-admin/src/api/upload.ts`(新建)
- `web-admin/src/pages/ProductEdit.tsx`(2 处字段换组件 + form value 映射)
- `web-admin/src/pages/TuanEdit.tsx`(1 处字段换组件)
- `local-backend/api/test-shim.js`(加 3 case)
- `docs/deploy.md`(加"腾讯云 COS 切换"章节)

🟢 **小改**:
- `local-backend/api/package.json`(加 `@aws-sdk/client-s3` 依赖)
- `local-backend/api/server.js`(启动调 ensureBucket + 注入 shim storage)
- `local-backend/docker-compose.yml`(api 服务加 `S3_*` env)
- `web-admin/src/api/client.ts`(mockDispatch 加 uploadImage 兜底)
- `scripts/sync-lib.js`(uploadImage 加入 jwt 同步列表)

### 潜在坑 / 决策

- **不做 CORS**:浏览器 → API 容器 → MinIO(服务端中转),不直连 MinIO,浏览器只对 `localhost:4000` 发 POST
- **不去重**:不用 md5 做 key,避免多团复用同一文件,删除时出问题;uuid 够了
- **不自动删除**:团/商品删除时不主动删 MinIO 文件(孤儿文件),未来加 `_admin/gcOrphanImages` 定期清
- **预览**:`<Upload fileList>` 的 `url` 字段就是数据库 URL,直接渲染,无需额外 API
- **Blob URL 提交防呆**:`onFinish` 检测 `blob:` 前缀并阻止提交

### 验证

**本地(MinIO stub)**:
1. 起 Docker → API 启动日志看到 `[s3] bucket images ready`
2. MinIO Web Console http://localhost:9001 登录(`mogu_admin/mogu_admin_pass`)确认 bucket `images` 已建
3. Web 后台新建商品 → 拖图到上传区 → 看到缩略图 → URL 自动填入 → 保存
4. Mongo 里:`db.products.findOne()` → `coverFileId` 是 `http://localhost:9000/images/product_cover/...`
5. 浏览器直接打开那个 URL → 能看到图片(公开读 policy 生效)
6. 小程序端 Cmd+B → 商品卡显示上传的图
7. `npm test` 33 个 case 全绿(30 + 3)

**切腾讯云 COS(未来某天)**:
1. 腾讯云控制台开 COS + 建 bucket `mogu-express-images-xxx` + 设公有读 + 拿 AK/SK
2. `docker-compose.yml` 或生产 env 改:
   - `S3_ENDPOINT=https://cos.ap-guangzhou.myqcloud.com`
   - `S3_REGION=ap-guangzhou`
   - `S3_BUCKET=mogu-express-images-xxx`
   - `S3_ACCESS_KEY=AKIDxxxxxx`
   - `S3_SECRET_KEY=xxxxx`
   - `S3_PUBLIC_URL=https://mogu-express-images-xxx.cos.ap-guangzhou.myqcloud.com`
   - `S3_AUTO_CREATE_BUCKET=false`
3. 重启 api 容器 → 新上传的图走 COS
4. 旧的 MinIO URL 可以留(小程序端只要不校验合法域名能访问,或先迁移脚本批量替换 URL 前缀)

---

