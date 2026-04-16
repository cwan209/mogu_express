// local-backend/api/src/shim/index.js
//
// wx-server-sdk 的本地替身。支持云函数代码不改动在本地跑。
// 覆盖:
//   cloud.init, cloud.DYNAMIC_CURRENT_ENV
//   cloud.getWXContext()
//   cloud.database() — 含 where/doc/add/update/remove/orderBy/skip/limit/count/get
//   db.command.{eq,neq,gt,gte,lt,lte,in,nin,and,or,inc}
//   db.runTransaction(fn)
//   cloud.openapi.* — stub(抛 NotImplemented,M3 由 HuePay 替代)
//   cloud.uploadFile / downloadFile / getTempFileURL — 简单 stub,M4 接 MinIO

let _mongoDb = null;         // MongoDB Db instance
let _mongoClient = null;     // MongoDB client (for sessions)
let _currentContext = {      // 可由 server 在每次请求前 setContext()
  OPENID: null, UNIONID: null, APPID: null,
};

function setMongo(client, db) {
  _mongoClient = client;
  _mongoDb = db;
}

function setContext(ctx) {
  _currentContext = { OPENID: null, UNIONID: null, APPID: 'local_dev', ...ctx };
}

// ===== Command markers =====
// 返回一个带 tag 的特殊对象,translator 识别后转 Mongo 操作符
const TAG = Symbol.for('mogu_shim_cmd');

function cmd(op, val) { return { [TAG]: true, op, val }; }

const command = {
  eq:  (v) => cmd('eq',  v),
  neq: (v) => cmd('neq', v),
  gt:  (v) => cmd('gt',  v),
  gte: (v) => cmd('gte', v),
  lt:  (v) => cmd('lt',  v),
  lte: (v) => cmd('lte', v),
  in:  (v) => cmd('in',  v),
  nin: (v) => cmd('nin', v),
  and: (arr) => cmd('and', arr),
  or:  (arr) => cmd('or',  arr),
  // 写入用
  inc: (v) => cmd('inc', v),
  set: (v) => cmd('set', v),
  push: (v) => cmd('push', v),
  remove: () => cmd('remove'),
};

// ===== Where / update 翻译器 =====
function isCmd(v) { return v && typeof v === 'object' && v[TAG] === true; }

function translateWhere(where) {
  // 顶层 cmd:$and / $or
  if (isCmd(where)) {
    if (where.op === 'and') return { $and: where.val.map(translateWhere) };
    if (where.op === 'or')  return { $or:  where.val.map(translateWhere) };
    // 其他 cmd 不应单独出现在顶层
    return {};
  }
  if (!where || typeof where !== 'object') return {};
  const out = {};
  for (const [k, v] of Object.entries(where)) {
    if (isCmd(v)) {
      switch (v.op) {
        case 'eq':  out[k] = v.val; break;
        case 'neq': out[k] = { $ne: v.val }; break;
        case 'gt':  out[k] = { $gt: v.val }; break;
        case 'gte': out[k] = { $gte: v.val }; break;
        case 'lt':  out[k] = { $lt: v.val }; break;
        case 'lte': out[k] = { $lte: v.val }; break;
        case 'in':  out[k] = { $in:  v.val }; break;
        case 'nin': out[k] = { $nin: v.val }; break;
        default:    out[k] = v.val;
      }
    } else if (v !== null && typeof v === 'object' && !(v instanceof Date) && !Array.isArray(v)) {
      // 嵌套对象(例如 {'items.tuanId': 'xxx'} 已是扁平 key,不会进这里)
      // 其他场景原样传(这里不特别处理嵌套 cmd)
      out[k] = v;
    } else {
      out[k] = v;
    }
  }
  return out;
}

// 翻译 update data,分离 $set / $inc / $push
function translateUpdate(data) {
  const $set = {};
  const $inc = {};
  const $push = {};
  const $unset = {};
  for (const [k, v] of Object.entries(data || {})) {
    if (isCmd(v)) {
      if (v.op === 'inc') $inc[k] = v.val;
      else if (v.op === 'push') $push[k] = v.val;
      else if (v.op === 'remove') $unset[k] = '';
      else if (v.op === 'set') $set[k] = v.val;
      else $set[k] = v.val;
    } else {
      $set[k] = v;
    }
  }
  const out = {};
  if (Object.keys($set).length)   out.$set = $set;
  if (Object.keys($inc).length)   out.$inc = $inc;
  if (Object.keys($push).length)  out.$push = $push;
  if (Object.keys($unset).length) out.$unset = $unset;
  return out;
}

// ===== 生成 _id(微信云数据库用 20 字节 hex 左右的字符串) =====
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

