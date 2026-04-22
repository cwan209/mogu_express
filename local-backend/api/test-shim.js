// test-shim.js - 端到端集成测试
//   - 不需要真 MongoDB:用纯内存 mock 实现 mongo client API
//   - 通过 wx-server-sdk shim 跑真实云函数代码
//   - 用真断言(node:assert),失败立刻 throw → process exit 1
//
// 用法:  node test-shim.js
// CI:    npm test 触发本文件,exit code 决定 PR 是否通过

'use strict';

const path = require('path');
const Module = require('module');
const assert = require('assert/strict');

// ---- 1. 把 require('wx-server-sdk') 重定向到 shim,fallback 到 api/node_modules ----
const SHIM_PATH = path.resolve(__dirname, 'src/shim/index.js');
const FALLBACK = path.resolve(__dirname, 'node_modules');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (r, p, ...rest) {
  if (r === 'wx-server-sdk') return SHIM_PATH;
  try { return origResolve.call(this, r, p, ...rest); }
  catch (err) {
    if (err.code === 'MODULE_NOT_FOUND' && !r.startsWith('.') && !r.startsWith('/')) {
      try { return origResolve.call(this, path.join(FALLBACK, r), p, ...rest); } catch {}
    }
    throw err;
  }
};

// HuePay 用 stub 模式
process.env.HUEPAY_STUB = '1';
process.env.CLOUD_ENV = 'local';

const shim = require('./src/shim');
const cfRoot = path.resolve(__dirname, '../../cloudfunctions');
const requireCf = (rel) => {
  // 强制重新 require,避免 module cache 让 shim/db 状态污染下个 test
  const p = path.join(cfRoot, rel, 'index.js');
  delete require.cache[require.resolve(p)];
  return require(p);
};

// ---- 2. In-memory MongoDB mock ----
function mkMockDb(seed) {
  const store = JSON.parse(JSON.stringify(seed || {}));
  return {
    collection(name) {
      if (!store[name]) store[name] = [];
      const arr = store[name];
      function applyFilter(f, doc) {
        if (!f || Object.keys(f).length === 0) return true;
        if (f.$and) return f.$and.every((c) => applyFilter(c, doc));
        if (f.$or)  return f.$or.some((c) => applyFilter(c, doc));
        for (const [k, v] of Object.entries(f)) {
          const dv = k.includes('.')
            ? k.split('.').reduce((o, p) => (Array.isArray(o) ? o.map(x => x?.[p]) : o?.[p]), doc)
            : doc[k];
          if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) {
            if ('$in' in v) {
              const a = Array.isArray(dv) ? dv : [dv];
              if (!a.some((x) => v.$in.includes(x))) return false;
            }
            if ('$nin' in v && v.$nin.includes(dv)) return false;
            if ('$ne' in v && dv === v.$ne) return false;
            if ('$gt' in v && !(new Date(dv) > new Date(v.$gt))) return false;
            if ('$gte' in v && !(new Date(dv) >= new Date(v.$gte))) return false;
            if ('$lt' in v && !(new Date(dv) < new Date(v.$lt))) return false;
            if ('$lte' in v && !(new Date(dv) <= new Date(v.$lte))) return false;
          } else if (Array.isArray(dv) && typeof v === 'string') {
            if (!dv.includes(v)) return false;
          } else if (dv !== v) return false;
        }
        return true;
      }
      return {
        find(f) {
          let m = arr.filter((d) => applyFilter(f || {}, d));
          const api = {
            sort(s) { const [[k, d]] = Object.entries(s); m.sort((a, b) => (a[k] < b[k] ? -d : d)); return api; },
            skip(n) { m = m.slice(n); return api; },
            limit(n) { m = m.slice(0, n); return api; },
            async toArray() { return m; },
          };
          return api;
        },
        async findOne(f) { return arr.find((d) => applyFilter(f, d)) || null; },
        async insertOne(d) { arr.push(d); return { acknowledged: true, insertedId: d._id }; },
        async updateOne(f, u) {
          const i = arr.findIndex((d) => applyFilter(f, d));
          if (i < 0) return { modifiedCount: 0 };
          if (u.$set) Object.assign(arr[i], u.$set);
          if (u.$inc) for (const [k, v] of Object.entries(u.$inc)) arr[i][k] = (arr[i][k] || 0) + v;
          return { modifiedCount: 1 };
        },
        async updateMany(f, u) {
          let n = 0;
          for (const d of arr) if (applyFilter(f, d)) {
            if (u.$set) Object.assign(d, u.$set);
            if (u.$inc) for (const [k, v] of Object.entries(u.$inc)) d[k] = (d[k] || 0) + v;
            n++;
          }
          return { modifiedCount: n };
        },
        async deleteOne(f) {
          const i = arr.findIndex((d) => applyFilter(f, d));
          if (i < 0) return { deletedCount: 0 };
          arr.splice(i, 1);
          return { deletedCount: 1 };
        },
        async replaceOne(f, d) {
          const i = arr.findIndex((x) => applyFilter(f, x));
          if (i < 0) { arr.push(d); return { upsertedId: d._id, modifiedCount: 0 }; }
          arr[i] = d;
          return { modifiedCount: 1 };
        },
        async countDocuments(f) { return arr.filter((d) => applyFilter(f || {}, d)).length; },
      };
    },
  };
}

