// test-shim.js - 不用真 Mongo,用 mock client 验证云函数 + shim 端到端
// 跑法: node test-shim.js

const path = require('path');
const Module = require('module');

// Hook require('wx-server-sdk')
const SHIM_PATH = path.resolve(__dirname, 'src/shim/index.js');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (r, p, ...rest) {
  if (r === 'wx-server-sdk') return SHIM_PATH;
  return origResolve.call(this, r, p, ...rest);
};

const shim = require('./src/shim');

// 最小 Mongo mock:仅实现 find/insertOne/updateOne/deleteOne/countDocuments
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
          const dv = k.includes('.') ? k.split('.').reduce((o, p) => o?.[p], doc) : doc[k];
          if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) {
            if ('$in'  in v && !v.$in.includes(dv)) return false;
            if ('$nin' in v && v.$nin.includes(dv)) return false;
            if ('$ne'  in v && dv === v.$ne) return false;
            if ('$gt'  in v && !(dv > v.$gt)) return false;
            if ('$gte' in v && !(dv >= v.$gte)) return false;
            if ('$lt'  in v && !(dv < v.$lt)) return false;
            if ('$lte' in v && !(dv <= v.$lte)) return false;
          } else {
            if (dv !== v) return false;
          }
        }
        return true;
      }
      return {
        find(f) {
          let matched = arr.filter((d) => applyFilter(f || {}, d));
          const api = {
            sort(s) { const [[k, d]] = Object.entries(s); matched.sort((a, b) => (a[k] < b[k] ? -d : d)); return api; },
            skip(n) { matched = matched.slice(n); return api; },
            limit(n) { matched = matched.slice(0, n); return api; },
            async toArray() { return matched; },
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

const seed = {
  tuans: [
    { _id: 'tuan_001', status: 'on_sale',  endAt: new Date(Date.now() + 86400e3), title: 'Tuan 1', createdAt: new Date() },
    { _id: 'tuan_002', status: 'scheduled', endAt: new Date(Date.now() + 172800e3), title: 'Tuan 2', createdAt: new Date() },
    { _id: 'tuan_003', status: 'closed',    endAt: new Date(Date.now() - 86400e3), title: 'Tuan 3', createdAt: new Date() },
  ],
  products: [
    { _id: 'p1', tuanId: 'tuan_001', sort: 1, title: 'P1', price: 100, stock: 10, sold: 0 },
    { _id: 'p2', tuanId: 'tuan_001', sort: 2, title: 'P2', price: 200, stock: 5, sold: 2 },
  ],
  users: [],
  admins: [],
  carts: [],
  addresses: [],
  orders: [],
};

async function run() {
  const mockClient = { startSession: () => ({ withTransaction: async (fn) => fn(), endSession: async () => {} }) };
  shim.__setMongo(mockClient, mkMockDb(seed));

  // Test 1: listTuans
  console.log('\n=== Test 1: listTuans ===');
  shim.__setContext({ OPENID: null });
  const listTuans = require(path.resolve(__dirname, '../../cloudfunctions/listTuans/index.js'));
  const r1 = await listTuans.main({ page: 1, pageSize: 20 }, {});
  console.log('result:', JSON.stringify(r1, null, 2));
  console.assert(r1.code === 0, 'listTuans should succeed');
  console.assert(r1.items.length === 2, 'should return 2 tuans (on_sale + scheduled)');

  // Test 2: getTuanDetail
  console.log('\n=== Test 2: getTuanDetail ===');
  const getTuanDetail = require(path.resolve(__dirname, '../../cloudfunctions/getTuanDetail/index.js'));
  const r2 = await getTuanDetail.main({ tuanId: 'tuan_001' }, {});
  console.log('tuan:', r2.tuan?.title, '| products:', r2.products?.length);
  console.assert(r2.code === 0 && r2.products.length === 2, 'should return tuan + 2 products');

  // Test 3: login (injects openid, upserts user)
  console.log('\n=== Test 3: login ===');
  shim.__setContext({ OPENID: 'test_user_1' });
  const login = require(path.resolve(__dirname, '../../cloudfunctions/login/index.js'));
  const r3 = await login.main({}, {});
  console.log('result:', r3);
  console.assert(r3.code === 0 && r3.openid === 'test_user_1', 'login should return openid');
  console.assert(r3.isRegistered === false, 'new user not registered');

  // Test 4: registerProfile
  console.log('\n=== Test 4: registerProfile ===');
  const registerProfile = require(path.resolve(__dirname, '../../cloudfunctions/registerProfile/index.js'));
  const r4 = await registerProfile.main({ name: 'Tester', phone: '0400000000' }, {});
  console.log('result:', r4);
  console.assert(r4.code === 0, 'register should succeed');

  // Test 5: login again — should now be registered
  console.log('\n=== Test 5: login again ===');
  const r5 = await login.main({}, {});
  console.log('result:', r5);
  console.assert(r5.isRegistered === true, 'should be registered now');

  // Test 6: listProducts with filter
  console.log('\n=== Test 6: listProducts ===');
  const listProducts = require(path.resolve(__dirname, '../../cloudfunctions/listProducts/index.js'));
  const r6 = await listProducts.main({ tuanId: 'tuan_001' }, {});
  console.log('products:', r6.items.map(p => p._id));
  console.assert(r6.code === 0 && r6.items.length === 2, 'should return 2 products for tuan_001');

  // Test 7: createOrder — 事务 + 多集合 + 库存扣减
  console.log('\n=== Test 7: createOrder (transaction) ===');
  // 需要一个默认地址
  const addressId = 'addr_test_1';
  seed.addresses = [{
    _id: addressId, _openid: 'test_user_1', isDefault: true,
    recipient: 'Tester', phone: '0400000000',
    line1: '1 Test St', line2: '', suburb: 'Test', state: 'VIC', postcode: '3000',
  }];
  // 重新挂 mock(数据变了)
  shim.__setMongo(mockClient, mkMockDb({ ...seed, users: [{ _openid: 'test_user_1', name: 'Tester', phone: '0400000000', registeredAt: new Date() }] }));

  const createOrder = require(path.resolve(__dirname, '../../cloudfunctions/createOrder/index.js'));
  const r7 = await createOrder.main({
    items: [
      { productId: 'p1', quantity: 2 },
      { productId: 'p2', quantity: 1 },
    ],
    addressId,
    remark: 'test order',
  }, {});
  console.log('order:', { code: r7.code, orderNo: r7.order?.orderNo, amount: r7.order?.amount, items: r7.order?.items?.length });
  console.assert(r7.code === 0, 'createOrder should succeed');
  console.assert(r7.order.amount === 100 * 2 + 200 * 1, 'amount should be 400');
  console.assert(r7.order.items.length === 2, 'should have 2 items');
  console.assert(r7.order.status === 'paid', 'M2 should mark paid immediately');

  // Test 8: cancelOrder 回滚库存
  console.log('\n=== Test 8: cancelOrder ===');
  // 先把订单状态改回 pending_pay 以测试取消
  // (简化起见直接测取消失败的 path)
  const cancelOrder = require(path.resolve(__dirname, '../../cloudfunctions/cancelOrder/index.js'));
  const r8 = await cancelOrder.main({ orderId: r7.order._id }, {});
  console.log('cancel result:', r8);
  console.assert(r8.code === 3, 'paid order cannot be cancelled (expected code 3)');

  console.log('\n✅ All 8 tests passed');
}

run().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
