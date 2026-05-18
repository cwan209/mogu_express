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
    // catalog
    products: [
      { _id: 'p1', title: 'P1', coverFileId: '', imageFileIds: [], categoryIds: [], description: '' },
      { _id: 'p2', title: 'P2', coverFileId: '', imageFileIds: [], categoryIds: [], description: '' },
    ],
    // team-specific instances
    tuan_items: [
      { _id: 'ti_p1_tuan_001', tuanId: 'tuan_001', productId: 'p1', price: 100, stock: 10, sold: 0, sort: 1, section: null, participantCount: 0 },
      { _id: 'ti_p2_tuan_001', tuanId: 'tuan_001', productId: 'p2', price: 200, stock: 5,  sold: 2, sort: 2, section: null, participantCount: 0 },
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

test('registerProfile 后 isRegistered 变 true (groupId 流程)', async () => {
  reset();
  shim.__setContext({ OPENID: 'u_new' });
  await requireCf('login').main({}, {});
  await requireCf('registerProfile').main({ groupId: '墨尔本生鲜三号群' }, {});
  const r2 = await requireCf('login').main({}, {});
  assert.equal(r2.isRegistered, true);
  assert.equal(r2.userInfo.groupId, '墨尔本生鲜三号群');
});

test('registerProfile 空 groupId 拒', async () => {
  reset();
  shim.__setContext({ OPENID: 'u_new' });
  await requireCf('login').main({}, {});
  const r = await requireCf('registerProfile').main({}, {});
  assert.equal(r.code, 1);
  assert.match(r.message, /groupId/);
});

test('listProducts 按 tuanId 过滤', async () => {
  reset();
  const r = await requireCf('listProducts').main({ tuanId: 'tuan_001' }, {});
  assert.equal(r.code, 0);
  assert.equal(r.items.length, 2);
});

test('createOrder requirePay=true 返 pending_pay + stub payParams', async () => {
  reset({
    users: [{ _openid: 'u1', wechat: { nickname: 'A', avatar: 'https://x.png', sex: 0, country: null, province: null, city: null, language: null }, groupId: 'g1', registeredAt: new Date() }],
    addresses: [{ _id: 'addr1', _openid: 'u1', isDefault: true,
      recipient: 'A', phone: '0400', line1: '1 St', line2: '',
      suburb: 'M', state: 'VIC', postcode: '3000' }],
  });
  shim.__setContext({ OPENID: 'u1' });
  const r = await requireCf('createOrder').main({
    items: [{ tuanItemId: 'ti_p1_tuan_001', quantity: 2 }, { tuanItemId: 'ti_p2_tuan_001', quantity: 1 }],
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
    users: [{ _openid: 'u1', wechat: { nickname: 'A', avatar: 'https://x.png', sex: 0, country: null, province: null, city: null, language: null }, groupId: 'g1', registeredAt: new Date() }],
    addresses: [{ _id: 'addr1', _openid: 'u1', isDefault: true,
      recipient: 'A', phone: '0400', line1: '1 St', line2: '',
      suburb: 'M', state: 'VIC', postcode: '3000' }],
  });
  shim.__setContext({ OPENID: 'u1' });
  const r = await requireCf('createOrder').main({
    items: [{ tuanItemId: 'ti_p1_tuan_001', quantity: 1 }],
    addressId: 'addr1', requirePay: false,
  }, {});
  assert.equal(r.code, 0);
  assert.equal(r.order.status, 'paid');
  assert.equal(r.order.payStatus, 'paid');
  assert.equal(r.payParams, null);
});

test('createOrder 库存不足时拒绝', async () => {
  reset({
    users: [{ _openid: 'u1', wechat: { nickname: 'A', avatar: 'https://x.png', sex: 0, country: null, province: null, city: null, language: null }, groupId: 'g1', registeredAt: new Date() }],
    addresses: [{ _id: 'addr1', _openid: 'u1', isDefault: true,
      recipient: 'A', phone: '0400', line1: '1 St', line2: '',
      suburb: 'M', state: 'VIC', postcode: '3000' }],
  });
  shim.__setContext({ OPENID: 'u1' });
  // fast-path 库存预检在事务外,返 {code:6,message:'库存不足'} 而非 throw
  // (commit 51564c8 把 throw 改 return,避免售罄商品白白占事务锁)
  const r = await requireCf('createOrder').main({
    items: [{ tuanItemId: 'ti_p1_tuan_001', quantity: 999 }],
    addressId: 'addr1', requirePay: false,
  }, {});
  assert.equal(r.code, 6, `expected code 6, got ${JSON.stringify(r)}`);
  assert.match(r.message, /库存不足/);
});

test('cancelOrder 仅 pending_pay 可取消(paid 拒绝)', async () => {
  reset({
    users: [{ _openid: 'u1', wechat: { nickname: 'A', avatar: 'https://x.png', sex: 0, country: null, province: null, city: null, language: null }, groupId: 'g1', registeredAt: new Date() }],
    addresses: [{ _id: 'addr1', _openid: 'u1', isDefault: true,
      recipient: 'A', phone: '0400', line1: '1 St', line2: '',
      suburb: 'M', state: 'VIC', postcode: '3000' }],
  });
  shim.__setContext({ OPENID: 'u1' });

  // 先做一个 paid 订单
  const r1 = await requireCf('createOrder').main({
    items: [{ tuanItemId: 'ti_p1_tuan_001', quantity: 1 }],
    addressId: 'addr1', requirePay: false,
  }, {});
  const r2 = await requireCf('cancelOrder').main({ orderId: r1.order._id }, {});
  assert.equal(r2.code, 3);    // "仅待支付订单可取消"
});

test('createOrder userSnapshot 新形态 (nickname/avatar/groupId)', async () => {
  reset({
    users: [{ _openid: 'u1', wechat: { nickname: 'Luke', avatar: 'http://a.png', sex: 1, country: 'Australia', province: 'VIC', city: 'Melbourne', language: 'en' }, groupId: 'g1', registeredAt: new Date() }],
    addresses: [{ _id: 'addr1', _openid: 'u1', isDefault: true,
      recipient: 'A', phone: '0400', line1: '1 St', line2: '',
      suburb: 'M', state: 'VIC', postcode: '3000' }],
  });
  shim.__setContext({ OPENID: 'u1' });
  const r = await requireCf('createOrder').main({
    items: [{ tuanItemId: 'ti_p1_tuan_001', quantity: 1 }],
    addressId: 'addr1', requirePay: false,
  }, {});
  assert.equal(r.code, 0);
  assert.equal(r.order.userSnapshot.nickname, 'Luke');
  assert.equal(r.order.userSnapshot.avatar, 'http://a.png');
  assert.equal(r.order.userSnapshot.groupId, 'g1');
  assert.equal(r.order.userSnapshot.name, undefined, 'name should not be written');
  assert.equal(r.order.userSnapshot.phone, undefined, 'phone should not be written');
});

test('createOrder remark → notes.buyer', async () => {
  reset({
    users: [{ _openid: 'u1', wechat: { nickname: 'A' }, groupId: 'g1', registeredAt: new Date() }],
    addresses: [{ _id: 'addr1', _openid: 'u1', isDefault: true,
      recipient: 'A', phone: '0400', line1: '1 St', line2: '',
      suburb: 'M', state: 'VIC', postcode: '3000' }],
  });
  shim.__setContext({ OPENID: 'u1' });
  const r = await requireCf('createOrder').main({
    items: [{ tuanItemId: 'ti_p1_tuan_001', quantity: 1 }],
    addressId: 'addr1', remark: '留门卫', requirePay: false,
  }, {});
  assert.equal(r.code, 0);
  assert.deepEqual(r.order.notes, { buyer: '留门卫', seller: '' });
  assert.equal(r.order.remark, undefined, 'remark field no longer written');
});

test('createOrder 无 name/phone 也能下单 (OAuth 用户)', async () => {
  reset({
    users: [{ _openid: 'u1', wechat: { nickname: 'A' }, groupId: 'g1', registeredAt: new Date() }],
    addresses: [{ _id: 'addr1', _openid: 'u1', isDefault: true,
      recipient: 'A', phone: '0400', line1: '1 St', line2: '',
      suburb: 'M', state: 'VIC', postcode: '3000' }],
  });
  shim.__setContext({ OPENID: 'u1' });
  const r = await requireCf('createOrder').main({
    items: [{ tuanItemId: 'ti_p1_tuan_001', quantity: 1 }],
    addressId: 'addr1', requirePay: false,
  }, {});
  assert.equal(r.code, 0, `expected success, got: ${JSON.stringify(r)}`);
});

test('simulatePay 把 pending_pay 订单变 paid', async () => {
  reset({
    users: [{ _openid: 'u1', wechat: { nickname: 'A', avatar: 'https://x.png', sex: 0, country: null, province: null, city: null, language: null }, groupId: 'g1', registeredAt: new Date() }],
    addresses: [{ _id: 'addr1', _openid: 'u1', isDefault: true,
      recipient: 'A', phone: '0400', line1: '1 St', line2: '',
      suburb: 'M', state: 'VIC', postcode: '3000' }],
  });
  shim.__setContext({ OPENID: 'u1' });
  const r1 = await requireCf('createOrder').main({
    items: [{ tuanItemId: 'ti_p1_tuan_001', quantity: 1 }],
    addressId: 'addr1', requirePay: true,
  }, {});
  assert.equal(r1.order.payStatus, 'pending');
  const r2 = await requireCf('_dev/simulatePay').main({ orderId: r1.order._id }, {});
  assert.equal(r2.code, 0);
  assert.equal(r2.order.payStatus, 'paid');
});

test('queryHuepayOrder 已支付订单返 source=local 短路', async () => {
  reset({
    users: [{ _openid: 'u1', wechat: { nickname: 'A', avatar: 'https://x.png', sex: 0, country: null, province: null, city: null, language: null }, groupId: 'g1', registeredAt: new Date() }],
    addresses: [{ _id: 'addr1', _openid: 'u1', isDefault: true,
      recipient: 'A', phone: '0400', line1: '1 St', line2: '',
      suburb: 'M', state: 'VIC', postcode: '3000' }],
  });
  shim.__setContext({ OPENID: 'u1' });
  const r1 = await requireCf('createOrder').main({
    items: [{ tuanItemId: 'ti_p1_tuan_001', quantity: 1 }], addressId: 'addr1', requirePay: false,
  }, {});
  const q = await requireCf('queryHuepayOrder').main({ orderId: r1.order._id }, {});
  assert.equal(q.code, 0);
  assert.equal(q.paid, true);
  assert.equal(q.source, 'local');
});

test('payCallback 幂等(已 paid 订单重放被忽略)', async () => {
  reset({
    users: [{ _openid: 'u1', wechat: { nickname: 'A', avatar: 'https://x.png', sex: 0, country: null, province: null, city: null, language: null }, groupId: 'g1', registeredAt: new Date() }],
    addresses: [{ _id: 'addr1', _openid: 'u1', isDefault: true,
      recipient: 'A', phone: '0400', line1: '1 St', line2: '',
      suburb: 'M', state: 'VIC', postcode: '3000' }],
  });
  shim.__setContext({ OPENID: 'u1' });
  const r1 = await requireCf('createOrder').main({
    items: [{ tuanItemId: 'ti_p1_tuan_001', quantity: 1 }], addressId: 'addr1', requirePay: true,
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
  assert.ok(r.tuanItemId);
  // 读回来确认 trim + 落库(tuanId 模式返回 joined view,_id=tuanItemId)
  const list = await requireCf('_admin/productCRUD').main({ action: 'list', token, tuanId: 'tuan_001' });
  const found = list.items.find((p) => p.productId === r._id);
  assert.ok(found, 'new tuan_item should be in list');
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
  const found = list.items.find((p) => p.productId === r._id);
  assert.equal(found.section, null);
});

test('_admin/tuanItemCRUD update section 能清空(传空串→null)', async () => {
  const { hashPassword, sign } = require(path.join(cfRoot, '_lib/auth/jwt.js'));
  reset({
    admins: [{ _id: 'a1', username: 'admin', passwordHash: hashPassword('admin'), role: 'owner' }],
    products: [
      { _id: 'px', title: 'X', coverFileId: '', imageFileIds: [], categoryIds: [], description: '' },
    ],
    tuan_items: [
      { _id: 'ti_px', tuanId: 'tuan_001', productId: 'px', price: 100, stock: 10, sold: 0, sort: 1, section: '旧分组', participantCount: 0 },
    ],
  });
  const token = sign({ sub: 'a1', role: 'owner' }, 'mogu_express_dev_secret_REPLACE_ME_IN_PROD');
  shim.__setContext({ OPENID: null });
  const r = await requireCf('_admin/tuanItemCRUD').main({
    action: 'update', token, id: 'ti_px', patch: { section: '' },
  });
  assert.equal(r.code, 0);
  const list = await requireCf('_admin/tuanItemCRUD').main({ action: 'list', token, tuanId: 'tuan_001' });
  const found = list.items.find((p) => p._id === 'ti_px');
  assert.equal(found.section, null);
});

test('_admin/tuanItemCRUD copyFromTuan 批量复制实例,sold 重置', async () => {
  const { hashPassword, sign } = require(path.join(cfRoot, '_lib/auth/jwt.js'));
  reset({
    admins: [{ _id: 'a1', username: 'admin', passwordHash: hashPassword('admin'), role: 'owner' }],
    tuans: [
      { _id: 'src', status: 'closed', endAt: new Date(), title: 'Src', productCount: 2, createdAt: new Date() },
      { _id: 'dst', status: 'draft',  endAt: new Date(Date.now() + 86400e3), title: 'Dst', productCount: 0, createdAt: new Date() },
    ],
    products: [
      { _id: 'px', title: 'X', coverFileId: '', imageFileIds: [], categoryIds: [], description: '' },
      { _id: 'py', title: 'Y', coverFileId: '', imageFileIds: [], categoryIds: [], description: '' },
    ],
    tuan_items: [
      { _id: 'ti_src_px', tuanId: 'src', productId: 'px', price: 100, stock: 10, sold: 7, sort: 1, section: 'A', participantCount: 5 },
      { _id: 'ti_src_py', tuanId: 'src', productId: 'py', price: 200, stock: 20, sold: 3, sort: 2, section: 'B', participantCount: 2 },
    ],
  });
  const token = sign({ sub: 'a1', role: 'owner' }, 'mogu_express_dev_secret_REPLACE_ME_IN_PROD');
  shim.__setContext({ OPENID: null });
  const r = await requireCf('_admin/tuanItemCRUD').main({
    action: 'copyFromTuan', token, sourceTuanId: 'src', targetTuanId: 'dst',
  });
  assert.equal(r.code, 0);
  assert.equal(r.copied, 2);
  assert.equal(r.skipped, 0);
  const list = await requireCf('_admin/tuanItemCRUD').main({ action: 'list', token, tuanId: 'dst' });
  assert.equal(list.items.length, 2);
  // sold + participantCount 重置
  for (const it of list.items) {
    assert.equal(it.sold, 0);
    assert.equal(it.participantCount, 0);
  }
  // price/section 克隆
  const copiedPx = list.items.find((i) => i.productId === 'px');
  assert.equal(copiedPx.price, 100);
  assert.equal(copiedPx.section, 'A');
});

test('_admin/tuanItemCRUD copyFromTuan 跳过已有同 productId', async () => {
  const { hashPassword, sign } = require(path.join(cfRoot, '_lib/auth/jwt.js'));
  reset({
    admins: [{ _id: 'a1', username: 'admin', passwordHash: hashPassword('admin'), role: 'owner' }],
    tuans: [
      { _id: 'src', status: 'closed', endAt: new Date(), title: 'Src', productCount: 2, createdAt: new Date() },
      { _id: 'dst', status: 'draft',  endAt: new Date(Date.now() + 86400e3), title: 'Dst', productCount: 1, createdAt: new Date() },
    ],
    products: [
      { _id: 'px', title: 'X', coverFileId: '', imageFileIds: [], categoryIds: [], description: '' },
      { _id: 'py', title: 'Y', coverFileId: '', imageFileIds: [], categoryIds: [], description: '' },
    ],
    tuan_items: [
      { _id: 'ti_src_px', tuanId: 'src', productId: 'px', price: 100, stock: 10, sold: 0, sort: 1, section: 'A', participantCount: 0 },
      { _id: 'ti_src_py', tuanId: 'src', productId: 'py', price: 200, stock: 20, sold: 0, sort: 2, section: 'B', participantCount: 0 },
      // dst 已有 px
      { _id: 'ti_dst_px', tuanId: 'dst', productId: 'px', price: 150, stock: 5, sold: 0, sort: 5, section: 'X', participantCount: 0 },
    ],
  });
  const token = sign({ sub: 'a1', role: 'owner' }, 'mogu_express_dev_secret_REPLACE_ME_IN_PROD');
  shim.__setContext({ OPENID: null });
  const r = await requireCf('_admin/tuanItemCRUD').main({
    action: 'copyFromTuan', token, sourceTuanId: 'src', targetTuanId: 'dst',
  });
  assert.equal(r.code, 0);
  assert.equal(r.copied, 1);     // 只复制 py
  assert.equal(r.skipped, 1);    // px 已存在
  // dst 的 px 保持原价 150
  const dst = await requireCf('_admin/tuanItemCRUD').main({ action: 'list', token, tuanId: 'dst' });
  const px = dst.items.find((i) => i.productId === 'px');
  assert.equal(px.price, 150);
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

// ---- uploadImage 测试 ----
// 注入一个 in-memory S3 storage,避免跑真的 MinIO
function installMockS3() {
  const uploaded = [];
  shim.__setS3Storage({
    async putObject(key, buffer, contentType) {
      uploaded.push({ key, size: buffer.length, contentType });
      return { key, url: `http://mock.local/images/${key}` };
    },
  });
  return uploaded;
}

// 1x1 PNG(真实 magic bytes)base64
const PNG_1x1_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

test('_admin/uploadImage 成功上传 PNG', async () => {
  const { hashPassword, sign } = require(path.join(cfRoot, '_lib/auth/jwt.js'));
  reset({
    admins: [{ _id: 'a1', username: 'admin', passwordHash: hashPassword('admin'), role: 'owner' }],
  });
  const uploaded = installMockS3();
  const token = sign({ sub: 'a1', role: 'owner' }, 'mogu_express_dev_secret_REPLACE_ME_IN_PROD');
  shim.__setContext({ OPENID: null });
  const r = await requireCf('_admin/uploadImage').main({
    token,
    fileBase64: PNG_1x1_BASE64,
    mimeType: 'image/png',
    fileName: 'test.png',
    purpose: 'tuan_cover',
  });
  assert.equal(r.code, 0);
  assert.match(r.url, /^http:\/\/mock\.local\/images\/tuan_cover\/\d{6}\/[a-f0-9]+\.png$/);
  assert.equal(uploaded.length, 1);
  assert.equal(uploaded[0].contentType, 'image/png');
});

test('_admin/uploadImage 拒绝非白名单 MIME', async () => {
  const { hashPassword, sign } = require(path.join(cfRoot, '_lib/auth/jwt.js'));
  reset({
    admins: [{ _id: 'a1', username: 'admin', passwordHash: hashPassword('admin'), role: 'owner' }],
  });
  installMockS3();
  const token = sign({ sub: 'a1', role: 'owner' }, 'mogu_express_dev_secret_REPLACE_ME_IN_PROD');
  shim.__setContext({ OPENID: null });
  const r = await requireCf('_admin/uploadImage').main({
    token,
    fileBase64: Buffer.from('%PDF-1.4').toString('base64'),
    mimeType: 'application/pdf',
    fileName: 'evil.pdf',
    purpose: 'tuan_cover',
  });
  assert.notEqual(r.code, 0);
});

test('_admin/uploadImage 拒绝超过 3MB', async () => {
  const { hashPassword, sign } = require(path.join(cfRoot, '_lib/auth/jwt.js'));
  reset({
    admins: [{ _id: 'a1', username: 'admin', passwordHash: hashPassword('admin'), role: 'owner' }],
  });
  installMockS3();
  const token = sign({ sub: 'a1', role: 'owner' }, 'mogu_express_dev_secret_REPLACE_ME_IN_PROD');
  shim.__setContext({ OPENID: null });
  const bigBuf = Buffer.alloc(4 * 1024 * 1024, 0xff);
  // 前 4 字节伪装 PNG 头,让它过 magic bytes,被 size 检查拦
  bigBuf[0] = 0x89; bigBuf[1] = 0x50; bigBuf[2] = 0x4e; bigBuf[3] = 0x47;
  const r = await requireCf('_admin/uploadImage').main({
    token,
    fileBase64: bigBuf.toString('base64'),
    mimeType: 'image/png',
    fileName: 'big.png',
    purpose: 'product_image',
  });
  assert.equal(r.code, 5);
});

// ── 退款功能 ──

const REFUND_TUAN = { _id: 'rt', status: 'on_sale', endAt: new Date(Date.now() + 86400e3), title: 'RT', productCount: 1, createdAt: new Date() };
const REFUND_TUAN_ITEM = { _id: 'rti_1', tuanId: 'rt', productId: 'rp', price: 500, stock: 10, sold: 5, sort: 1, section: null, participantCount: 3 };
const REFUND_ORDER_PAID = {
  _id: 'ro1', orderNo: 'RO001', outTradeNo: 'RTRADE1', _openid: 'u1',
  userSnapshot: { name: '退款测试', phone: '0400111222' },
  items: [{ tuanItemId: 'rti_1', productId: 'rp', tuanId: 'rt', title: '测试商品', price: 500, quantity: 2, subtotal: 1000, coverFileId: '' }],
  amount: 1000, shipping: { recipient: '退款测试', phone: '0400111222', line1: '1 St', line2: '', suburb: 'M', state: 'VIC', postcode: '3000' },
  remark: '', status: 'paid', payStatus: 'paid',
  paidAt: new Date(), createdAt: new Date(), updatedAt: new Date(),
};

test('requestRefund 成功:paid 订单 + on_sale 团 → refund_requested', async () => {
  reset({
    tuans: [REFUND_TUAN],
    tuan_items: [REFUND_TUAN_ITEM],
    orders: [REFUND_ORDER_PAID],
  });
  shim.__setContext({ OPENID: 'u1' });
  const r = await requireCf('requestRefund').main({ orderId: 'ro1' });
  assert.equal(r.code, 0, r.message);
  // 读回确认状态
  const snap = await shim.database().collection('orders').doc('ro1').get();
  assert.equal(snap.data.status, 'refund_requested');
});

test('requestRefund 越权:非订单拥有者 → 403', async () => {
  reset({
    tuans: [REFUND_TUAN],
    tuan_items: [REFUND_TUAN_ITEM],
    orders: [REFUND_ORDER_PAID],
  });
  shim.__setContext({ OPENID: 'u2' });
  const r = await requireCf('requestRefund').main({ orderId: 'ro1' });
  assert.equal(r.code, 403);
});

test('requestRefund 状态错误:shipped 订单 → code 3', async () => {
  const shipped = { ...REFUND_ORDER_PAID, _id: 'ro2', status: 'shipped' };
  reset({
    tuans: [REFUND_TUAN],
    tuan_items: [REFUND_TUAN_ITEM],
    orders: [shipped],
  });
  shim.__setContext({ OPENID: 'u1' });
  const r = await requireCf('requestRefund').main({ orderId: 'ro2' });
  assert.equal(r.code, 3);
});

test('requestRefund 团已关闭:tuan.status=closed → code 5', async () => {
  const closedTuan = { ...REFUND_TUAN, status: 'closed' };
  reset({
    tuans: [closedTuan],
    tuan_items: [REFUND_TUAN_ITEM],
    orders: [REFUND_ORDER_PAID],
  });
  shim.__setContext({ OPENID: 'u1' });
  const r = await requireCf('requestRefund').main({ orderId: 'ro1' });
  assert.equal(r.code, 5);
});

test('processRefund approve:refund_requested → refunded + sold 回滚', async () => {
  const { hashPassword, sign } = require(path.join(cfRoot, '_lib/auth/jwt.js'));
  const refundReqOrder = { ...REFUND_ORDER_PAID, _id: 'ro3', status: 'refund_requested', refundRequestedAt: new Date() };
  reset({
    admins: [{ _id: 'a1', username: 'admin', passwordHash: hashPassword('admin'), role: 'owner' }],
    tuans: [REFUND_TUAN],
    tuan_items: [{ ...REFUND_TUAN_ITEM, sold: 5 }],
    orders: [refundReqOrder],
  });
  const token = sign({ sub: 'a1', role: 'owner' }, 'mogu_express_dev_secret_REPLACE_ME_IN_PROD');
  shim.__setContext({ OPENID: null });
  const r = await requireCf('_admin/processRefund').main({ token, orderId: 'ro3', action: 'approve' });
  assert.equal(r.code, 0, r.message);
  // 订单状态变 refunded
  const db = shim.database();
  const oSnap = await db.collection('orders').doc('ro3').get();
  assert.equal(oSnap.data.status, 'refunded');
  assert.equal(oSnap.data.payStatus, 'refunded');
  assert.ok(oSnap.data.refundId);
  // sold 回滚:5 - 2 = 3
  const tiSnap = await db.collection('tuan_items').doc('rti_1').get();
  assert.equal(tiSnap.data.sold, 3);
});

test('processRefund reject:refund_requested → paid + 记录原因', async () => {
  const { hashPassword, sign } = require(path.join(cfRoot, '_lib/auth/jwt.js'));
  const refundReqOrder = { ...REFUND_ORDER_PAID, _id: 'ro4', status: 'refund_requested', refundRequestedAt: new Date() };
  reset({
    admins: [{ _id: 'a1', username: 'admin', passwordHash: hashPassword('admin'), role: 'owner' }],
    tuans: [REFUND_TUAN],
    tuan_items: [REFUND_TUAN_ITEM],
    orders: [refundReqOrder],
  });
  const token = sign({ sub: 'a1', role: 'owner' }, 'mogu_express_dev_secret_REPLACE_ME_IN_PROD');
  shim.__setContext({ OPENID: null });
  const r = await requireCf('_admin/processRefund').main({ token, orderId: 'ro4', action: 'reject', rejectReason: '商品已备货' });
  assert.equal(r.code, 0, r.message);
  const db = shim.database();
  const oSnap = await db.collection('orders').doc('ro4').get();
  assert.equal(oSnap.data.status, 'paid');
  assert.equal(oSnap.data.refundRejectReason, '商品已备货');
});

test('_admin/updateTracking 写入 order.tracking', async () => {
  reset({
    orders: [{
      _id: 'order_x', _openid: 'u1', orderNo: 'MG_X',
      items: [], amount: 0, status: 'paid', payStatus: 'paid',
      shipping: {}, createdAt: new Date(),
    }],
    admins: [{ openid: 'admin1', username: 'admin' }],
  });
  shim.__setContext({ OPENID: 'admin1' });
  const r = await requireCf('_admin/updateTracking').main({
    orderId: 'order_x',
    weight: 2.5,
    courierName: '顺丰',
    courierNo: 'SF1234567890',
  }, {});
  assert.equal(r.code, 0);
  // 验证 mongo 写入
  const orderRes = await shim.database().collection('orders').doc('order_x').get();
  assert.equal(orderRes.data.tracking.weight, 2.5);
  assert.equal(orderRes.data.tracking.courierName, '顺丰');
  assert.equal(orderRes.data.tracking.courierNo, 'SF1234567890');
});

test('_admin/updateTracking 非 admin 拒', async () => {
  reset({
    orders: [{ _id: 'order_x', _openid: 'u1', orderNo: 'MG_X', items: [], amount: 0, status: 'paid', payStatus: 'paid', shipping: {}, createdAt: new Date() }],
    admins: [],
  });
  shim.__setContext({ OPENID: 'regular_user' });
  const r = await requireCf('_admin/updateTracking').main({
    orderId: 'order_x', weight: 1, courierName: '顺丰', courierNo: 'X',
  }, {});
  assert.equal(r.code, 403);
});

test('_admin/updateOrderNotes 写入 order.notes.seller', async () => {
  reset({
    orders: [{
      _id: 'order_x', _openid: 'u1', orderNo: 'MG_X',
      items: [], amount: 0, status: 'paid', payStatus: 'paid',
      shipping: {}, notes: { buyer: '原买家备注', seller: '' },
      createdAt: new Date(),
    }],
    admins: [{ openid: 'admin1', username: 'admin' }],
  });
  shim.__setContext({ OPENID: 'admin1' });
  const r = await requireCf('_admin/updateOrderNotes').main({
    orderId: 'order_x',
    sellerNote: '明天发货,VIP',
  }, {});
  assert.equal(r.code, 0);
  const orderRes = await shim.database().collection('orders').doc('order_x').get();
  assert.equal(orderRes.data.notes.seller, '明天发货,VIP');
  assert.equal(orderRes.data.notes.buyer, '原买家备注', 'buyer note unchanged');
});

test('_admin/updateOrderNotes 超 500 字拒', async () => {
  reset({
    orders: [{ _id: 'order_x', _openid: 'u1', orderNo: 'MG_X', items: [], amount: 0, status: 'paid', payStatus: 'paid', shipping: {}, createdAt: new Date() }],
    admins: [{ openid: 'admin1', username: 'admin' }],
  });
  shim.__setContext({ OPENID: 'admin1' });
  const longText = 'x'.repeat(501);
  const r = await requireCf('_admin/updateOrderNotes').main({
    orderId: 'order_x', sellerNote: longText,
  }, {});
  assert.equal(r.code, 2);
});

// ---- 5. Run ----
console.log(`\nmogu_express test-shim — ${tests.length} tests\n`);
runAll().catch((err) => {
  console.error('\n❌ test runner crashed:', err);
  process.exit(1);
});