const mockClient = {
  startSession: () => ({
    withTransaction: async (fn) => fn(),
    endSession: async () => {},
  }),
};

// ---- 3. 测试 runner ----
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

async function runAll() {
  let passed = 0, failed = 0;
  const failures = [];
  for (const t of tests) {
    process.stdout.write(`  • ${t.name} ... `);
    try {
      await t.fn();
      console.log('\x1b[32mok\x1b[0m');
      passed++;
    } catch (err) {
      console.log('\x1b[31mFAIL\x1b[0m');
      failures.push({ name: t.name, err });
      failed++;
    }
  }
  console.log();
  console.log(`────────────────────────────────────`);
  console.log(`  ${passed} passed,  ${failed} failed`);
  if (failures.length) {
    console.log();
    for (const { name, err } of failures) {
      console.log(`\x1b[31m✗ ${name}\x1b[0m`);
      console.log('   ' + (err.stack || err.message).split('\n').join('\n   '));
      console.log();
    }
    process.exit(1);
  }
  console.log('\x1b[32m✅ all passed\x1b[0m');
}

// ---- 4. 准备 seed ----
function freshSeed() {
  return {
    tuans: [
      { _id: 'tuan_001', status: 'on_sale',  endAt: new Date(Date.now() + 86400e3), title: 'Tuan 1', createdAt: new Date(), productCount: 2 },
      { _id: 'tuan_002', status: 'scheduled', endAt: new Date(Date.now() + 172800e3), title: 'Tuan 2', createdAt: new Date(), productCount: 0 },
      { _id: 'tuan_003', status: 'closed',    endAt: new Date(Date.now() - 86400e3), title: 'Tuan 3', createdAt: new Date(), productCount: 0 },
    ],
    products: [
      { _id: 'p1', tuanId: 'tuan_001', sort: 1, title: 'P1', price: 100, stock: 10, sold: 0, participantCount: 0, coverFileId: '', imageFileIds: [], categoryIds: [], description: '' },
      { _id: 'p2', tuanId: 'tuan_001', sort: 2, title: 'P2', price: 200, stock: 5, sold: 2, participantCount: 0, coverFileId: '', imageFileIds: [], categoryIds: [], description: '' },
    ],
    users: [], admins: [], carts: [], addresses: [], orders: [],
    pay_logs: [], participant_index: [], categories: [],
  };
}

function reset(extra = {}) {
  const seed = { ...freshSeed(), ...extra };
  shim.__setMongo(mockClient, mkMockDb(seed));
  return seed;
}

// ════════════════════════════════════════════
// Tests
// ════════════════════════════════════════════

