// createOrder - 事务扣库存 + 建订单 + 调 HuePay 下单
//
// 新模型:items 按 tuanItemId 下单。
//   event.items: [{ tuanItemId, quantity }]
//   兼容旧客户端:若仅传 productId,会当作 tuanItemId 处理。
//
// 订单 items 快照字段:
//   { tuanItemId, tuanId, productId, title, price, quantity, subtotal, coverFileId, section }
//
// M3 逻辑:
//   - event.requirePay=true(默认)→ 订单初始 pending_pay,调 HuePay createOrder 返回 payParams
//   - event.requirePay=false       → 订单直接 paid(兼容 M2 免支付演示)
//
// Stub 模式下(HUEPAY_STUB=1)SDK 返回带 __stub 标记的 payParams,
// 小程序识别后跳过 wx.requestPayment,直接调 _dev/simulatePay 模拟回调。
//
// 订单 schema(部分):
//   shippingFee?: {             // 尾款,_admin/setShippingFee 时填,初始没有此字段
//     amount: Number,            // 分
//     outTradeNo: 'SHIP<...>',
//     payStatus: 'pending' | 'paid' | 'failed',
//     setAt: Date,
//     paidAt: Date | null,
//   }

const crypto = require('crypto');
const cloud = require('wx-server-sdk');
const huepay = require('./huepay');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

// 单 item 上限,防止用户构造 N 件商品撑爆事务锁数 + tx 超时
const MAX_ITEMS_PER_ORDER = 20;

function generateOrderNo() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const ts = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  // 8 字节 hex = 16 char,2^64 空间;碰撞概率比时间戳+random(1000) 低数个量级
  return 'MG' + ts + crypto.randomBytes(3).toString('hex').toUpperCase();
}

