# 部署到 VPS / 云服务器

把 `local-backend/` 整套搬到一个有公网 IP 的服务器上。**测试号无法用云开发,这是上线必经路径**。

## 架构

```
                    ┌──────────────────┐
                    │  顾客小程序        │
                    │  (微信开发者工具/   │
                    │   真机)            │
                    └────────┬─────────┘
                             │ HTTPS
                             ▼
        ┌──────────────────────────────┐
        │  Nginx                       │
        │  api.mogu.com.au:443         │
        │  ↓ /cloud/* → :4000          │
        │  ↓ /admin/  → 静态(web 后台)  │
        └────────┬─────────────┬───────┘
                 │             │
       ┌─────────▼─────┐ ┌─────▼──────────┐
       │ API container │ │ Web admin      │
       │ :4000         │ │ (静态文件)       │
       └───┬───────┬───┘ └────────────────┘
           │       │
    ┌──────▼─┐  ┌──▼──────┐
    │ Mongo  │  │ MinIO   │
    │ :27017 │  │ :9000   │
    └────────┘  └─────────┘

         (HuePay 异步回调 → /cloud/payCallback)
```

## 服务器选型

最低要求:**1 vCPU / 1 GB RAM / 20 GB disk**(Mongo + MinIO + Node)

推荐:
- **AU 用户低延迟**:DigitalOcean SYD / Vultr Sydney / AWS Lightsail ap-southeast-2(墨悉尼)
- **预算紧**:Hetzner / Contabo(欧洲机房,延迟略高但便宜)
- **完全托管**:Fly.io(免运维,但 Mongo 要用他们的 Postgres 替代或外接 MongoDB Atlas)

## 部署步骤

### 1. 服务器初始化(Ubuntu 22.04 假设)

```bash
ssh root@your.server.ip

# 装 Docker
curl -fsSL https://get.docker.com | sh
systemctl enable --now docker

# 装 Nginx + Certbot(Let's Encrypt)
apt update && apt install -y nginx certbot python3-certbot-nginx ufw

# 防火墙:只开 80/443/22
ufw allow 22 && ufw allow 80 && ufw allow 443 && ufw enable

# 创建部署用户(可选)
useradd -m -s /bin/bash mogu
usermod -aG docker mogu
```

### 2. 拉代码 + 起容器

```bash
cd /opt && git clone <你的仓库> mogu_express
cd mogu_express/local-backend

# 创建生产环境配置
cat > .env <<'EOF'
MONGO_URL=mongodb://mongo:27017/mogu_express?replicaSet=rs0
JWT_SECRET=<请用 openssl rand -hex 32 生成>

# HuePay(没拿到凭证时保持 stub=1)
HUEPAY_STUB=1
HUEPAY_API_BASE=https://api.huepay.com.au
HUEPAY_MERCHANT_ID=
HUEPAY_APP_ID=
HUEPAY_API_KEY=
HUEPAY_SECRET=
HUEPAY_SIGN_ALGO=HMAC-SHA256
HUEPAY_NOTIFY_URL=https://api.your-domain.com/cloud/payCallback
EOF

# 修改 docker-compose 引用 .env(已经支持)
docker compose --env-file .env up -d

# 等 Mongo 就绪,灌种子
sleep 15
docker exec -it mogu_api node /app/api/seed.js
```

> ⚠️ 生产环境 `seed.js` 只跑一次创建初始 admin 账号,**不要用 `--reset`**(会清空真实数据)。
> 用完之后修改 admin 默认密码:用 `cloudfunctions/_lib/auth/jwt.js` 的 `hashPassword('新密码')` 生成新哈希,直接 mongosh 改 admins 集合。

### 3. Nginx 反向代理

`/etc/nginx/sites-available/mogu`:

```nginx
# API
server {
    listen 80;
    server_name api.your-domain.com;
    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 20m;     # 上传图片用
    }
}

# Web 后台
server {
    listen 80;
    server_name admin.your-domain.com;
    root /var/www/mogu-admin/dist;
    index index.html;
    location / {
        try_files $uri /index.html;   # SPA
    }
    # 强制 HTTPS 后,可加 add_header Strict-Transport-Security
}
```

启用 + 上 HTTPS:

```bash
ln -s /etc/nginx/sites-available/mogu /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

certbot --nginx -d api.your-domain.com -d admin.your-domain.com
# 自动改 nginx 配置加 SSL 证书
```

### 4. 构建 Web 后台并上传

本地:

