import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { NavBar, SpinLoading, Toast, Empty, Button } from 'antd-mobile';
import QRCode from 'qrcode';
import { getTuanDetail, getProductDetail } from '../api/tuan';
import { formatCny } from '../utils/money';
// 海报生成 — /share/poster/:type/:id  (type = tuan | product)
//
// 750x1334 portrait canvas,合成:
//   cover 图 + 标题 + 价格 + QR 码(指向 /tuan/:id 或 /product/:id) + 品牌水印
// 长按 / 右键保存图片到本地

const W = 750;
const H = 1334;

export default function Poster() {
  const { type, id } = useParams<{ type: 'tuan' | 'product'; id: string }>();
  const nav = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        let title: string;
        let subtitle: string;
        let cover: string;
        let priceText: string;
        let qrTarget: string;

        if (type === 'tuan') {
          const r = await getTuanDetail(id!);
          const t = r.tuan;
          title = t.title;
          subtitle = t.description || '';
          cover = t.coverFileId;
          priceText = `${r.products.length} 件商品`;
          qrTarget = `${location.origin}/tuan/${id}`;
        } else {
          const r = await getProductDetail(id!);
          const p = r.product;
          title = p.title;
          subtitle = r.tuan.title;
          cover = p.coverFileId;
          priceText = formatCny(p.price);
          qrTarget = `${location.origin}/product/${id}`;
        }

        const url = await renderPoster(canvasRef.current!, {
          title, subtitle, cover, priceText, qrTarget,
        });
        if (!alive) return;
        setDataUrl(url);
      } catch (e: any) {
        if (alive) setError(e.message || '生成海报失败');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [type, id]);

  const onSave = () => {
    if (!dataUrl) return;
    // PC 端可直接下载,手机端提示长按图片保存
    const isMobile = /Mobi|Android/i.test(navigator.userAgent);
    if (isMobile) {
      Toast.show({ content: '长按图片可保存到相册', duration: 2500 });
    } else {
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `${type}-${id}-poster.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  return (
    <div className="min-h-screen bg-black">
      <NavBar onBack={() => nav(-1)} style={{ '--background': '#000', color: '#fff' } as any}>
        分享海报
      </NavBar>

      <div className="p-4 flex flex-col items-center">
        {loading && (
          <div className="py-20">
            <SpinLoading color="white" />
          </div>
        )}
        {error && !loading && <Empty description={<span className="text-white">{error}</span>} />}

        {/* 隐藏的离屏 canvas */}
        <canvas ref={canvasRef} width={W} height={H} style={{ display: 'none' }} />

        {dataUrl && (
          <>
            <img src={dataUrl} alt="poster" className="w-full max-w-sm rounded shadow-2xl" />
            <div className="mt-6 w-full max-w-sm space-y-3">
              <Button block color="primary" onClick={onSave}>
                保存图片
              </Button>
              <div className="text-center text-xs text-gray-400">
                {/Mobi|Android/i.test(navigator.userAgent)
                  ? '长按图片即可保存到相册'
                  : '点击「保存图片」下载到本地'}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// === Canvas 渲染 ===
interface PosterData {
  title: string;
  subtitle: string;
  cover: string;
  priceText: string;
  qrTarget: string;
}

// 字体串避开 `-apple-system`,某些浏览器在 canvas font 属性下不识别它会静默失败
const FONT_FAMILY = '"PingFang SC", "Microsoft YaHei", sans-serif';

async function renderPoster(canvas: HTMLCanvasElement, d: PosterData): Promise<string> {
  // 等系统字体就绪,否则 measureText 会返 0
  if ((document as any).fonts?.ready) {
    try { await (document as any).fonts.ready; } catch {}
  }

  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, W, H);

  // 顶部封面图(750x500)— 先画 brand 红做兜底,图加载成功再覆盖
  ctx.fillStyle = '#E34D59';
  ctx.fillRect(0, 0, W, 500);

  if (d.cover) {
    try {
      const img = await loadImage(d.cover);
      drawImageCover(ctx, img, 0, 0, W, 500);
    } catch (err) {
      console.warn('[poster] cover load failed, keeping red fallback', err);
    }
  }

  // 渐变蒙层(顶部 logo 区可读性)
  const grad = ctx.createLinearGradient(0, 0, 0, 220);
  grad.addColorStop(0, 'rgba(0,0,0,0.45)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, 220);

  // 顶部 logo
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `bold 36px ${FONT_FAMILY}`;
  ctx.fillText('🍄 蘑菇接龙', 40, 70);

  // 标题区白底
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 500, W, H - 500);

  // 价格(大红字)
  ctx.fillStyle = '#E34D59';
  ctx.font = `bold 64px ${FONT_FAMILY}`;
  ctx.fillText(d.priceText || '—', 40, 600);

  // 标题
  ctx.fillStyle = '#222';
  ctx.font = `bold 38px ${FONT_FAMILY}`;
  drawWrappedText(ctx, d.title || '', 40, 690, W - 80, 52, 2);

  // 副标题
  ctx.fillStyle = '#666';
  ctx.font = `28px ${FONT_FAMILY}`;
  drawWrappedText(ctx, d.subtitle || '', 40, 830, W - 80, 40, 2);

  // 分割线
  ctx.strokeStyle = '#EEE';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(40, 1080);
  ctx.lineTo(W - 40, 1080);
  ctx.stroke();

  // QR 码
  try {
    const qrDataUrl = await QRCode.toDataURL(d.qrTarget, {
      width: 260,
      margin: 1,
      color: { dark: '#222222', light: '#FFFFFF' },
      errorCorrectionLevel: 'M',
    });
    const qrImg = await loadImage(qrDataUrl);
    ctx.drawImage(qrImg, W - 300, H - 320, 260, 260);
  } catch (err) {
    console.error('[poster] qr generation failed', err);
  }

  // QR 提示
  ctx.fillStyle = '#222';
  ctx.font = `bold 34px ${FONT_FAMILY}`;
  ctx.fillText('扫码进店', 40, H - 220);
  ctx.fillStyle = '#999';
  ctx.font = `26px ${FONT_FAMILY}`;
  ctx.fillText('微信扫一扫,立即接龙', 40, H - 170);

  // footer
  ctx.fillStyle = '#999';
  ctx.font = `22px ${FONT_FAMILY}`;
  ctx.fillText('蘑菇接龙 · 澳洲华人社区团购', 40, H - 60);

  return canvas.toDataURL('image/png');
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // 必须用 anonymous CORS 否则 canvas 会被污染,toDataURL 抛 SecurityError
    // 失败就 reject,由调用方走红色兜底
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}

function drawImageCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, dx: number, dy: number, dw: number, dh: number) {
  const sR = img.width / img.height;
  const dR = dw / dh;
  let sx = 0, sy = 0, sw = img.width, sh = img.height;
  if (sR > dR) {
    sw = img.height * dR;
    sx = (img.width - sw) / 2;
  } else {
    sh = img.width / dR;
    sy = (img.height - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
}

function drawWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
) {
  const chars = [...(text || '')];
  let line = '';
  let lines: string[] = [];
  for (const c of chars) {
    const test = line + c;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      if (lines.length >= maxLines) break;
      line = c;
    } else {
      line = test;
    }
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines) {
    const last = lines[maxLines - 1];
    let trimmed = last;
    while (ctx.measureText(trimmed + '…').width > maxWidth && trimmed.length > 0) {
      trimmed = trimmed.slice(0, -1);
    }
    if (chars.length > lines.join('').length) trimmed += '…';
    lines[maxLines - 1] = trimmed;
  }
  lines.forEach((ln, i) => ctx.fillText(ln, x, y + i * lineHeight));
}