test('listTuans 只返回 on_sale + scheduled', async () => {
  reset();
  shim.__setContext({ OPENID: null });
  const r = await requireCf('listTuans').main({ page: 1, pageSize: 20 }, {});
  assert.equal(r.code, 0);
  assert.equal(r.items.length, 2);
  assert.ok(r.items.every(t => ['on_sale', 'scheduled'].includes(t.status)));
});

test('getTuanDetail 返回团 + 商品列表', async () => {
  reset();
  const r = await requireCf('getTuanDetail').main({ tuanId: 'tuan_001' }, {});
  assert.equal(r.code, 0);
  assert.equal(r.tuan._id, 'tuan_001');
  assert.equal(r.products.length, 2);
});

test('login 新用户 isRegistered=false', async () => {
  reset();
  shim.__setContext({ OPENID: 'u_new' });
  const r = await requireCf('login').main({}, {});
  assert.equal(r.code, 0);
  assert.equal(r.openid, 'u_new');
  assert.equal(r.isRegistered, false);
});

test('registerProfile 后 isRegistered 变 true', async () => {
  reset();
  shim.__setContext({ OPENID: 'u_new' });
  await requireCf('login').main({}, {});
  await requireCf('registerProfile').main({ name: 'A', phone: '0400' }, {});
  const r2 = await requireCf('login').main({}, {});
  assert.equal(r2.isRegistered, true);
  assert.equal(r2.userInfo.name, 'A');
});

test('listProducts 按 tuanId 过滤', async () => {
  reset();
  const r = await requireCf('listProducts').main({ tuanId: 'tuan_001' }, {});
  assert.equal(r.code, 0);
  assert.equal(r.items.length, 2);
});

test('createOrder requirePay=true 返 pending_pay + stub payParams', async () => {
  reset({
    users: [{ _openid: 'u1', name: 'A', phone: '0400', registeredAt: new Date() }],
    addresses: [{ _id: 'addr1', _openid: 'u1', isDefault: true,
      recipient: 'A', phone: '0400', line1: '1 St', line2: '',
      suburb: 'M', state: 'VIC', postcode: '3000' }],
  });
  shim.__setContext({ OPENID: 'u1' });
  const r = await requireCf('createOrder').main({
    items: [{ productId: 'p1', quantity: 2 }, { productId: 'p2', quantity: 1 }],
    addressId: 'addr1', remark: 't', requirePay: true,
  }, {});
  assert.equal(r.code, 0);
  assert.equal(r.order.status, 'pending_pay');
  assert.equal(r.order.payStatus, 'pending');
  assert.equal(r.order.amount, 100 * 2 + 200 * 1);
  assert.ok(r.payParams);
  assert.equal(r.payParams.__stub, true);
});

test('createOrder requirePay=false 直接 paid(legacy 兼容)', async () => {
  reset({
    users: [{ _openid: 'u1', name: 'A', phone: '0400', registeredAt: new Date() }],
    addresses: [{ _id: 'addr1', _openid: 'u1', isDefault: true,
      recipient: 'A', phone: '0400', line1: '1 St', line2: '',
      suburb: 'M', state: 'VIC', postcode: '3000' }],
  });
  shim.__setContext({ OPENID: 'u1' });
  const r = await requireCf('createOrder').main({
    items: [{ productId: 'p1', quantity: 1 }],
    addressId: 'addr1', requirePay: false,
  }, {});
  assert.equal(r.code, 0);
  assert.equal(r.order.status, 'paid');
  assert.equal(r.order.payStatus, 'paid');
  assert.equal(r.payParams, null);
});

test('createOrder 库存不足时拒绝', async () => {
  reset({
    users: [{ _openid: 'u1', name: 'A', phone: '0400', registeredAt: new Date() }],
    addresses: [{ _id: 'addr1', _openid: 'u1', isDefault: true,
      recipient: 'A', phone: '0400', line1: '1 St', line2: '',
      suburb: 'M', state: 'VIC', postcode: '3000' }],
  });
  shim.__setContext({ OPENID: 'u1' });
  // createOrder throws { code: 6, message: '...' } (plain object, not Error)
  await assert.rejects(
    requireCf('createOrder').main({
      items: [{ productId: 'p1', quantity: 999 }],
      addressId: 'addr1', requirePay: false,
    }, {}),
    (err) => err && err.code === 6 && /库存不足/.test(err.message || ''),
  );
});

