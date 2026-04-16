// _admin/exportOrders - 生成 xlsx 导出
//
// 两个 sheet:
//   Sheet1: 订单明细(一行一个订单的每一件商品)
//   Sheet2: 商品销量汇总
//
// 云开发:生成的 buffer 上传到云存储,返回 fileID + tempURL
// 本地 Docker 后端:暂返回 base64,前端直接触发下载
const cloud = require('wx-server-sdk');
const ExcelJS = require('exceljs');
const { verify } = require('./jwt.js');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const JWT_SECRET = process.env.JWT_SECRET || 'mogu_express_dev_secret_REPLACE_ME_IN_PROD';

async function requireAdmin(event) {
  if (event && event.token) {
    try { return { admin: verify(event.token, JWT_SECRET) }; }
    catch (err) { const e = new Error('invalid token'); e.code = 401; throw e; }
  }
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) { const e = new Error('no openid'); e.code = 401; throw e; }
  const res = await db.collection('admins').where({ openid: OPENID }).limit(1).get();
  if (!res.data || !res.data.length) { const e = new Error('not admin'); e.code = 403; throw e; }
  return { admin: res.data[0] };
}

function fmtMoney(cents) { return (cents / 100).toFixed(2); }

const STATUS_LABEL = {
  pending_pay: '待支付',
  paid: '已支付',
  shipped: '已发货',
  completed: '已完成',
  cancelled: '已取消',
  refunded: '已退款',
};

