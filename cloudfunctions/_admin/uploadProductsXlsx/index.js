// _admin/uploadProductsXlsx — admin 批量上传 Excel 创建商品库条目 (Sprint 3-1)
//
// 入参: { xlsxBase64: string, dryRun: boolean }
// 出参: { code: 0, rows: BatchProductRow[], summary: {...} } 或错误码
//
// 行为:
//   1. 鉴权 (admin 必需)
//   2. base64 → xlsx → exceljs parse
//   3. 校验 header (8 列中文,顺序可变,商品名必需)
//   4. 校验行数 ≤ 500
//   5. 逐行校验 + 文件内 dedup + db 查 title,给 status 标签
//   6. dryRun=false 时对 created 行 db.collection('products').add (per-row try/catch)
//   7. 返 rows + summary
//
// 状态:
//   created           — 全字段通过,可 insert
//   already_exists    — db 已有同 title,跳过
//   duplicate_in_file — 文件内同 title 第二次以后出现
//   invalid           — 字段非法 / 必填缺
//   apply_failed      — dryRun=false 时 add 抛错
//
// 错误码:
//   1   xlsxBase64 缺 / 体积超 2MB
//   2   header 列名缺失 (尤其商品名)
//   3   行数 > 500
//   401 not logged in
//   403 not admin
//   500 internal

const ExcelJS = require('exceljs');
const cloud = require('wx-server-sdk');
const { verify } = require('./jwt.js');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const JWT_SECRET = process.env.JWT_SECRET || 'mogu_express_dev_secret_REPLACE_ME_IN_PROD';