test('cancelOrder 仅 pending_pay 可取消(paid 拒绝)', async () => {
  reset({
    users: [{ _openid: 'u1', name: 'A', phone: '0400', registeredAt: new Date() }],
    addresses: [{ _id: 'addr1', _openid: 'u1', isDefault: true,
      recipient: 'A', phone: '0400', line1: '1 St', line2: '',
      suburb: 'M', state: 'VIC', postcode: '3000' }],
  });
  shim.__setContext({ OPENID: 'u1' });

  // 先做一个 paid 订单
  const r1 = await requireCf('createOrder').main({
    items: [{ productId: 'p1', quantity: 1 }],
    addressId: 'addr1', requirePay: false,
  }, {});
  const r2 = await requireCf('cancelOrder').main({ orderId: r1.order._id }, {});
  assert.equal(r2.code, 3);    // "仅待支付订单可取消"
});

test('simulatePay 把 pending_pay 订单变 paid', async () => {
  reset({
    users: [{ _openid: 'u1', name: 'A', phone: '0400', registeredAt: new Date() }],
    addresses: [{ _id: 'addr1', _openid: 'u1', isDefault: true,
      recipient: 'A', phone: '0400', line1: '1 St', line2: '',
      suburb: 'M', state: 'VIC', postcode: '3000' }],
  });
  shim.__setContext({ OPENID: 'u1' });
  const r1 = await requireCf('createOrder').main({
    items: [{ productId: 'p1', quantity: 1 }],
    addressId: 'addr1', requirePay: true,
  }, {});
  assert.equal(r1.order.payStatus, 'pending');
  const r2 = await requireCf('_dev/simulatePay').main({ orderId: r1.order._id }, {});
  assert.equal(r2.code, 0);
  assert.equal(r2.order.payStatus, 'paid');
});

test('queryHuepayOrder 已支付订单返 source=local 短路', async () => {
  reset({
    users: [{ _openid: 'u1', name: 'A', phone: '0400', registeredAt: new Date() }],
    addresses: [{ _id: 'addr1', _openid: 'u1', isDefault: true,
      recipient: 'A', phone: '0400', line1: '1 St', line2: '',
      suburb: 'M', state: 'VIC', postcode: '3000' }],
  });
  shim.__setContext({ OPENID: 'u1' });
  const r1 = await requireCf('createOrder').main({
    items: [{ productId: 'p1', quantity: 1 }], addressId: 'addr1', requirePay: false,
  }, {});
  const q = await requireCf('queryHuepayOrder').main({ orderId: r1.order._id }, {});
  assert.equal(q.code, 0);
  assert.equal(q.paid, true);
  assert.equal(q.source, 'local');
});

test('payCallback 幂等(已 paid 订单重放被忽略)', async () => {
  reset({
    users: [{ _openid: 'u1', name: 'A', phone: '0400', registeredAt: new Date() }],
    addresses: [{ _id: 'addr1', _openid: 'u1', isDefault: true,
      recipient: 'A', phone: '0400', line1: '1 St', line2: '',
      suburb: 'M', state: 'VIC', postcode: '3000' }],
  });
  shim.__setContext({ OPENID: 'u1' });
  const r1 = await requireCf('createOrder').main({
    items: [{ productId: 'p1', quantity: 1 }], addressId: 'addr1', requirePay: true,
  }, {});
  await requireCf('_dev/simulatePay').main({ orderId: r1.order._id }, {});

  // Replay callback
  const cbResult = await requireCf('payCallback').main({
    __stub: true,
    out_trade_no: r1.order.outTradeNo,
    transaction_id: 'STUB_TX_DUP',
    amount: r1.order.amount,
    status: 'SUCCESS',
    paid_at: new Date().toISOString(),
  }, {});
  assert.equal(cbResult.code, 0);
});