```bash
cd web-admin
cat > .env.production <<'EOF'
VITE_USE_MOCK=false
VITE_API_BASE=https://api.your-domain.com
EOF

npm run build
# dist/ 目录就是静态产物

scp -r dist/* root@your.server.ip:/var/www/mogu-admin/dist/
```

### 5. 小程序指向生产后端

`miniprogram/config/index.js`:

```js
useMock: false,
useHttpBackend: true,
httpApiBase: 'https://api.your-domain.com',
```

微信开发者工具:
- 项目设置 → "服务器域名" → request 合法域名加 `https://api.your-domain.com`
- 上传体验版 / 提审

### 6. HuePay 回调配置

HuePay 商户后台填回调地址:
```
https://api.your-domain.com/cloud/payCallback
```

测试:
```bash
# 模拟 HuePay 发回调(stub 模式签名校验放行)
curl -X POST https://api.your-domain.com/cloud/payCallback \
  -H 'content-type: application/json' \
  -d '{"__stub":true,"out_trade_no":"TEST123","status":"SUCCESS","amount":100,"transaction_id":"TX1","paid_at":"2026-04-16T10:00:00Z"}'
# {"code":404,"message":"order not found"}  ← 正常,没这单
```

## 上线前 checklist

### 安全

- [ ] **改 admin 密码**(默认 admin/admin **必须改**)
- [ ] `JWT_SECRET` 用 `openssl rand -hex 32` 生成,不用默认值
- [ ] `MongoDB` 加认证(默认无密码,必须改)
  ```bash
  docker exec -it mogu_mongo mongosh --eval '
    db.getSiblingDB("admin").createUser({ user:"root", pwd:"<强密码>", roles:["root"] })'
  # 然后 docker-compose.yml 加 --auth 启动参数 + MONGO_URL 加 user/pass
  ```
- [ ] `MinIO` 默认密码 `mogu_admin_pass` **必须改**
- [ ] `HUEPAY_SECRET`(到位时)用云厂商 secret manager 而不是明文 .env
- [ ] Nginx 关闭 server_tokens、加 rate limiting
- [ ] 防火墙只开 80/443/22

### 备份

- [ ] Mongo 每日 dump(`mongodump --uri ...`)+ 异地保存
- [ ] MinIO 加 lifecycle policy 或定期同步
- [ ] 部署一份的代码 tag 留下来,回滚用

### 监控

- [ ] `docker logs --tail 100 -f mogu_api` 至少手动看一次
- [ ] HuePay 回调失败要发邮件/微信通知(暂未实现,后续做)
- [ ] 加 uptime monitoring(UptimeRobot 免费)

### 微信侧

- [ ] 小程序"开发管理 → 开发设置 → 服务器域名"加上 `https://api.your-domain.com`
- [ ] 小程序类目和资质就绪(团购属"生活服务 → 团购")
- [ ] 隐私协议页面就绪

### HuePay 侧

- [ ] 商户号 / API Key / Secret 拿到
- [ ] 回调地址配置在 HuePay 后台
- [ ] 沙箱跑过端到端,再上生产
- [ ] 设环境变量 `HUEPAY_STUB=0` 关闭 stub
- [ ] 重启 API 容器 `docker compose up -d --force-recreate api`

## 升级流程(后续迭代)

```bash
ssh root@your.server.ip
cd /opt/mogu_express
git pull

cd local-backend
docker compose up -d --build api    # 只重建 API,不动 Mongo/MinIO

# Web 后台更新:本地 build 后 scp 覆盖
```

## 监控建议

最低限度装一个 [Uptime Kuma](https://github.com/louislam/uptime-kuma)(自己的服务器跑容器):

```yaml
# 加到 docker-compose.yml
uptime:
  image: louislam/uptime-kuma:1
  ports: ["3001:3001"]
  volumes: [uptime_data:/app/data]
```

## 灾难恢复

1. 备份 Mongo:`docker exec mogu_mongo mongodump --uri mongodb://localhost:27017/mogu_express --out /tmp/dump && docker cp mogu_mongo:/tmp/dump ./backup-$(date +%Y%m%d)`
2. 恢复:`docker cp ./backup mogu_mongo:/tmp/dump && docker exec mogu_mongo mongorestore /tmp/dump`
3. 重建容器:`docker compose down && docker compose up -d`(volume 保留数据)

## 替代方案:腾讯云轻量(国内用户)

如果团长在国内 / 顾客在国内,腾讯云轻量 + 香港机房或东南亚机房延迟可接受。一样的 docker-compose,只是 Nginx 反代 + 域名备案这步走腾讯流程。

但 **AU 用户优先选 AU 机房**,往返延迟差几百毫秒影响支付体验。
