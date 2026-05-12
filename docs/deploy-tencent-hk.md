# 部署到腾讯云轻量香港(生产环境)

> 适用于:海外主体商家(不能 ICP 备案)+ 国内顾客访问 H5 商城

## 0. 资源清单

- **VPS**:腾讯云轻量服务器 - 香港地域 - 2C 4G - 套餐 ¥24/月起
- **域名**:任一注册商,1 个一级域名即可(如 `mogu-express.com`),¥55-100/年
- **DNS**:Cloudflare 免费(代理 + 免费 SSL),或直接腾讯云 DNSPod
- **对象存储**:腾讯云 COS 香港 region(海外主体可开,几块/月)
- **短信**:腾讯云 SMS(0.045 元/条)
- **HuePay**:跨境支付商户(等商务对接)

## 1. VPS 初始化

```bash
ssh root@<VPS-IP>

# 装 Docker
curl -fsSL https://get.docker.com | sh
systemctl enable --now docker

# 安全:开 ufw 防火墙
apt install -y ufw
ufw allow OpenSSH
ufw allow 80
ufw allow 443
ufw --force enable

# 时区
timedatectl set-timezone Asia/Shanghai
```

## 2. 域名 DNS

在 Cloudflare(或 DNSPod)配 3 条 A 记录:

| 子域 | 记录类型 | 值 |
|---|---|---|
| shop | A | `<VPS-IP>` |
| admin | A | `<VPS-IP>` |
| api | A | `<VPS-IP>` |

**Cloudflare 注意**:Caddy 自动签 LE 证书需要 80/443 直达 VPS,所以 Cloudflare 的代理模式(橙云)**关掉**改成 DNS only(灰云)。或者用 Cloudflare 的 Origin Cert + Caddy 跳过 ACME(进阶,本文不展开)。

## 3. 腾讯云 COS 香港 bucket

1. 控制台 → 对象存储 → 创建存储桶
   - 名称:`mogu-express-images-xxxx`(末尾随机几位防猜)
   - 地域:**亚太地区 - 香港**
   - 访问权限:**公有读私有写**
2. 控制台 → 访问管理 → API 密钥管理 → 新建子账号
   - 策略:仅给该 bucket 的 `Put/Get/Delete/List` 权限
   - 记下 SecretId / SecretKey
3. (可选)开 CDN 加速,绑定 `static.your-domain.com` 子域名

## 4. 腾讯云 SMS

1. 控制台 → 短信 → 国内短信
2. 申请签名(企业要营业执照,个人不行 — 这里用商家的 AU 营业执照应该可以,但需腾讯审核)
3. 创建验证码模板,模板内容例:
   ```
   您的验证码 {1},5 分钟内有效,请勿泄露。
   ```
   等审核通过拿到 TemplateId
4. 创建应用,拿到 SdkAppId

## 5. 部署项目

```bash
# 在 VPS 上 clone 项目
cd /opt
git clone https://github.com/cwan209/mogu_express.git
cd mogu_express

# 同步 _lib 共享代码到各云函数
node scripts/sync-lib.js

# 准备环境变量
cp deploy/.env.example deploy/.env
nano deploy/.env       # 填入真实值

# Web 后台和 H5 前端构建
npm install --prefix web-admin && npm --prefix web-admin run build
npm install --prefix web-shop  && npm --prefix web-shop  run build

# 启动生产栈
docker compose -f deploy/docker-compose.production.yml --env-file deploy/.env up -d

# 看日志确认无报错
docker compose -f deploy/docker-compose.production.yml logs -f
```

启动后:
- `https://shop.your-domain.com` → 客户 H5 商城
- `https://admin.your-domain.com` → 团长后台
- `https://api.your-domain.com/health` → 应返 `{code:0,ok:true}`

Caddy 启动后会自动签 LE 证书(2-3 分钟),首次请求若超时多试几次。

## 6. 初始化数据

进 mongo container 建 admin 账号:

```bash
docker exec -it mogu_mongo mongosh mogu_express --eval '
  // 用 nodejs hashPassword 生成的 pbkdf2 哈希(本地跑:
  //   node -e "console.log(require(\"./cloudfunctions/_lib/auth/jwt\").hashPassword(\"YOUR_REAL_PWD\"))"
  // 把结果填到 passwordHash)
  db.admins.insertOne({
    _id: "admin_owner",
    openid: "ADMIN_OWNER",
    username: "owner",
    passwordHash: "pbkdf2$100000$...",
    role: "owner",
    createdAt: new Date()
  });
'
```

或者本地灌种子后,用 mongodump/mongorestore 把整库搬过去。

## 7. 接 HuePay

- HuePay 商务给凭证后,填 `deploy/.env` 的 `HUEPAY_*`,把 `HUEPAY_STUB=0`
- 沙箱跑通后切生产
- HuePay 后台填 `https://api.your-domain.com/cloud/payCallback` 为回调地址

## 8. 后续运维

```bash
# 重启 api
docker compose -f deploy/docker-compose.production.yml restart api

# 升级代码
cd /opt/mogu_express
git pull
node scripts/sync-lib.js
npm --prefix web-shop run build && npm --prefix web-admin run build
docker compose -f deploy/docker-compose.production.yml up -d --build api

# 备份数据库(可加 cron)
docker exec mogu_mongo mongodump --archive=/tmp/mongo.gz --gzip
docker cp mogu_mongo:/tmp/mongo.gz ./backup-$(date +%F).gz
```

## 排错速查

| 症状 | 检查 |
|---|---|
| Caddy 报 SSL 错 | 域名是否真 A 到这台机?Cloudflare 是否关了代理? |
| `api` 502 | `docker logs mogu_api`,看 mongo 是否 ready |
| 图片传不上 | COS 子账号策略是否包含 PutObject?S3_PUBLIC_URL 是否拼对? |
| OTP 收不到短信 | 签名/模板审核通过没?号码格式是否带 +86? |
| 微信内调起支付被拦 | 看 HuePay 文档要求,可能要把 H5 通道改 JSAPI |