test('_admin/adminLogin 用户名密码 + 签 JWT', async () => {
  // 用真实 hashPassword 生成
  const { hashPassword } = require(path.join(cfRoot, '_lib/auth/jwt.js'));
  reset({
    admins: [{ _id: 'a1', username: 'admin', passwordHash: hashPassword('admin'), role: 'owner', openid: 'admin_x' }],
  });
  shim.__setContext({ OPENID: null });
  const r = await requireCf('_admin/adminLogin').main({ username: 'admin', password: 'admin' });
  assert.equal(r.code, 0);
  assert.ok(r.token);
  assert.equal(r.admin.username, 'admin');
});

test('_admin/tuanCRUD list with JWT 通过', async () => {
  const { hashPassword, sign } = require(path.join(cfRoot, '_lib/auth/jwt.js'));
  reset({
    admins: [{ _id: 'a1', username: 'admin', passwordHash: hashPassword('admin'), role: 'owner', openid: 'admin_x' }],
  });
  const token = sign({ sub: 'a1', username: 'admin', role: 'owner' }, 'mogu_express_dev_secret_REPLACE_ME_IN_PROD');
  shim.__setContext({ OPENID: null });
  const r = await requireCf('_admin/tuanCRUD').main({ action: 'list', token });
  assert.equal(r.code, 0);
  assert.ok(Array.isArray(r.items));
});

test('_admin/tuanCRUD list 无 token 返 401', async () => {
  reset();
  shim.__setContext({ OPENID: null });
  const r = await requireCf('_admin/tuanCRUD').main({ action: 'list' });
  assert.equal(r.code, 401);
});

test('_admin/exportOrders 生成有效 xlsx', async () => {
  const { hashPassword, sign } = require(path.join(cfRoot, '_lib/auth/jwt.js'));
  reset({
    admins: [{ _id: 'a1', username: 'admin', passwordHash: hashPassword('admin'), role: 'owner' }],
    orders: [{
      _id: 'o1', orderNo: 'MG001', outTradeNo: 'T1', _openid: 'u1',
      userSnapshot: { name: 'A', phone: '0400' },
      items: [{ productId: 'p1', tuanId: 'tuan_001', title: 'P1', price: 100, quantity: 1, subtotal: 100, coverFileId: '' }],
      amount: 100, shipping: { recipient: 'A', phone: '0400', line1: '1', line2: '', suburb: 'M', state: 'VIC', postcode: '3000' },
      remark: '', status: 'paid', payStatus: 'paid',
      paidAt: new Date(), createdAt: new Date(), updatedAt: new Date(),
    }],
  });
  const token = sign({ sub: 'a1', role: 'owner' }, 'mogu_express_dev_secret_REPLACE_ME_IN_PROD');
  shim.__setContext({ OPENID: null });
  const r = await requireCf('_admin/exportOrders').main({ token });
  assert.equal(r.code, 0);
  assert.ok(r.base64);
  const buf = Buffer.from(r.base64, 'base64');
  assert.ok(buf.length > 1000, 'xlsx should be substantial');
  assert.equal(buf.slice(0, 2).toString('hex'), '504b', 'PK magic = valid xlsx zip');
});

test('cron_tuanStatus 运行不报错', async () => {
  reset();
  const r = await requireCf('cron_tuanStatus').main({}, {});
  assert.equal(r.code, 0);
});

test('HuePay SDK refund stub', async () => {
  const huepay = require(path.join(cfRoot, 'createOrder/huepay/index.js'));
  // 强制 reload 拿 stub
  delete require.cache[require.resolve(path.join(cfRoot, 'createOrder/huepay/index.js'))];
  const fresh = require(path.join(cfRoot, 'createOrder/huepay/index.js'));
  const r = await fresh.refund({ outTradeNo: 'TX1', refundNo: 'R1', refundAmount: 100, reason: 'test' });
  assert.equal(r.success, true);
  assert.ok(r.refundId);
});

