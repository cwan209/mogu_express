// _admin/uploadShippingFeesXlsx — admin 批量上传 Excel 设运费 + 物流
//
// 入参: { xlsxBase64: string, dryRun: boolean }
// 出参: { code: 0, rows: BatchShippingRow[], summary: {...} } 或错误码
//
// 行为:
//   1. 鉴权 (admin 必需)
//   2. base64 → xlsx → exceljs parse
//   3. 校验 header (4 列中文,顺序可变,列名严格)
//   4. 校验行数 ≤ 500
//   5. 逐行校验 + 查 mongo,给 status 标签
//   6. dryRun=false 时对 matched 行 update orders (per-row,无事务)
//   7. 返 rows + summary
//
// 错误码:
//   1   xlsxBase64 缺 / 体积超 2MB
//   2   header 列名缺失
//   3   行数 > 500
//   401 not logged in
//   403 not admin
//   500 internal

const crypto = require('crypto');
const ExcelJS = require('exceljs');
const cloud = require('wx-server-sdk');
const { verify } = require('./jwt.js');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const JWT_SECRET = process.env.JWT_SECRET || 'mogu_express_dev_secret_REPLACE_ME_IN_PROD';

const REQUIRED_HEADERS = ['订单号', '实际总重量', '应补尾款', '快递单号'];
const MAX_BASE64_BYTES = 2 * 1024 * 1024 * 4 / 3; // ~2.6MB base64 = ~2MB binary
const MAX_ROWS = 500;

async function requireAdmin(event) {
  if (event && event.token) {
    try { return { source: 'web', admin: verify(event.token, JWT_SECRET) }; }
    catch (err) { const e = new Error('invalid token'); e.code = 401; throw e; }
  }
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) { const e = new Error('no openid'); e.code = 401; throw e; }
  const res = await db.collection('admins').where({ openid: OPENID }).limit(1).get();
  if (!res.data || !res.data.length) { const e = new Error('not admin'); e.code = 403; throw e; }
  return { source: 'mp', admin: res.data[0] };
}

function classifyRow(rowNum, raw) {
  const [orderNoRaw, weightRaw, feeYuanRaw, courierNoRaw] = raw;
  const orderNo = (orderNoRaw == null ? '' : String(orderNoRaw)).trim();
  if (!orderNo) {
    return { row: rowNum, orderNo: '', weight: null, fee: null, courierNo: null, status: 'invalid', message: '订单号为空' };
  }
  const weight = Number(weightRaw);
  if (!Number.isFinite(weight) || weight < 0 || weight > 1000) {
    return { row: rowNum, orderNo, weight: null, fee: null, courierNo: null, status: 'invalid', message: '重量非法(0..1000 kg)' };
  }
  const feeYuan = Number(feeYuanRaw);
  if (!Number.isFinite(feeYuan) || feeYuan < 0 || feeYuan > 10000) {
    return { row: rowNum, orderNo, weight, fee: null, courierNo: null, status: 'invalid', message: '尾款非法(¥0..10000)' };
  }
  const fee = Math.round(feeYuan * 100);
  const courierNo = courierNoRaw == null ? '' : String(courierNoRaw).trim();
  if (courierNo.length > 100) {
    return { row: rowNum, orderNo, weight, fee, courierNo: null, status: 'invalid', message: '快递单号过长' };
  }
  return { row: rowNum, orderNo, weight, fee, courierNo, status: 'pending' };
}

