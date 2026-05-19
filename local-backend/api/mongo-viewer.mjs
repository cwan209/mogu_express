// mongo-viewer.mjs — 简易 HTML MongoDB viewer (read-only)
//
// 用法:
//   # 本地 dev mongo
//   node local-backend/api/mongo-viewer.mjs
//   # → 浏览器打开 http://127.0.0.1:4321
//
//   # 指定连接 / db / 端口
//   MONGO_URL=mongodb://localhost:27017 MONGO_DB=mogu_express PORT=4321 node mongo-viewer.mjs
//
//   # 看 staging mongo:VPS 上跑容器内的 mongo 不暴露宿主端口
//   # 方案 A:在 VPS 上跑 viewer (mogu_api 容器内有 mongo 网络访问)
//   #   ssh -L 4321:127.0.0.1:4321 -i ~/.ssh/mogu_deploy ubuntu@43.159.198.145
//   #   (新窗口) ssh ubuntu@43.159.198.145
//   #   sudo docker exec -e MONGO_URL='mongodb://mongo:27017/?replicaSet=rs0&directConnection=true' \
//   #     mogu_api node /app/api/mongo-viewer.mjs
//   #   浏览器 http://127.0.0.1:4321
//   # 方案 B:临时给 mongo container 加 ports: ["127.0.0.1:27017:27017"] 直连
//
// 只读 — 不支持 update / delete / insert。

import http from 'node:http';
import { MongoClient, ObjectId } from 'mongodb';

const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017';
const DB_NAME   = process.env.MONGO_DB  || 'mogu_express';
const PORT      = Number(process.env.PORT || 4321);
const HOST      = process.env.HOST || '127.0.0.1';

// directConnection 默认 on:这个 viewer 主要给单节点 / SSH tunnel 场景用。
// staging mongo 是 --replSet=rs0,client 连上后会去 rs.config() 拿内部
// hostname (e.g. 'mongo'),laptop 解析不到 → getaddrinfo ENOTFOUND mongo。
// directConnection=true 跳过 replset discovery,直接用 URI 指定的 host。
// 想跑多节点 replset 时显式 export MONGO_DIRECT_CONNECTION=0
const client = new MongoClient(MONGO_URL, {
  serverSelectionTimeoutMS: 5000,
  directConnection: process.env.MONGO_DIRECT_CONNECTION !== '0',
});

try {
  await client.connect();
  console.log(`[mongo-viewer] connected to ${MONGO_URL.replace(/:[^/@]+@/, ':***@')} db=${DB_NAME}`);
} catch (err) {
  console.error('[mongo-viewer] connect failed:', err.message);
  process.exit(1);
}

const db = client.db(DB_NAME);

// 把 Mongo 类型序列化成 JSON 友好的 marker,前端识别后高亮
function ejson(value) {
  return JSON.parse(JSON.stringify(value, (_k, v) => {
    if (v instanceof ObjectId) return { __oid: v.toString() };
    if (v instanceof Date)     return { __date: v.toISOString() };
    if (v && typeof v === 'object' && v._bsontype === 'Decimal128') return { __decimal: v.toString() };
    return v;
  }));
}

// 把 24-hex string 自动转 ObjectId(filter 友好)
function coerceFilter(obj) {
  if (Array.isArray(obj)) return obj.map(coerceFilter);
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      if (k === '_id' && typeof v === 'string' && /^[0-9a-f]{24}$/i.test(v)) {
        try { out[k] = new ObjectId(v); continue; } catch {}
      }
      out[k] = coerceFilter(v);
    }
    return out;
  }
  return obj;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  try {
    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(HTML);
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/collections') {
      const cols = await db.collections();
      const items = [];
      for (const c of cols) {
        try {
          const count = await c.estimatedDocumentCount();
          items.push({ name: c.collectionName, count });
        } catch (err) {
          items.push({ name: c.collectionName, count: -1, err: err.message });
        }
      }
      items.sort((a, b) => a.name.localeCompare(b.name));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ db: DB_NAME, url: MONGO_URL.replace(/:[^/@]+@/, ':***@'), collections: items }));
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/find') {
      const col   = url.searchParams.get('col');
      const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 50, 1), 500);
      const skip  = Math.max(Number(url.searchParams.get('skip')) || 0, 0);
      const sortS = url.searchParams.get('sort') || '-_id';
      let filter = {};
      try { filter = JSON.parse(url.searchParams.get('filter') || '{}'); }
      catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid filter JSON: ' + err.message }));
        return;
      }
      if (!col) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'col required' }));
        return;
      }
      const sort = {};
      for (const part of sortS.split(',')) {
        const t = part.trim();
        if (!t) continue;
        if (t.startsWith('-')) sort[t.slice(1)] = -1;
        else sort[t] = 1;
      }
      const filterCoerced = coerceFilter(filter);
      const coll = db.collection(col);
      const [docs, count] = await Promise.all([
        coll.find(filterCoerced).sort(sort).skip(skip).limit(limit).toArray(),
        coll.countDocuments(filterCoerced),
      ]);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ count, skip, limit, sort: sortS, docs: ejson(docs) }));
      return;
    }

    res.writeHead(404); res.end('not found');
  } catch (err) {
    console.error('[mongo-viewer]', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message, stack: err.stack?.split('\n').slice(0, 5) }));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[mongo-viewer] open http://${HOST}:${PORT}`);
});