// ── Section(团内分组)相关 ──

test('_admin/productCRUD create 支持 section 字段', async () => {
  const { hashPassword, sign } = require(path.join(cfRoot, '_lib/auth/jwt.js'));
  reset({
    admins: [{ _id: 'a1', username: 'admin', passwordHash: hashPassword('admin'), role: 'owner' }],
  });
  const token = sign({ sub: 'a1', role: 'owner' }, 'mogu_express_dev_secret_REPLACE_ME_IN_PROD');
  shim.__setContext({ OPENID: null });
  const r = await requireCf('_admin/productCRUD').main({
    action: 'create',
    token,
    payload: {
      tuanId: 'tuan_001',
      title: 'test',
      coverFileId: 'x',
      section: '  测试分组  ',       // 带前后空格
      price: 100, stock: 10, sort: 1,
      categoryIds: [],
    },
  });
  assert.equal(r.code, 0);
  assert.ok(r._id);
  // 读回来确认 trim + 落库
  const list = await requireCf('_admin/productCRUD').main({ action: 'list', token, tuanId: 'tuan_001' });
  const found = list.items.find((p) => p._id === r._id);
  assert.ok(found, 'new product should be in list');
  assert.equal(found.section, '测试分组');
});

test('_admin/productCRUD create section 空串存 null', async () => {
  const { hashPassword, sign } = require(path.join(cfRoot, '_lib/auth/jwt.js'));
  reset({
    admins: [{ _id: 'a1', username: 'admin', passwordHash: hashPassword('admin'), role: 'owner' }],
  });
  const token = sign({ sub: 'a1', role: 'owner' }, 'mogu_express_dev_secret_REPLACE_ME_IN_PROD');
  shim.__setContext({ OPENID: null });
  const r = await requireCf('_admin/productCRUD').main({
    action: 'create',
    token,
    payload: {
      tuanId: 'tuan_001',
      title: 'no section',
      coverFileId: 'x',
      section: '   ',              // 只空白
      price: 100, stock: 10, sort: 1,
      categoryIds: [],
    },
  });
  assert.equal(r.code, 0);
  const list = await requireCf('_admin/productCRUD').main({ action: 'list', token, tuanId: 'tuan_001' });
  const found = list.items.find((p) => p._id === r._id);
  assert.equal(found.section, null);
});

test('_admin/productCRUD update section 能清空(传空串→null)', async () => {
  const { hashPassword, sign } = require(path.join(cfRoot, '_lib/auth/jwt.js'));
  // 先建一个有 section 的产品
  reset({
    admins: [{ _id: 'a1', username: 'admin', passwordHash: hashPassword('admin'), role: 'owner' }],
    products: [
      { _id: 'px', tuanId: 'tuan_001', sort: 1, title: 'X', price: 100, stock: 10, sold: 0, section: '旧分组', categoryIds: [], participantCount: 0, coverFileId: '', imageFileIds: [], description: '' },
    ],
  });
  const token = sign({ sub: 'a1', role: 'owner' }, 'mogu_express_dev_secret_REPLACE_ME_IN_PROD');
  shim.__setContext({ OPENID: null });
  const r = await requireCf('_admin/productCRUD').main({
    action: 'update', token, id: 'px', patch: { section: '' },
  });
  assert.equal(r.code, 0);
  const list = await requireCf('_admin/productCRUD').main({ action: 'list', token, tuanId: 'tuan_001' });
  const found = list.items.find((p) => p._id === 'px');
  assert.equal(found.section, null);
});

// ── 地址校验(addressValidate.js)— 面向中国大陆用户 ──

test('addressValidate 通过合法中国地址', () => {
  const { validate } = require(path.resolve(__dirname, '../../miniprogram/utils/addressValidate.js'));
  const ok = {
    recipient: '王小姐', phone: '13800138000',
    state: '浙江', suburb: '杭州市 西湖区',
    line1: '文三路 100 号', line2: '3 号楼 501',
    postcode: '310012',
  };
  assert.equal(validate(ok), null);
});

