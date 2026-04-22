// _admin/uploadImage
// 管理员上传图片到对象存储(本地 MinIO / 生产腾讯云 COS,通过 S3 兼容 API)
//
// 入参:
//   token:       JWT(Web 后台)或省略(小程序内已认证)
//   fileBase64:  base64 内容(可带或不带 data: 前缀)
//   mimeType:    image/png | image/jpeg | image/webp | image/gif
//   fileName:    原文件名(仅用于后缀推断)
//   purpose:     tuan_cover | product_cover | product_image
//
// 返回: { code: 0, url, key }
//
// 安全:
//   - JWT / admins 校验
//   - MIME 白名单 + magic bytes 二次嗅探
//   - size 上限 3MB(按 decode 后字节算)

const cloud = require('wx-server-sdk');
const { verify } = require('./jwt.js');
const crypto = require('crypto');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const JWT_SECRET = process.env.JWT_SECRET || 'mogu_express_dev_secret_REPLACE_ME_IN_PROD';

const MAX_BYTES = 3 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const ALLOWED_PURPOSE = new Set(['tuan_cover', 'product_cover', 'product_image']);
const MIME_TO_EXT = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

async function requireAdmin(event) {
  if (event && event.token) {
    try { return verify(event.token, JWT_SECRET); }
    catch { const e = new Error('invalid token'); e.code = 401; throw e; }
  }
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) { const e = new Error('no openid'); e.code = 401; throw e; }
  const res = await db.collection('admins').where({ openid: OPENID }).limit(1).get();
  if (!res.data || !res.data.length) { const e = new Error('not admin'); e.code = 403; throw e; }
  return res.data[0];
}

// magic bytes 嗅探,阻止伪装 MIME
function sniffMime(buf) {
  if (buf.length < 4) return null;
  // PNG 89 50 4E 47
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  // JPEG FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  // GIF 47 49 46 38
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return 'image/gif';
  // WEBP: RIFF....WEBP
  if (buf.length >= 12 &&
      buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
      buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return 'image/webp';
  return null;
}

function yyyymm() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}${m}`;
}

function genUuidish() {
  return crypto.randomBytes(12).toString('hex');
}

exports.main = async (event) => {
  try {
    await requireAdmin(event);

    const { fileBase64, mimeType, purpose } = event || {};
    if (!fileBase64) return { code: 1, message: 'fileBase64 required' };
    if (!mimeType || !ALLOWED_MIME.has(mimeType)) {
      return { code: 2, message: 'unsupported mime type' };
    }
    if (!purpose || !ALLOWED_PURPOSE.has(purpose)) {
      return { code: 3, message: 'invalid purpose' };
    }

    // 剥 data URL 前缀
    const b64 = String(fileBase64).replace(/^data:[^;]+;base64,/, '');
    let buf;
    try {
      buf = Buffer.from(b64, 'base64');
    } catch {
      return { code: 4, message: 'invalid base64' };
    }
    if (!buf || buf.length === 0) return { code: 4, message: 'empty file' };
    if (buf.length > MAX_BYTES) {
      return { code: 5, message: `file too large (max ${MAX_BYTES} bytes)` };
    }

    // magic bytes 嗅探
    const sniffed = sniffMime(buf);
    if (!sniffed || sniffed !== mimeType) {
      return { code: 6, message: `file content does not match declared mime (detected=${sniffed || 'unknown'})` };
    }

    const ext = MIME_TO_EXT[mimeType];
    const key = `${purpose}/${yyyymm()}/${genUuidish()}.${ext}`;

    const up = await cloud.uploadFile({
      cloudPath: key,
      fileContent: buf,
      contentType: mimeType,
    });

    return { code: 0, url: up.fileID, key };
  } catch (err) {
    return { code: err.code || 500, message: err.message || 'error' };
  }
};
