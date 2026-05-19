// local-backend/api/server.js
//
// 在启动云函数之前,先用 Module._resolveFilename hook 把 require('wx-server-sdk') 重定向到 shim。
// 然后起 Express 监听 POST /cloud/:name,每次请求时:
//   1. 从 header 取 x-mock-openid 注入 shim 上下文
//   2. require cloudfunctions/:name/index.js
//   3. 调 exports.main(event, context)
//   4. 返回结果
//
// 这样 cloud function 代码一行不改就能本地运行。

const path = require('path');
const Module = require('module');
const express = require('express');
const cors = require('cors');
const { MongoClient } = require('mongodb');

// ---- Step 1: 重定向 require('wx-server-sdk') 到 shim ----
// 同时让 cloudfunction 里 `require('exceljs')` 等 fallback 到 api 自己的 node_modules
const SHIM_PATH = path.resolve(__dirname, 'src/shim/index.js');
const FALLBACK_MODULES = path.resolve(__dirname, 'node_modules');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  if (request === 'wx-server-sdk') return SHIM_PATH;
  try {
    return origResolve.call(this, request, parent, ...rest);
  } catch (err) {
    // 云函数目录本身可能没装依赖,从 api/node_modules 找
    if (err.code === 'MODULE_NOT_FOUND' && !request.startsWith('.') && !request.startsWith('/')) {
      try {
        return origResolve.call(this, path.join(FALLBACK_MODULES, request), parent, ...rest);
      } catch {}
    }
    throw err;
  }
};

process.env.CLOUD_ENV = process.env.CLOUD_ENV || 'local';

const shim = require('./src/shim');
const s3 = require('./src/storage/s3');
shim.__setS3Storage(s3);

// ---- Step 2: 启动 Mongo ----
const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017/mogu_express?replicaSet=rs0';
const DB_NAME   = new URL(MONGO_URL).pathname.slice(1) || 'mogu_express';

async function connectMongo() {
  // 本地单节点副本集 → directConnection=true 才能直接连容器主机
  // 生产 TencentDB 真副本集 → 让 driver 自动 discovery,不能开 directConnection
  // 通过 env MONGO_DIRECT_CONNECTION=1 切换
  const isDirect = process.env.MONGO_DIRECT_CONNECTION === '1';
  const client = new MongoClient(MONGO_URL, isDirect ? { directConnection: true } : {});
  await client.connect();
  const db = client.db(DB_NAME);
  shim.__setMongo(client, db);
  console.log(`[mongo] connected to ${MONGO_URL}`);
  return { client, db };
}

// 开发期工具:on_sale 团到期后自动续期 7 天
// 防止种子数据放久了团过期、本地下单失败
// 生产部署时设 BUMP_EXPIRED_TUANS=0 关掉
async function bumpExpiredTuansOnStartup(db) {
  if (process.env.BUMP_EXPIRED_TUANS === '0') return;
  const now = new Date();
  const r = await db.collection('tuans').updateMany(
    { status: 'on_sale', endAt: { $lt: now } },
    {
      $set: {
        startAt: new Date(now.getTime() - 3 * 24 * 3600 * 1000),
        endAt:   new Date(now.getTime() + 7 * 24 * 3600 * 1000),
        updatedAt: now,
      },
    },
  );
  if (r.modifiedCount > 0) {
    console.log(`[startup] bumped ${r.modifiedCount} expired on_sale tuan(s) +7d`);
  }
}

// ---- Step 3: 云函数加载器 ----
const CF_ROOT = process.env.CLOUDFUNCTIONS_ROOT ||
                path.resolve(__dirname, '../../cloudfunctions');

function resolveCfPath(name) {
  // 支持 "adminLogin" 和 "_admin/adminLogin" 两种写法
  const safe = name.replace(/[^a-zA-Z0-9_/-]/g, '');
  const direct = path.join(CF_ROOT, safe);
  const underAdmin = path.join(CF_ROOT, '_admin', safe);
  if (require('fs').existsSync(path.join(direct, 'index.js'))) return direct;
  if (require('fs').existsSync(path.join(underAdmin, 'index.js'))) return underAdmin;
  return null;
}

// 热加载:开发时删 cache 让改动即时生效
function loadCloudFn(dir) {
  const entry = path.join(dir, 'index.js');
  delete require.cache[require.resolve(entry)];
  // 子模块(jwt.js 等)也需要清
  for (const k of Object.keys(require.cache)) {
    if (k.startsWith(dir + path.sep)) delete require.cache[k];
  }
  return require(entry);
}

