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

// ---- Step 2: 启动 Mongo ----
const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017/mogu_express?replicaSet=rs0';
const DB_NAME   = new URL(MONGO_URL).pathname.slice(1) || 'mogu_express';

async function connectMongo() {
  const client = new MongoClient(MONGO_URL, { directConnection: true });
  await client.connect();
  const db = client.db(DB_NAME);
  shim.__setMongo(client, db);
  console.log(`[mongo] connected to ${MONGO_URL}`);
  return { client, db };
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
  await connectMongo();

  const app = express();
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: '10mb' }));

  app.get('/health', (_req, res) => {
    res.json({ code: 0, ok: true, ts: new Date().toISOString() });
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
    const openid = req.header('x-mock-openid') || req.body?._openid || null;
    shim.__setContext({ OPENID: openid });

    let mod;
    try {
      mod = loadCloudFn(dir);
    } catch (err) {
      console.error(`[cf-load] ${name}`, err);
      return res.status(500).json({ code: 500, message: 'failed to load: ' + err.message });
    }

    try {
      const result = await mod.main(req.body || {}, { openid });
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