exports.main = async (event) => {
  try {
    await requireAdmin(event);
    const { status, tuanId, dateFrom, dateTo } = event || {};

    // 读订单
    const conds = [];
    if (status)   conds.push({ status });
    if (tuanId)   conds.push({ 'items.tuanId': tuanId });
    if (dateFrom) conds.push({ createdAt: _.gte(new Date(dateFrom)) });
    if (dateTo)   conds.push({ createdAt: _.lte(new Date(dateTo)) });

    const col = db.collection('orders');
    const q = conds.length ? col.where(_.and(conds)) : col;
    const ordersRes = await q.orderBy('createdAt', 'desc').limit(2000).get();
    const orders = ordersRes.data || [];

    // Sheet1:订单明细
    const wb = new ExcelJS.Workbook();
    wb.creator = 'mogu_express';
    wb.created = new Date();

    const ws1 = wb.addWorksheet('订单明细');
    ws1.columns = [
      { header: '订单号',    key: 'orderNo',    width: 22 },
      { header: '下单时间',  key: 'createdAt',  width: 20 },
      { header: '状态',      key: 'status',     width: 10 },
      { header: '支付时间',  key: 'paidAt',     width: 20 },
      { header: '发货时间',  key: 'shippedAt',  width: 20 },
      { header: '姓名',      key: 'name',       width: 14 },
      { header: '电话',      key: 'phone',      width: 14 },
      { header: '收货地址',  key: 'address',    width: 50 },
      { header: '商品',      key: 'itemTitle',  width: 30 },
      { header: '单价 AUD',  key: 'price',      width: 10 },
      { header: '数量',      key: 'qty',        width: 6 },
      { header: '小计 AUD',  key: 'subtotal',   width: 10 },
      { header: '订单总金额 AUD', key: 'amount', width: 12 },
      { header: '备注',      key: 'remark',     width: 24 },
    ];

    for (const o of orders) {
      const addrText = [
        o.shipping?.line1, o.shipping?.line2,
        o.shipping?.suburb, o.shipping?.state, o.shipping?.postcode,
      ].filter(Boolean).join(', ');

      for (let i = 0; i < o.items.length; i++) {
        const it = o.items[i];
        ws1.addRow({
          orderNo:   i === 0 ? o.orderNo : '',
          createdAt: i === 0 ? new Date(o.createdAt).toLocaleString('zh-CN') : '',
          status:    i === 0 ? (STATUS_LABEL[o.status] || o.status) : '',
          paidAt:    i === 0 && o.paidAt ? new Date(o.paidAt).toLocaleString('zh-CN') : '',
          shippedAt: i === 0 && o.shippedAt ? new Date(o.shippedAt).toLocaleString('zh-CN') : '',
          name:      i === 0 ? (o.userSnapshot?.name || o.shipping?.recipient || '') : '',
          phone:     i === 0 ? (o.userSnapshot?.phone || o.shipping?.phone || '') : '',
          address:   i === 0 ? addrText : '',
          itemTitle: it.title,
          price:     Number(fmtMoney(it.price)),
          qty:       it.quantity,
          subtotal:  Number(fmtMoney(it.subtotal)),
          amount:    i === 0 ? Number(fmtMoney(o.amount)) : '',
          remark:    i === 0 ? (o.remark || '') : '',
        });
      }
    }
    ws1.getRow(1).font = { bold: true };
    ws1.getRow(1).alignment = { vertical: 'middle' };
    ws1.views = [{ state: 'frozen', ySplit: 1 }];

    // Sheet2:商品销量
    const ws2 = wb.addWorksheet('商品销量');
    ws2.columns = [
      { header: '商品',        key: 'title',  width: 30 },
      { header: '所属团 ID',    key: 'tuanId', width: 18 },
      { header: '单价 AUD',    key: 'price',  width: 10 },
      { header: '售出数量',    key: 'qty',    width: 10 },
      { header: '销售金额 AUD', key: 'total',  width: 14 },
      { header: '订单数',      key: 'orders', width: 10 },
    ];

    const agg = new Map(); // productId → { title, tuanId, price, qty, total, orderSet }
    for (const o of orders) {
      if (o.status === 'cancelled' || o.status === 'refunded') continue;
      for (const it of o.items) {
        const k = it.productId;
        const cur = agg.get(k) || { title: it.title, tuanId: it.tuanId || '', price: it.price, qty: 0, total: 0, orderSet: new Set() };
        cur.qty += it.quantity;
        cur.total += it.subtotal;
        cur.orderSet.add(o._id);
        agg.set(k, cur);
      }
    }
    const aggRows = [...agg.values()].sort((a, b) => b.qty - a.qty);
    for (const r of aggRows) {
      ws2.addRow({
        title: r.title, tuanId: r.tuanId,
        price: Number(fmtMoney(r.price)),
        qty: r.qty,
        total: Number(fmtMoney(r.total)),
        orders: r.orderSet.size,
      });
    }
    ws2.getRow(1).font = { bold: true };
    ws2.views = [{ state: 'frozen', ySplit: 1 }];

    // 汇总行
    const totalQty    = aggRows.reduce((s, r) => s + r.qty, 0);
    const totalAmount = aggRows.reduce((s, r) => s + r.total, 0);
    ws2.addRow({});
    const sumRow = ws2.addRow({
      title: '合计', tuanId: '', price: '',
      qty: totalQty,
      total: Number(fmtMoney(totalAmount)),
      orders: orders.filter(o => o.status !== 'cancelled' && o.status !== 'refunded').length,
    });
    sumRow.font = { bold: true };

    // 生成 buffer
    const buf = await wb.xlsx.writeBuffer();
    const ts = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15);
    const filename = `orders_${ts}.xlsx`;

    // 判断运行环境:云开发 vs 本地 Docker
    // 云开发:上传云存储;本地:返回 base64 给前端直接下载
    let fileID = null;
    let downloadUrl = null;
    let base64 = null;

    if (cloud.uploadFile && process.env.CLOUD_ENV !== 'local') {
      try {
        const up = await cloud.uploadFile({
          cloudPath: `exports/${filename}`,
          fileContent: Buffer.from(buf),
        });
        fileID = up.fileID;
        const temp = await cloud.getTempFileURL({ fileList: [fileID] });
        downloadUrl = temp.fileList && temp.fileList[0] && temp.fileList[0].tempFileURL;
      } catch (err) {
        console.warn('[exportOrders] cloud storage unavailable, fallback to base64:', err.message);
      }
    }

    if (!downloadUrl) {
      base64 = Buffer.from(buf).toString('base64');
    }

    return {
      code: 0,
      filename,
      fileID,
      downloadUrl,
      base64,
      count: orders.length,
    };
  } catch (err) {
    console.error('[exportOrders]', err);
    return { code: err.code || 500, message: err.message || 'error' };
  }
};