// ---- Step 4: Express ----
async function main() {
  const { db } = await connectMongo();
  // 开发期:启动时把过期的 on_sale 团续 7 天,避免种子数据放久了下单失败
  try {
    await bumpExpiredTuansOnStartup(db);
  } catch (err) {
    console.warn('[startup] bumpExpiredTuans failed:', err.message);
  }
  // S3 兼容存储初始化(失败不致命,某些场景如纯离线测试可跳过)
  try {
    await s3.ensureBucket();
  } catch (err) {
    console.warn('[s3] ensureBucket failed, uploads will 500 until fixed:', err.message);
  }

  const app = express();
  app.use(cors({ origin: true, credentials: true }));
  // 用 verify hook 捕获原始 body 字符串(payCallback 需要它做 HuePay 签名校验)
  app.use(express.json({
    limit: '10mb',
    verify: (req, _res, buf) => {
      if (buf && buf.length) req.rawBody = buf.toString('utf8');
    },
  }));

  // /health 给 uptime monitor (UptimeRobot) + LB healthcheck 用。
  // 真 ping 一下 mongo,任何 5xx 都让外部监控可见(不能糊弄)。
  app.get('/health', async (_req, res) => {
    try {
      await db.command({ ping: 1 });
      res.json({ code: 0, ok: true, mongo: 'up', ts: new Date().toISOString() });
    } catch (err) {
      res.status(503).json({ code: 503, ok: false, mongo: 'down', error: err.message });
    }
  });

  // List registered cloud functions
  app.get('/cloud', (_req, res) => {
    const fs = require('fs');
    const list = [];
    for (const name of fs.readdirSync(CF_ROOT)) {
      if (name.startsWith('_lib')) continue;
      const full = path.join(CF_ROOT, name);
      if (!fs.statSync(full).isDirectory()) continue;
      if (fs.existsSync(path.join(full, 'index.js'))) {
        list.push(name);
      } else {
        // _admin/xxx
        for (const sub of fs.readdirSync(full, { withFileTypes: true })) {
          if (sub.isDirectory() && fs.existsSync(path.join(full, sub.name, 'index.js'))) {
            list.push(`${name}/${sub.name}`);
          }
        }
      }
    }
    res.json({ code: 0, functions: list.sort() });
  });

  // 支持 /cloud/_admin/tuanCRUD 这种多级路径
  app.post(/^\/cloud\/(.+)$/, async (req, res) => {
    const name = req.params[0];
    const dir = resolveCfPath(name);
    if (!dir) {
      return res.status(404).json({ code: 404, message: `cloud function not found: ${name}` });
    }

    // 注入上下文
    // 优先级: JWT token > x-mock-openid header > body._openid
    let openid = null;
    if (req.body?.token) {
      try {
        const jwt = require(path.join(CF_ROOT, '_lib/auth/jwt'));
        const payload = jwt.verify(req.body.token, process.env.JWT_SECRET || 'local_dev_secret_CHANGE_ME');
        openid = payload.openid;
      } catch (err) {
        // 401 仅在受保护路由,云函数自己判断 OPENID 是否为空
        console.warn(`[auth] invalid token for ${name}:`, err.message);
      }
    }
    if (!openid) {
      openid = req.header('x-mock-openid') || req.body?._openid || null;
    }
    shim.__setContext({ OPENID: openid });

    let mod;
    try {
      mod = loadCloudFn(dir);
    } catch (err) {
      console.error(`[cf-load] ${name}`, err);
      return res.status(500).json({ code: 500, message: 'failed to load: ' + err.message });
    }

    // payCallback 需要 raw body 和 headers 做 HuePay 签名校验,
    // 用 envelope 形态平铺业务字段 + 附 headers/rawBody/__envelope 标记。
    // 其它云函数仍收纯 body 对象(向后兼容)。
    const event = (name === 'payCallback')
      ? {
          ...(req.body || {}),
          headers: req.headers || {},
          rawBody: req.rawBody || null,
          __envelope: true,
        }
      : (req.body || {});

    try {
      const result = await mod.main(event, { openid });
      res.json(result);
    } catch (err) {
      console.error(`[cf-exec] ${name}`, err);
      res.status(500).json({ code: err.code || 500, message: err.message || 'error' });
    }
  });

  // ---- Admin REST wrappers (便于 Web admin 用 axios 直接打) ----
  // /admin/login  /admin/:resource/:action  等会映射到对应云函数
  // M1 Web admin 暂用 mock,这里暂留,待 Web admin 切到真实后端时再完善

  const PORT = Number(process.env.PORT || 4000);
  app.listen(PORT, () => {
    console.log(`[api] listening on :${PORT}`);
    console.log(`[api] cloudfunctions root: ${CF_ROOT}`);
  });
}

main().catch((err) => {
  console.error('[api] fatal', err);
  process.exit(1);
});