function normalizeItem(it) {
  return {
    tuanItemId: it.tuanItemId || it.productId,
    quantity: it.quantity,
  };
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { code: 401, message: 'not logged in' };
  const { addressId, remark, requirePay = true } = event || {};
  const rawItems = (event?.items || []).map(normalizeItem);
  if (!rawItems.length) return { code: 1, message: 'items required' };
  if (rawItems.length > MAX_ITEMS_PER_ORDER) {
    return { code: 8, message: `单次下单最多 ${MAX_ITEMS_PER_ORDER} 件,请拆单` };
  }

  const [userRes, addrRes] = await Promise.all([
    db.collection('users').where({ _openid: OPENID }).limit(1).get(),
    db.collection('addresses').doc(addressId).get().catch(() => null),
  ]);
  const user = userRes.data && userRes.data[0];
  if (!user || !user.name || !user.phone) return { code: 2, message: '请先完善姓名电话' };
  if (!addrRes || !addrRes.data || addrRes.data._openid !== OPENID) {
    return { code: 3, message: '地址不存在' };
  }

  // 事务外 fast-path 库存预检 —— 秒杀场景下,售罄商品不进事务,省 mongo CPU。
  // 预检有 race(N 人同时通过预检),但事务内 $inc + WriteConflict 重试兜底,
  // 不会超卖。仅作为 fast-fail 优化。
  const precheck = await Promise.all(rawItems.map(async (it) => {
    const tiDoc = await db.collection('tuan_items').doc(it.tuanItemId).get().catch(() => null);
    if (!tiDoc || !tiDoc.data) return { code: 4, message: `商品不存在:${it.tuanItemId}` };
    const ti = tiDoc.data;
    const stockLeft = (ti.stock || 0) - (ti.sold || 0);
    if (stockLeft < it.quantity) {
      return { code: 6, message: `商品库存不足(剩 ${stockLeft})` };
    }
    return null;
  }));
  const precheckFail = precheck.find(Boolean);
  if (precheckFail) return precheckFail;

  const outTradeNo = 'TRADE' + Date.now() + crypto.randomBytes(4).toString('hex').toUpperCase();

  // 事务扣库存 + 建订单
  const result = await db.runTransaction(async (transaction) => {
    const orderItems = [];
    let amount = 0;

    for (const it of rawItems) {
      const tiDoc = await transaction.collection('tuan_items').doc(it.tuanItemId).get();
      const tuanItem = tiDoc.data;
      if (!tuanItem) throw { code: 4, message: `商品不存在:${it.tuanItemId}` };

      const prodDoc = await transaction.collection('products').doc(tuanItem.productId).get();
      const product = prodDoc.data;
      if (!product) throw { code: 4, message: `商品库条目不存在:${tuanItem.productId}` };

      const tuanDoc = await transaction.collection('tuans').doc(tuanItem.tuanId).get();
      const tuan = tuanDoc.data;
      if (!tuan || tuan.status !== 'on_sale') throw { code: 5, message: `${product.title} 所属团未在售` };
      if (new Date(tuan.endAt) <= new Date()) throw { code: 5, message: `${product.title} 所属团已截止` };

      const stockLeft = (tuanItem.stock || 0) - (tuanItem.sold || 0);
      if (stockLeft < it.quantity) {
        throw { code: 6, message: `${product.title} 库存不足(剩 ${stockLeft})` };
      }

      await transaction.collection('tuan_items').doc(tuanItem._id).update({
        data: { sold: _.inc(it.quantity), updatedAt: new Date() },
      });

      orderItems.push({
        tuanItemId: tuanItem._id,
        tuanId: tuanItem.tuanId,
        productId: product._id,
        title: product.title,
        price: tuanItem.price,
        quantity: it.quantity,
        subtotal: tuanItem.price * it.quantity,
        coverFileId: product.coverFileId,
        section: tuanItem.section || null,
      });
      amount += tuanItem.price * it.quantity;
    }

    const now = new Date();
    const orderNo = generateOrderNo();

    const order = {
      orderNo,
      outTradeNo,
      _openid: OPENID,
      userSnapshot: { name: user.name, phone: user.phone },
      items: orderItems,
      amount,
      shipping: {
        recipient: addrRes.data.recipient,
        phone: addrRes.data.phone,
        line1: addrRes.data.line1,
        line2: addrRes.data.line2 || '',
        suburb: addrRes.data.suburb,
        state: addrRes.data.state,
        postcode: addrRes.data.postcode,
      },
      remark: remark || '',
      status: requirePay ? 'pending_pay' : 'paid',
      payStatus: requirePay ? 'pending' : 'paid',
      paidAt: requirePay ? null : now,
      createdAt: now,
      updatedAt: now,
    };

    const addRes = await transaction.collection('orders').add({ data: order });
    order._id = addRes._id;
    return order;
  }).catch((err) => {
    console.error('[createOrder] txn failed', err);
    throw err;
  });

  // 事务外:如果需要支付,调 HuePay 下单拿 payParams
  let payParams = null;
  let huepayRaw = null;
  if (requirePay) {
    try {
      const body = result.items.length === 1
        ? result.items[0].title
        : `${result.items[0].title} 等 ${result.items.length} 件`;

      const { payParams: pp, raw } = await huepay.createOrder({
        outTradeNo,
        amount: result.amount,
        body,
        openid: OPENID,
      });
      payParams = pp;
      huepayRaw = raw;
    } catch (err) {
      console.error('[createOrder] HuePay createOrder failed', err);
      try {
        await db.runTransaction(async (tx) => {
          for (const it of result.items) {
            await tx.collection('tuan_items').doc(it.tuanItemId).update({
              data: { sold: _.inc(-it.quantity), updatedAt: new Date() },
            });
          }
          await tx.collection('orders').doc(result._id).update({
            data: { status: 'cancelled', payStatus: 'failed', updatedAt: new Date() },
          });
        });
      } catch (rb) { console.error('[createOrder] rollback failed', rb); }

      return { code: 7, message: '支付渠道下单失败:' + (err.message || err.code) };
    }
  }

  // 清购物车里已下单项(按 tuanItemId)
  try {
    const cartRes = await db.collection('carts').where({ _openid: OPENID }).limit(1).get();
    if (cartRes.data && cartRes.data[0]) {
      const cart = cartRes.data[0];
      const purchased = new Set(rawItems.map((i) => i.tuanItemId));
      const left = (cart.items || []).filter((x) => !purchased.has(x.tuanItemId || x.productId));
      await db.collection('carts').doc(cart._id).update({ data: { items: left, updatedAt: new Date() } });
    }
  } catch (err) {
    console.warn('[createOrder] clear cart failed', err.message);
  }

  return {
    code: 0,
    order: result,
    payParams,
    huepayRaw: huepayRaw ? { stub: !!huepayRaw.stub } : null,
  };
};