test('addressValidate 拒绝非 11 位手机', () => {
  const { validate } = require(path.resolve(__dirname, '../../miniprogram/utils/addressValidate.js'));
  const bad = {
    recipient: '王小姐', phone: '12345',
    state: '浙江', suburb: '杭州', line1: '文三路', postcode: '310000',
  };
  const err = validate(bad);
  assert.ok(err && err.field === 'phone');
});

test('addressValidate 拒绝 1 开头但第二位 0-2 的手机', () => {
  const { validate } = require(path.resolve(__dirname, '../../miniprogram/utils/addressValidate.js'));
  const bad = {
    recipient: '王小姐', phone: '12012345678',  // 12 开头,不合法
    state: '浙江', suburb: '杭州', line1: '文三路', postcode: '310000',
  };
  const err = validate(bad);
  assert.ok(err && err.field === 'phone');
});

test('addressValidate 拒绝非 6 位邮编', () => {
  const { validate } = require(path.resolve(__dirname, '../../miniprogram/utils/addressValidate.js'));
  const bad = {
    recipient: '李雷', phone: '13800138000',
    state: '北京', suburb: '朝阳区', line1: '建国路 1 号', postcode: '1000',
  };
  const err = validate(bad);
  assert.ok(err && err.field === 'postcode');
});

test('addressValidate 拒绝不在列表的省份', () => {
  const { validate } = require(path.resolve(__dirname, '../../miniprogram/utils/addressValidate.js'));
  const bad = {
    recipient: '李雷', phone: '13800138000',
    state: 'VIC', suburb: '朝阳区', line1: '建国路 1 号', postcode: '100000',
  };
  const err = validate(bad);
  assert.ok(err && err.field === 'state');
});

test('addressValidate 拒绝纯数字姓名', () => {
  const { validate } = require(path.resolve(__dirname, '../../miniprogram/utils/addressValidate.js'));
  const bad = {
    recipient: '12345', phone: '13800138000',
    state: '北京', suburb: '朝阳区', line1: '建国路 1 号', postcode: '100000',
  };
  const err = validate(bad);
  assert.ok(err && err.field === 'recipient');
});

test('addressValidate 接受 +86 格式手机', () => {
  const { validate } = require(path.resolve(__dirname, '../../miniprogram/utils/addressValidate.js'));
  const ok = {
    recipient: '王小姐', phone: '+86 138 0013 8000',
    state: '上海', suburb: '浦东新区', line1: '陆家嘴 1 号', postcode: '200120',
  };
  assert.equal(validate(ok), null);
});

test('addressValidate normalize 去空格', () => {
  const { normalize } = require(path.resolve(__dirname, '../../miniprogram/utils/addressValidate.js'));
  const raw = {
    recipient: '  王小姐  ', phone: ' 13800138000 ',
    state: ' 浙江 ', suburb: ' 杭州市 西湖区 ',
    line1: ' 文三路 100 号 ', line2: '', postcode: ' 310012 ',
  };
  const n = normalize(raw);
  assert.equal(n.recipient, '王小姐');
  assert.equal(n.state, '浙江');
  assert.equal(n.postcode, '310012');
  assert.equal(n.line1, '文三路 100 号');
});

test('addressValidate 接受直辖市(北京/上海)', () => {
  const { validate } = require(path.resolve(__dirname, '../../miniprogram/utils/addressValidate.js'));
  const ok = {
    recipient: '李雷', phone: '13800138000',
    state: '北京', suburb: '朝阳区',
    line1: '建国路 1 号', postcode: '100022',
  };
  assert.equal(validate(ok), null);
});

// ---- 5. Run ----
console.log(`\nmogu_express test-shim — ${tests.length} tests\n`);
runAll().catch((err) => {
  console.error('\n❌ test runner crashed:', err);
  process.exit(1);
});