const REQUIRED_HEADERS = ['商品名', '品牌', '规格', '基础价(元)', '英文名', '快递公司', '系数', '描述'];
const TITLE_HEADER = '商品名';
const COURIER_ENUM = ['顺丰', '中通', '圆通', '极兔', 'EMS', 'Australia Post', 'StarTrack', '其他'];
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
  const [title, brand, spec, basePriceYuan, englishName, courierName, courierFactor, description] = raw;

  const t = (title == null ? '' : String(title)).trim();
  if (!t) return { row: rowNum, title: '', status: 'invalid', message: '商品名为空' };
  if (t.length > 200) return { row: rowNum, title: t, status: 'invalid', message: '商品名超 200 字' };

  const fields = { title: t };

  if (brand != null && String(brand).trim() !== '') {
    const v = String(brand).trim();
    if (v.length > 50) return { row: rowNum, title: t, status: 'invalid', message: '品牌超 50 字' };
    fields.brand = v;
  }
  if (spec != null && String(spec).trim() !== '') {
    const v = String(spec).trim();
    if (v.length > 100) return { row: rowNum, title: t, status: 'invalid', message: '规格超 100 字' };
    fields.spec = v;
  }
  if (basePriceYuan != null && basePriceYuan !== '') {
    const yuan = Number(basePriceYuan);
    if (!Number.isFinite(yuan) || yuan < 0 || yuan > 100000) {
      return { row: rowNum, title: t, status: 'invalid', message: '基础价非法 (¥0..100000)' };
    }
    fields.basePrice = Math.round(yuan * 100);
  }
  if (englishName != null && String(englishName).trim() !== '') {
    const v = String(englishName).trim();
    if (v.length > 200) return { row: rowNum, title: t, status: 'invalid', message: '英文名超 200 字' };
    fields.englishName = v;
  }
  if (courierName != null && String(courierName).trim() !== '') {
    const v = String(courierName).trim();
    if (!COURIER_ENUM.includes(v)) {
      return { row: rowNum, title: t, status: 'invalid', message: `快递公司不在 enum:${COURIER_ENUM.join('/')}` };
    }
    fields.courierName = v;
  }
  if (courierFactor != null && courierFactor !== '') {
    const f = Number(courierFactor);
    if (!Number.isFinite(f) || f < 0 || f > 10) {
      return { row: rowNum, title: t, status: 'invalid', message: '系数非法 (0..10)' };
    }
    fields.courierFactor = f;
  }
  if (description != null && String(description).trim() !== '') {
    const v = String(description).trim();
    if (v.length > 500) return { row: rowNum, title: t, status: 'invalid', message: '描述超 500 字' };
    fields.description = v;
  }

  return { row: rowNum, title: t, fields, status: 'pending' };
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
    // 商品名是硬必填 header,缺 → 报错
    if (!colIndex[TITLE_HEADER]) return { code: 2, message: `header missing: ${TITLE_HEADER}` };

    const dataRowCount = ws.rowCount - 1;
    if (dataRowCount > MAX_ROWS) return { code: 3, message: `rows > ${MAX_ROWS}` };

    // 收集 raw rows(跳过全空行;空白判断只看商品名)
    const rawRows = [];
    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const titleCell = row.getCell(colIndex[TITLE_HEADER]).value;
      const titleEmpty = titleCell == null || (typeof titleCell === 'string' && titleCell.trim() === '');
      // 检查其他 cell 是否也都空,以判定整行是否为空
      const allEmpty = REQUIRED_HEADERS.every((h) => {
        if (!colIndex[h]) return true;
        const v = row.getCell(colIndex[h]).value;
        return v == null || (typeof v === 'string' && v.trim() === '');
      });
      if (titleEmpty && allEmpty) continue;
      rawRows.push({
        rowNum: r,
        cells: REQUIRED_HEADERS.map((h) => (colIndex[h] ? row.getCell(colIndex[h]).value : null)),
      });
    }

    // 分类 + 文件内 dedup + db 查 title
    const seenTitles = new Set();
    const rows = [];
    for (const { rowNum, cells } of rawRows) {
      const classified = classifyRow(rowNum, cells);
      if (classified.status === 'invalid') {
        rows.push(classified);
        continue;
      }
      if (seenTitles.has(classified.title)) {
        classified.status = 'duplicate_in_file';
        delete classified.fields;
        rows.push(classified);
        continue;
      }
      seenTitles.add(classified.title);

      const existsRes = await db.collection('products').where({ title: classified.title }).limit(1).get();
      if (existsRes.data && existsRes.data.length) {
        classified.status = 'already_exists';
        delete classified.fields;
        rows.push(classified);
        continue;
      }
      classified.status = 'created';
      rows.push(classified);
    }

    const summary = {
      created: rows.filter((r) => r.status === 'created').length,
      alreadyExists: rows.filter((r) => r.status === 'already_exists').length,
      invalid: rows.filter((r) => r.status === 'invalid').length,
      duplicateInFile: rows.filter((r) => r.status === 'duplicate_in_file').length,
    };

    if (!dryRun) {
      let applied = 0;
      let failed = 0;
      for (const row of rows) {
        if (row.status !== 'created') continue;
        const now = new Date();
        try {
          const addRes = await db.collection('products').add({
            data: {
              ...row.fields,
              imageFileIds: [],
              categoryIds: [],
              coverFileId: '',
              secondaryImages: [],
              createdAt: now,
              updatedAt: now,
            },
          });
          row._id = addRes._id;
          applied += 1;
        } catch (err) {
          row.status = 'apply_failed';
          row.message = err.message || 'insert failed';
          failed += 1;
        }
      }
      summary.applied = applied;
      summary.applyFailed = failed;
      summary.created = applied; // created 重新表示成功 insert 的行数
      const { OPENID } = cloud.getWXContext();
      const appliedTitles = rows.filter((r) => r.status === 'created').map((r) => r.title).slice(0, 50);
      const skipped = rows.length - applied - failed;
      console.log(`[uploadProductsXlsx] admin=${OPENID || 'web'} total=${rows.length} created=${applied} failed=${failed} skipped=${skipped} titles=${appliedTitles.join(',')}`);
    }

    return { code: 0, rows, summary };
  } catch (err) {
    return { code: err.code || 500, message: err.message || 'error' };
  }
};
