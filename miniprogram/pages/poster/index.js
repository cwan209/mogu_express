// pages/poster/index.js
// 生成商品/团的分享海报。canvas 2d API + 微信小程序基础库 2.9+
//
// 布局(逻辑像素 750x1100):
//   - 顶部 750x600 商品/团封面
//   - 中部 标题 + 价格 + 描述 + 团信息
//   - 底部 240x240 小程序码 + "长按识别小程序"
//
// 实际 dpr 倍数渲染,导出图片清晰。
const tuanService = require('../../services/tuan.js');
const productService = require('../../services/product.js');
const { callFunction } = require('../../utils/cloud.js');
const config = require('../../config/index.js');
const { fromCents } = require('../../utils/money.js');

// 设计稿宽度(px,逻辑像素)
const DW = 375;
const DH = 555;

Page({
  data: {
    type: '',
    id: '',
    title: '',
    desc: '',
    price: '',
    coverUrl: '',
    qrUrl: '',
    cssW: DW,
    cssH: DH,
    imagePath: '',         // canvas 导出的临时图片路径
    drawing: false,
    drawingText: '加载素材...',
    saving: false,
  },

  onLoad(options) {
    const { type, id } = options || {};
    if (!type || !id) {
      wx.showToast({ title: '参数错误', icon: 'none' });
      return;
    }
    this.setData({ type, id });
    this.kickoff();
  },

  async kickoff() {
    this.setData({ drawing: true, drawingText: '加载素材...' });
    try {
      // 1. 拉数据(标题/封面/价格)
      let payload;
      if (this.data.type === 'tuan') {
        const { tuan } = await tuanService.getTuanDetail(this.data.id);
        payload = {
          title: tuan.title || '团购',
          desc: tuan.description || '',
          price: '',
          coverUrl: tuan.coverFileId,
        };
      } else {
        const { product } = await productService.getProductDetail(this.data.id);
        payload = {
          title: product.title || '商品',
          desc: product.description || '',
          price: 'A$ ' + fromCents(product.price || 0),
          coverUrl: product.coverFileId,
        };
      }

      // 2. 拿小程序码(可能是真二维码,可能是 stub 占位)
      let qrUrl = '';
      if (config.useMock) {
        // mock 模式:用 stub 占位二维码
        const fakeData = `mogu://${this.data.type}/${this.data.id}`;
        qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(fakeData)}`;
      } else {
        try {
          const res = await callFunction('genShareQrCode', { type: this.data.type, id: this.data.id });
          qrUrl = res.qrUrl;
        } catch (err) {
          console.warn('[poster] genShareQrCode failed, use stub', err);
          qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(this.data.id)}`;
        }
      }

      this.setData({ ...payload, qrUrl });

      // 3. 画
      this.setData({ drawingText: '生成中...' });
      await this.draw();

      this.setData({ drawing: false });
    } catch (err) {
      console.error('[poster] kickoff', err);
      this.setData({ drawing: false });
      wx.showToast({ title: err.message || '加载失败', icon: 'none' });
    }
  },

  draw() {
    return new Promise((resolve, reject) => {
      const query = wx.createSelectorQuery();
      query.select('#poster')
        .fields({ node: true, size: true })
        .exec(async (res) => {
          if (!res || !res[0]) return reject(new Error('canvas 未就绪'));
          const canvas = res[0].node;
          const ctx = canvas.getContext('2d');

          // 高 DPR
          const dpr = wx.getSystemInfoSync().pixelRatio || 2;
          canvas.width = DW * dpr;
          canvas.height = DH * dpr;
          ctx.scale(dpr, dpr);

          try {
            await this.paint(canvas, ctx);
            // 导出
            wx.canvasToTempFilePath({
              canvas,
              x: 0, y: 0, width: DW, height: DH,
              destWidth: DW * dpr, destHeight: DH * dpr,
              fileType: 'png',
              quality: 1,
              success: (r) => {
                this.setData({ imagePath: r.tempFilePath });
                resolve();
              },
              fail: (err) => reject(err),
            });
          } catch (err) {
            reject(err);
          }
        });
    });
  },

  async paint(canvas, ctx) {
    // 整体背景
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, DW, DH);

    // ── 顶部封面 ── 375x300
    if (this.data.coverUrl) {
      try {
        const img = await this.loadImage(canvas, this.data.coverUrl);
        // cover 模式裁剪
        this.drawImageCover(ctx, img, 0, 0, DW, 300);
      } catch (err) {
        console.warn('[poster] cover load failed', err);
        ctx.fillStyle = '#EEE';
        ctx.fillRect(0, 0, DW, 300);
      }
    }

    // 红色品牌条
    ctx.fillStyle = '#E34D59';
    ctx.fillRect(0, 300, DW, 6);

    // ── 标题 ──
    ctx.fillStyle = '#181818';
    ctx.font = 'bold 18px sans-serif';
    ctx.textBaseline = 'top';
    this.drawWrappedText(ctx, this.data.title, 24, 320, DW - 48, 26, 2);

    // ── 价格 ──
    if (this.data.price) {
      ctx.fillStyle = '#E34D59';
      ctx.font = 'bold 32px sans-serif';
      ctx.fillText(this.data.price, 24, 380);
    }

    // ── 描述 ──
    if (this.data.desc) {
      ctx.fillStyle = '#888';
      ctx.font = '13px sans-serif';
      this.drawWrappedText(ctx, this.data.desc, 24, this.data.price ? 425 : 380, DW - 48, 18, 2);
    }

    // ── 底部小程序码 ──
    const QR_X = DW - 100 - 16;     // 右下角
    const QR_Y = DH - 100 - 16;
    if (this.data.qrUrl) {
      try {
        const qr = await this.loadImage(canvas, this.data.qrUrl);
        ctx.drawImage(qr, QR_X, QR_Y, 100, 100);
      } catch (err) {
        console.warn('[poster] qr load failed', err);
        ctx.fillStyle = '#F0F0F0';
        ctx.fillRect(QR_X, QR_Y, 100, 100);
      }
    }
    ctx.fillStyle = '#888';
    ctx.font = '11px sans-serif';
    ctx.fillText('长按识别小程序', QR_X - 6, DH - 30);

    // ── 左下角"接龙团购" 品牌 ──
    ctx.fillStyle = '#181818';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText('接龙团购', 24, DH - 60);
    ctx.fillStyle = '#888';
    ctx.font = '11px sans-serif';
    ctx.fillText('Mogu Express · 澳洲华人社区团购', 24, DH - 38);
  },

  // image-cover 算法
  drawImageCover(ctx, img, dx, dy, dw, dh) {
    const sw = img.width;
    const sh = img.height;
    const sr = sw / sh;
    const dr = dw / dh;
    let sx = 0, sy = 0, sCw = sw, sCh = sh;
    if (sr > dr) {
      // 源更宽,左右裁
      sCw = sh * dr;
      sx = (sw - sCw) / 2;
    } else {
      // 源更高,上下裁
      sCh = sw / dr;
      sy = (sh - sCh) / 2;
    }
    ctx.drawImage(img, sx, sy, sCw, sCh, dx, dy, dw, dh);
  },

  // 多行文本省略
  drawWrappedText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
    if (!text) return;
    const chars = String(text).split('');
    let line = '';
    let lineCount = 0;
    for (let i = 0; i < chars.length; i++) {
      const test = line + chars[i];
      if (ctx.measureText(test).width > maxWidth && line) {
        if (lineCount === maxLines - 1) {
          // 最后一行截断 + ...
          while (line && ctx.measureText(line + '...').width > maxWidth) line = line.slice(0, -1);
          ctx.fillText(line + '...', x, y + lineCount * lineHeight);
          return;
        }
        ctx.fillText(line, x, y + lineCount * lineHeight);
        line = chars[i];
        lineCount++;
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, x, y + lineCount * lineHeight);
  },

  // 适配 canvas 2d 的图片加载
  loadImage(canvas, url) {
    return new Promise((resolve, reject) => {
      const img = canvas.createImage();
      img.onload = () => resolve(img);
      img.onerror = (err) => reject(err);
      img.src = url;
    });
  },

  onPreview() {
    if (!this.data.imagePath) return;
    wx.previewImage({ urls: [this.data.imagePath] });
  },

  async onSave() {
    if (!this.data.imagePath || this.data.saving) return;
    this.setData({ saving: true });
    try {
      const r = await this.requestAlbumAuth();
      if (!r) {
        wx.showToast({ title: '需要相册权限', icon: 'none' });
        return;
      }
      await new Promise((resolve, reject) => {
        wx.saveImageToPhotosAlbum({
          filePath: this.data.imagePath,
          success: resolve,
          fail: reject,
        });
      });
      wx.showToast({ title: '已保存到相册', icon: 'success' });
    } catch (err) {
      if (err && err.errMsg && err.errMsg.indexOf('cancel') >= 0) return;
      wx.showToast({ title: err.message || err.errMsg || '保存失败', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  },

  // 触发授权
  requestAlbumAuth() {
    return new Promise((resolve) => {
      wx.getSetting({
        success: (res) => {
          if (res.authSetting['scope.writePhotosAlbum'] === false) {
            // 用户之前拒绝过 → 引导去设置页
            wx.showModal({
              title: '需要相册权限',
              content: '请在设置中开启"保存到相册"权限',
              confirmText: '去设置',
              success: (m) => {
                if (m.confirm) {
                  wx.openSetting({
                    success: (s) => resolve(!!s.authSetting['scope.writePhotosAlbum']),
                  });
                } else resolve(false);
              },
            });
          } else {
            resolve(true);    // 第一次或已授权,saveImageToPhotosAlbum 会自动弹授权
          }
        },
      });
    });
  },
});