// ===== Collection =====
function makeCollection(collName, { session = null } = {}) {
  const state = { filter: {}, sort: [], skip: 0, limit: 100 };

  function chain() { return api; }

  const api = {
    where(cond) {
      const t = translateWhere(cond);
      state.filter = Object.keys(state.filter).length
        ? { $and: [state.filter, t] }
        : t;
      return chain();
    },
    orderBy(field, dir) {
      state.sort.push([field, dir === 'desc' ? -1 : 1]);
      return chain();
    },
    skip(n) { state.skip = n; return chain(); },
    limit(n) { state.limit = n; return chain(); },

    async get() {
      const col = _mongoDb.collection(collName);
      const cursor = col.find(state.filter, { session });
      if (state.sort.length) cursor.sort(Object.fromEntries(state.sort));
      if (state.skip) cursor.skip(state.skip);
      if (state.limit) cursor.limit(state.limit);
      const data = await cursor.toArray();
      return { data, errMsg: 'collection.get:ok' };
    },

    async count() {
      const col = _mongoDb.collection(collName);
      const total = await col.countDocuments(state.filter, { session });
      return { total, errMsg: 'collection.count:ok' };
    },

    async add({ data }) {
      const doc = { _id: data._id || genId(), ...data };
      delete doc.createTime; // 保留 createdAt 字段
      const col = _mongoDb.collection(collName);
      await col.insertOne(doc, { session });
      return { _id: doc._id, errMsg: 'collection.add:ok' };
    },

    // batch update: col.where(...).update({data})
    async update({ data }) {
      const col = _mongoDb.collection(collName);
      const mod = translateUpdate(data);
      const res = await col.updateMany(state.filter, mod, { session });
      return { stats: { updated: res.modifiedCount }, errMsg: 'collection.update:ok' };
    },

    doc(id) {
      return {
        async get() {
          const col = _mongoDb.collection(collName);
          const d = await col.findOne({ _id: id }, { session });
          if (!d) {
            const err = new Error('document not found');
            err.errCode = -1;
            throw err;
          }
          return { data: d, errMsg: 'document.get:ok' };
        },
        async update({ data }) {
          const col = _mongoDb.collection(collName);
          const mod = translateUpdate(data);
          const res = await col.updateOne({ _id: id }, mod, { session });
          return { stats: { updated: res.modifiedCount }, errMsg: 'document.update:ok' };
        },
        async set({ data }) {
          const col = _mongoDb.collection(collName);
          await col.replaceOne({ _id: id }, { _id: id, ...data }, { upsert: true, session });
          return { errMsg: 'document.set:ok' };
        },
        async remove() {
          const col = _mongoDb.collection(collName);
          const res = await col.deleteOne({ _id: id }, { session });
          return { stats: { removed: res.deletedCount }, errMsg: 'document.remove:ok' };
        },
      };
    },
  };

  return api;
}

// ===== Database =====
function makeDatabase({ session = null } = {}) {
  const db = {
    collection: (name) => makeCollection(name, { session }),
    command,
    RegExp: (pattern) => new RegExp(pattern.regexp || pattern, pattern.options || 'i'),
    Geo: {
      Point: (lng, lat) => ({ type: 'Point', coordinates: [lng, lat] }),
    },
    serverDate: () => new Date(),
    // 云开发在 db 对象上也挂了 runTransaction
    runTransaction: (fn) => runTransaction(fn),
  };
  return db;
}

// ===== runTransaction =====
async function runTransaction(callback) {
  if (!_mongoClient) throw new Error('mongo client not set');
  const session = _mongoClient.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const txnDb = makeDatabase({ session });
      // 微信云事务:transaction.collection(...)  而不是 transaction.collection(...).doc(...).update(...)
      const transaction = {
        collection: (name) => makeCollection(name, { session }),
      };
      result = await callback(transaction);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

// ===== openapi stubs =====
const openapi = {
  payment: {
    async unifiedOrder() {
      throw new Error('openapi.payment.unifiedOrder not implemented in local shim — will be replaced by HuePay in M3');
    },
  },
  wxacode: {
    async getUnlimited(opts) {
      // 返回占位图,M5 真机或部署后会拿到真二维码
      return {
        contentType: 'image/png',
        buffer: Buffer.from(''),
        fileID: 'cloud://local/wxacode_placeholder_' + (opts.scene || 'x') + '.png',
      };
    },
  },
  customerServiceMessage: {
    async send() { return { errCode: 0, errMsg: 'stub' }; },
  },
  subscribeMessage: {
    async send() { return { errCode: 0, errMsg: 'stub' }; },
  },
};

// ===== storage stubs =====
async function uploadFile(opts) {
  // M4 接 MinIO,现在只返回假 fileID
  return { fileID: 'cloud://local/' + (opts.cloudPath || 'upload_' + genId()) };
}
async function downloadFile() { throw new Error('downloadFile not implemented'); }
async function getTempFileURL({ fileList }) {
  return {
    fileList: fileList.map((f) => ({
      fileID: typeof f === 'string' ? f : f.fileID,
      tempFileURL: 'http://localhost:4000/files/' + encodeURIComponent(typeof f === 'string' ? f : f.fileID),
      status: 0,
    })),
  };
}

// ===== 导出 =====
module.exports = {
  // 内部管理(server 调用)
  __setMongo: setMongo,
  __setContext: setContext,

  // 微信云开发公开 API
  DYNAMIC_CURRENT_ENV: Symbol.for('dynamic_current_env'),
  init(/* opts */) { /* no-op */ },
  getWXContext() {
    return {
      OPENID: _currentContext.OPENID,
      UNIONID: _currentContext.UNIONID,
      APPID: _currentContext.APPID,
    };
  },
  database() { return makeDatabase(); },
  runTransaction,
  openapi,
  uploadFile,
  downloadFile,
  getTempFileURL,
  // 云函数内调云函数(当前 stub,M4 可支持)
  async callFunction({ name, data }) {
    throw new Error('cloud.callFunction not implemented locally — use HTTP directly');
  },
};