process.on('SIGINT', async () => {
  console.log('\n[mongo-viewer] shutting down');
  await client.close().catch(() => {});
  server.close(() => process.exit(0));
});

// ---------------------------------------------------------------------------
// 嵌入式 HTML — 单页 vanilla JS,无构建步骤
// ---------------------------------------------------------------------------

const HTML = /* html */ `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>mongo-viewer</title>
<style>
  :root {
    --bg: #f6f7f9;
    --panel: #ffffff;
    --border: #e1e4e8;
    --text: #24292e;
    --muted: #6a737d;
    --accent: #0366d6;
    --accent-bg: #f1f8ff;
    --key: #0451a5;
    --string: #a31515;
    --number: #098658;
    --boolean: #267f99;
    --null: #6a737d;
    --oid: #af00db;
    --date: #098658;
    --code-bg: #fafbfc;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
    font-size: 13px; color: var(--text); background: var(--bg);
    display: grid; grid-template: "header header" 44px "sidebar main" 1fr / 240px 1fr;
    height: 100vh; overflow: hidden;
  }
  header {
    grid-area: header;
    background: var(--panel); border-bottom: 1px solid var(--border);
    display: flex; align-items: center; padding: 0 16px; gap: 12px;
    font-weight: 600;
  }
  header .badge { font-weight: normal; color: var(--muted); font-size: 12px; }
  header .right { margin-left: auto; display: flex; gap: 8px; }
  button {
    border: 1px solid var(--border); background: var(--panel); padding: 4px 10px;
    border-radius: 4px; cursor: pointer; font-size: 12px;
  }
  button:hover { background: var(--accent-bg); border-color: var(--accent); color: var(--accent); }
  button:disabled { opacity: 0.5; cursor: not-allowed; }

  aside {
    grid-area: sidebar;
    background: var(--panel); border-right: 1px solid var(--border);
    overflow-y: auto; padding: 8px 0;
  }
  .col-item {
    display: flex; justify-content: space-between; align-items: center;
    padding: 6px 14px; cursor: pointer; user-select: none;
  }
  .col-item:hover { background: var(--accent-bg); }
  .col-item.active { background: var(--accent-bg); color: var(--accent); font-weight: 600; }
  .col-item .count { font-size: 11px; color: var(--muted); font-variant-numeric: tabular-nums; }

  main {
    grid-area: main; overflow-y: auto;
    display: flex; flex-direction: column;
  }
  .toolbar {
    background: var(--panel); border-bottom: 1px solid var(--border);
    padding: 10px 16px; display: grid; gap: 8px;
    grid-template-columns: 1fr auto auto;
  }
  .toolbar .controls { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .toolbar label { font-size: 11px; color: var(--muted); margin-right: 4px; }
  .toolbar input, .toolbar textarea {
    font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 12px;
    border: 1px solid var(--border); border-radius: 3px; padding: 4px 6px;
    color: var(--text); background: var(--code-bg);
  }
  .toolbar input:focus, .toolbar textarea:focus { outline: 1px solid var(--accent); border-color: var(--accent); }
  .toolbar textarea { width: 100%; min-height: 30px; resize: vertical; }
  .toolbar .summary {
    grid-column: 1 / -1;
    font-size: 12px; color: var(--muted);
    display: flex; justify-content: space-between; align-items: center;
  }

  .docs { padding: 12px 16px; flex: 1; }
  .doc {
    background: var(--panel); border: 1px solid var(--border); border-radius: 4px;
    margin-bottom: 8px; overflow: hidden;
  }
  .doc summary {
    padding: 8px 12px; cursor: pointer; user-select: none;
    background: var(--code-bg); border-bottom: 1px solid var(--border);
    display: flex; gap: 12px; align-items: center;
    font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 12px;
  }
  .doc summary:hover { background: #eef1f4; }
  .doc summary .pin { color: var(--muted); font-size: 11px; margin-left: auto; }
  .doc summary .copy {
    border: 1px solid var(--border); background: var(--panel); padding: 1px 6px;
    border-radius: 3px; font-size: 11px; cursor: pointer; color: var(--muted);
  }
  .doc summary .copy:hover { color: var(--accent); border-color: var(--accent); }
  .doc pre {
    margin: 0; padding: 10px 14px;
    font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 12px; line-height: 1.5;
    overflow-x: auto; white-space: pre;
  }
  .key   { color: var(--key); }
  .str   { color: var(--string); }
  .num   { color: var(--number); }
  .bool  { color: var(--boolean); }
  .null_ { color: var(--null); font-style: italic; }
  .oid   { color: var(--oid); }
  .date  { color: var(--date); }
  .indent { color: #e1e4e8; }

  .status {
    padding: 24px; text-align: center; color: var(--muted);
  }
  .err {
    background: #ffeef0; color: #86181d; padding: 8px 12px; border-radius: 4px;
    margin: 12px 16px; font-family: ui-monospace, monospace; font-size: 12px;
    white-space: pre-wrap; word-break: break-all;
  }
</style>
</head>
<body>
  <header>
    <span>mongo-viewer</span>
    <span class="badge" id="conn-info">connecting…</span>
    <div class="right">
      <button id="refresh-cols">刷新</button>
    </div>
  </header>

  <aside id="sidebar">
    <div class="status">loading…</div>
  </aside>

  <main>
    <div class="toolbar">
      <div class="controls" style="grid-column: 1 / -1;">
        <label>filter</label>
        <textarea id="filter" rows="1" placeholder='{} 或 {"_openid":"oXXX"} 或 {"_id":"6645a..."}'>{}</textarea>
      </div>
      <div class="controls">
        <label>sort</label>
        <input id="sort" value="-_id" size="18" placeholder="-createdAt,name" />
        <label>limit</label>
        <input id="limit" type="number" min="1" max="500" value="50" size="4" />
      </div>
      <div class="controls">
        <button id="prev">‹ 上一页</button>
        <button id="next">下一页 ›</button>
      </div>
      <button id="apply">查询</button>
      <div class="summary">
        <span id="summary">选一个 collection 开始</span>
        <span id="page-info"></span>
      </div>
    </div>
    <div id="docs" class="docs"></div>
  </main>

<script>
  let state = { col: null, skip: 0, limit: 50 };

  const $ = (id) => document.getElementById(id);

  async function fetchJSON(url) {
    const r = await fetch(url);
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || r.statusText);
    return data;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
  }

  // Pretty-print a JS value to syntax-highlighted HTML
  function highlight(v, indent = 0) {
    const pad = '  '.repeat(indent);
    const pad1 = '  '.repeat(indent + 1);
    if (v === null) return '<span class="null_">null</span>';
    if (v === undefined) return '<span class="null_">undefined</span>';
    if (typeof v === 'string') return '<span class="str">"' + escapeHtml(v) + '"</span>';
    if (typeof v === 'number') return '<span class="num">' + v + '</span>';
    if (typeof v === 'boolean') return '<span class="bool">' + v + '</span>';
    if (Array.isArray(v)) {
      if (v.length === 0) return '[]';
      return '[\\n' + v.map((x) => pad1 + highlight(x, indent + 1)).join(',\\n') + '\\n' + pad + ']';
    }
    if (typeof v === 'object') {
      // EJSON markers
      if (v.__oid)     return '<span class="oid">ObjectId("' + escapeHtml(v.__oid) + '")</span>';
      if (v.__date)    return '<span class="date">ISODate("' + escapeHtml(v.__date) + '")</span>';
      if (v.__decimal) return '<span class="num">Decimal128("' + escapeHtml(v.__decimal) + '")</span>';
      const keys = Object.keys(v);
      if (keys.length === 0) return '{}';
      return '{\\n' + keys.map((k) =>
        pad1 + '<span class="key">"' + escapeHtml(k) + '"</span>: ' + highlight(v[k], indent + 1)
      ).join(',\\n') + '\\n' + pad + '}';
    }
    return escapeHtml(String(v));
  }

  function docTitle(doc) {
    const parts = [];
    if (doc._id?.__oid) parts.push('_id=' + doc._id.__oid.slice(-6));
    else if (doc._id) parts.push('_id=' + String(doc._id).slice(-12));
    for (const k of ['orderNo', 'title', 'name', 'username', 'image', 'nickname', '_openid']) {
      if (doc[k] != null) {
        const v = doc[k]?.__oid || doc[k]?.__date || doc[k];
        const s = typeof v === 'string' ? v : JSON.stringify(v);
        parts.push(k + '=' + (s.length > 40 ? s.slice(0, 40) + '…' : s));
        if (parts.length >= 3) break;
      }
    }
    return parts.join('  ·  ');
  }

  async function loadCollections() {
    try {
      const r = await fetchJSON('/api/collections');
      $('conn-info').textContent = r.url + '  db=' + r.db;
      $('sidebar').innerHTML = r.collections.map((c) =>
        '<div class="col-item' + (c.name === state.col ? ' active' : '') + '" data-col="' + escapeHtml(c.name) + '">' +
          '<span>' + escapeHtml(c.name) + '</span>' +
          '<span class="count">' + (c.count >= 0 ? c.count.toLocaleString() : '?') + '</span>' +
        '</div>'
      ).join('') || '<div class="status">无 collection</div>';
      $('sidebar').querySelectorAll('.col-item').forEach((el) => {
        el.onclick = () => selectCol(el.dataset.col);
      });
    } catch (err) {
      $('sidebar').innerHTML = '<div class="err">' + escapeHtml(err.message) + '</div>';
    }
  }

  function selectCol(name) {
    state.col = name;
    state.skip = 0;
    document.querySelectorAll('.col-item').forEach((el) => {
      el.classList.toggle('active', el.dataset.col === name);
    });
    query();
  }

  async function query() {
    if (!state.col) return;
    state.limit = Math.min(Math.max(Number($('limit').value) || 50, 1), 500);
    const sort = $('sort').value || '-_id';
    const filter = $('filter').value || '{}';
    const params = new URLSearchParams({
      col: state.col, limit: state.limit, skip: state.skip, sort, filter,
    });
    $('summary').textContent = '查询中…';
    $('docs').innerHTML = '';
    try {
      const r = await fetchJSON('/api/find?' + params);
      $('summary').textContent = state.col + ' — 命中 ' + r.count.toLocaleString() + ' 条';
      const start = r.docs.length ? r.skip + 1 : 0;
      const end = r.skip + r.docs.length;
      $('page-info').textContent = r.docs.length ? (start + '–' + end + ' / ' + r.count.toLocaleString()) : '';
      $('prev').disabled = state.skip <= 0;
      $('next').disabled = end >= r.count;
      if (!r.docs.length) {
        $('docs').innerHTML = '<div class="status">无结果</div>';
        return;
      }
      $('docs').innerHTML = r.docs.map((d, i) =>
        '<details class="doc"' + (i < 3 ? ' open' : '') + '>' +
          '<summary>' +
            '<span class="pin">#' + (r.skip + i + 1) + '</span>' +
            '<span>' + escapeHtml(docTitle(d)) + '</span>' +
            '<button class="copy" data-idx="' + i + '">复制 _id</button>' +
          '</summary>' +
          '<pre>' + highlight(d) + '</pre>' +
        '</details>'
      ).join('');
      $('docs').querySelectorAll('.copy').forEach((btn) => {
        btn.onclick = (e) => {
          e.preventDefault();
          const d = r.docs[Number(btn.dataset.idx)];
          const v = d._id?.__oid || d._id;
          navigator.clipboard.writeText(typeof v === 'string' ? v : JSON.stringify(v))
            .then(() => { btn.textContent = '✓ 已复制'; setTimeout(() => btn.textContent = '复制 _id', 1200); });
        };
      });
    } catch (err) {
      $('docs').innerHTML = '<div class="err">' + escapeHtml(err.message) + '</div>';
      $('summary').textContent = '出错';
    }
  }

  $('refresh-cols').onclick = loadCollections;
  $('apply').onclick = () => { state.skip = 0; query(); };
  $('prev').onclick  = () => { state.skip = Math.max(0, state.skip - state.limit); query(); };
  $('next').onclick  = () => { state.skip += state.limit; query(); };
  $('filter').addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { state.skip = 0; query(); }
  });

  loadCollections();
</script>
</body>
</html>`;