exports.main = async (event) => {
  try {
    await requireAdmin(event);
    const { xlsxBase64, dryRun } = event || {};
    if (!xlsxBase64 || typeof xlsxBase64 !== 'string') {
      return { code: 1, message: 'xlsxBase64 required' };
    }
    if (xlsxBase64.length > MAX_BASE64_BYTES) {
      return { code: 1, message: '文件过大 (> 2MB)' };
    }

    const buf = Buffer.from(xlsxBase64, 'base64');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const ws = wb.worksheets[0];
    if (!ws) return { code: 2, message: 'no sheet' };

    // 读 header → col index 映射
    const headerRow = ws.getRow(1);
    const colIndex = {};
    headerRow.eachCell((cell, colNumber) => {
      const v = (cell.value == null ? '' : String(cell.value)).trim();
      if (REQUIRED_HEADERS.includes(v)) colIndex[v] = colNumber;
    });
    for (const h of REQUIRED_HEADERS) {
      if (!colIndex[h]) return { code: 2, message: `header missing: ${h}` };
    }

    const dataRowCount = ws.rowCount - 1;
    if (dataRowCount > MAX_ROWS) return { code: 3, message: `rows > ${MAX_ROWS}` };

    // 收集 raw rows(跳过全空行)
    const rawRows = [];
    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const isEmpty = REQUIRED_HEADERS.every((h) => {
        const v = row.getCell(colIndex[h]).value;
        return v == null || (typeof v === 'string' && v.trim() === '');
      });
      if (isEmpty) continue;
      rawRows.push({
        rowNum: r,
        cells: REQUIRED_HEADERS.map((h) => row.getCell(colIndex[h]).value),
      });
    }

    // 分类 + 查 mongo + 重复检测
    const seenOrderNos = new Set();
    const rows = [];
    for (const { rowNum, cells } of rawRows) {
      const classified = classifyRow(rowNum, cells);
      if (classified.status === 'invalid') {
        rows.push(classified);
        continue;
      }
      if (seenOrderNos.has(classified.orderNo)) {
        classified.status = 'duplicate_in_file';
        rows.push(classified);
        continue;
      }
      seenOrderNos.add(classified.orderNo);

      const orderRes = await db.collection('orders').where({ orderNo: classified.orderNo }).limit(1).get();
      const order = orderRes.data && orderRes.data[0];
      if (!order) {
        classified.status = 'not_found';
        rows.push(classified);
        continue;
      }
      if (order.shippingFee && order.shippingFee.payStatus === 'paid') {
        classified.status = 'already_paid';
        classified.before = { shippingFee: order.shippingFee, tracking: order.tracking };
        rows.push(classified);
        continue;
      }
      classified.status = 'matched';
      classified.before = { shippingFee: order.shippingFee, tracking: order.tracking };
      classified._mongoId = order._id;
      rows.push(classified);
    }

    const summary = {
      matched: rows.filter((r) => r.status === 'matched').length,
      notFound: rows.filter((r) => r.status === 'not_found').length,
      alreadyPaid: rows.filter((r) => r.status === 'already_paid').length,
      invalid: rows.filter((r) => r.status === 'invalid').length,
      duplicateInFile: rows.filter((r) => r.status === 'duplicate_in_file').length,
    };

    if (!dryRun) {
      let applied = 0;
      for (const row of rows) {
        if (row.status !== 'matched') continue;
        const now = new Date();
        const outTradeNo = 'SHIP' + Date.now() + crypto.randomBytes(4).toString('hex').toUpperCase();
        await db.collection('orders').doc(row._mongoId).update({
          data: {
            shippingFee: {
              amount: row.fee,
              outTradeNo,
              payStatus: 'pending',
              setAt: now,
              paidAt: null,
            },
            tracking: {
              weight: row.weight,
              courierName: null,
              courierNo: row.courierNo,
              setAt: now,
            },
            updatedAt: now,
          },
        });
        applied += 1;
      }
      summary.applied = applied;
      const { OPENID } = cloud.getWXContext();
      console.log(`[uploadShippingFeesXlsx] admin=${OPENID || 'web'} total=${rows.length} applied=${applied} skipped=${rows.length - applied}`);
    }

    const out = rows.map(({ _mongoId, ...rest }) => rest);
    return { code: 0, rows: out, summary };
  } catch (err) {
    return { code: err.code || 500, message: err.message || 'error' };
  }
};
