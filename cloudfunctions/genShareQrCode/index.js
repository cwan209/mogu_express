// genShareQrCode - 生成可在朋友圈/聊天里扫的小程序码
//
// 入参:
//   { type: 'tuan' | 'product', id: string }
//
// 行为:
//   - 云开发环境(有 wx.openapi.wxacode):调 getUnlimited 拿真二维码 buffer,
//     传到云存储,返 fileID
//   - 本地 stub:返回一张 placehold.co 的"二维码"占位图 URL,海报页能正常画
//
// 出参:
//   { code: 0, qrUrl: string }    — 直接给前端画 canvas 用
//
// 真实环境 scene 限 32 字符:type 用 1 字符 + id 用 hash 截断
//   t:001  / p:101 这种简化形式;page 写 'pages/tuan-detail/index' 等

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// 简单 hash:把 id 缩到 6 个字符以内(扫码后云函数再反查)
function shortHash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h * 31) + s.charCodeAt(i)) >>> 0;
  return h.toString(36).slice(0, 6);
}

exports.main = async (event) => {
  const { type = 'tuan', id } = event || {};
  if (!id) return { code: 1, message: 'id required' };
  if (!['tuan', 'product'].includes(type)) return { code: 1, message: 'bad type' };

  const scene = `${type[0]}:${shortHash(id)}`;
  const page = type === 'tuan' ? 'pages/tuan-detail/index' : 'pages/product-detail/index';

  // 检测环境:是否能调 wx.openapi
  if (cloud.openapi && cloud.openapi.wxacode && process.env.CLOUD_ENV !== 'local') {
    try {
      const res = await cloud.openapi.wxacode.getUnlimited({
        scene,
        page,
        checkPath: false,
        envVersion: process.env.WX_ENV_VERSION || 'release',
        width: 280,
      });
      // res.buffer 上传到云存储
      const upload = await cloud.uploadFile({
        cloudPath: `qrcodes/${type}_${id}_${Date.now()}.png`,
        fileContent: res.buffer,
      });
      const url = await cloud.getTempFileURL({ fileList: [upload.fileID] });
      const tempUrl = url.fileList && url.fileList[0] && url.fileList[0].tempFileURL;
      return { code: 0, qrUrl: tempUrl, fileID: upload.fileID, scene, page };
    } catch (err) {
      console.error('[genShareQrCode] real wxacode failed,fallback to stub', err.message);
    }
  }

  // Stub:占位"二维码"图(纯色块带文字),海报页拿来用
  // 用一个公共二维码生成服务作为视觉占位 — qrserver.com 是免费的
  const fakeData = `mogu://${page}?id=${encodeURIComponent(id)}`;
  const stubUrl = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(fakeData)}`;
  return { code: 0, qrUrl: stubUrl, fileID: null, scene, page, stub: true };
};
