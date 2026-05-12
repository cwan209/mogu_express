import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  NavBar, Swiper, Image, Skeleton, Empty, Stepper, Button, Tag, Toast,
} from 'antd-mobile';
import { SendOutline } from 'antd-mobile-icons';
import { getProductDetail } from '../api/tuan';
import { formatCny } from '../utils/money';
import { getCountdown } from '../utils/date';
import { useCartStore } from '../store/cart';
import type { Tuan, Product, Participant } from '../types';

export default function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [product, setProduct] = useState<Product | null>(null);
  const [tuan, setTuan] = useState<Tuan | null>(null);
  const [parts, setParts] = useState<Participant[]>([]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await getProductDetail(id!);
        if (!alive) return;
        setProduct(r.product);
        setTuan(r.tuan);
        setParts(r.participants || []);
      } catch (e: any) {
        if (alive) setError(e.message || '加载失败');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [id]);

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  void tick;

  const qty = useCartStore((s) => (product ? s.getQty(product._id) : 0));
  const setItem = useCartStore((s) => s.setItem);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100">
        <NavBar onBack={() => nav(-1)}>商品详情</NavBar>
        <Skeleton.Paragraph lineCount={5} animated />
      </div>
    );
  }
  if (error || !product || !tuan) {
    return (
      <div className="min-h-screen bg-gray-100">
        <NavBar onBack={() => nav(-1)}>商品详情</NavBar>
        <Empty description={error || '商品不存在'} />
      </div>
    );
  }

  const images = product.imageFileIds?.length
    ? product.imageFileIds
    : product.coverFileId ? [product.coverFileId] : [];
  const remaining = product.stock - product.sold;
  const cd = getCountdown(tuan.endAt);

  const addToCart = (n: number) => {
    setItem(
      {
        tuanItemId: product._id,
        productId: product.productId,
        tuanId: product.tuanId,
        title: product.title,
        price: product.price,
        coverFileId: product.coverFileId,
      },
      n,
    );
  };

  return (
    <div className="min-h-screen bg-gray-100 pb-20">
      <NavBar
        onBack={() => nav(-1)}
        right={
          <SendOutline
            fontSize={20}
            onClick={() => nav(`/share/poster/product/${product._id}`)}
          />
        }
      >
        商品详情
      </NavBar>

      {/* 图轮播 */}
      <div className="bg-white">
        {images.length > 0 && (
          <Swiper autoplay loop>
            {images.map((src, i) => (
              <Swiper.Item key={i}>
                <Image src={src} width="100%" height={280} fit="cover" />
              </Swiper.Item>
            ))}
          </Swiper>
        )}
      </div>

      {/* 价格 + 标题 */}
      <div className="bg-white p-3 mt-2">
        <div className="flex items-baseline gap-2">
          <span className="text-brand text-xl font-medium">{formatCny(product.price)}</span>
          <span className="text-xs text-gray-400">已订 {product.participantCount || 0}</span>
          <span className="text-xs text-gray-400">剩 {remaining}</span>
        </div>
        <div className="text-base mt-2">{product.title}</div>
        {product.section && (
          <Tag fill="outline" className="mt-2">{product.section}</Tag>
        )}
      </div>

      {/* 所属团信息 */}
      <div
        className="bg-white p-3 mt-2 flex items-center justify-between"
        onClick={() => nav(`/tuan/${tuan._id}`)}
      >
        <div className="flex-1 min-w-0">
          <div className="text-xs text-gray-500 mb-1">来自团</div>
          <div className="text-sm truncate">{tuan.title}</div>
        </div>
        {tuan.status === 'on_sale' && !cd.ended && (
          <div className="text-brand text-xs ml-2 whitespace-nowrap">
            {cd.days > 0 ? `${cd.days}天 ` : ''}
            {String(cd.hours).padStart(2, '0')}:
            {String(cd.minutes).padStart(2, '0')}:
            {String(cd.seconds).padStart(2, '0')}
          </div>
        )}
      </div>

      {/* 商品描述 */}
      {product.description && (
        <div className="bg-white p-3 mt-2">
          <div className="text-xs text-gray-500 mb-2">商品描述</div>
          <div className="text-sm text-gray-700 whitespace-pre-wrap leading-6">
            {product.description}
          </div>
        </div>
      )}

      {/* 参团名单 */}
      <div className="bg-white p-3 mt-2">
        <div className="text-xs text-gray-500 mb-2">已订购 ({product.participantCount || 0})</div>
        {parts.length === 0 ? (
          <div className="text-xs text-gray-400">还没有人下单,等你来开第一单</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {parts.slice(0, 30).map((p) => (
              <div key={p.id} className="flex items-center gap-1 bg-gray-50 rounded-full px-2 py-1">
                {p.avatar && (
                  <Image src={p.avatar} width={20} height={20} style={{ borderRadius: '50%' }} />
                )}
                <span className="text-xs">{p.nickName}</span>
                <span className="text-xs text-gray-400">×{p.quantity}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 底部加购栏 */}
      <div className="fixed left-0 right-0 bottom-0 bg-white border-t border-gray-200 max-w-[480px] mx-auto p-3 flex items-center gap-3 z-50">
        <div className="flex-1">
          {remaining > 0 ? (
            <Stepper min={0} max={remaining} value={qty} onChange={addToCart} />
          ) : (
            <Tag color="default">已售罄</Tag>
          )}
        </div>
        <Button
          color="primary"
          disabled={remaining <= 0}
          onClick={() => {
            if (qty <= 0) addToCart(1);
            Toast.show({ icon: 'success', content: '已加入购物车' });
          }}
        >
          加入购物车
        </Button>
        <Button onClick={() => nav('/cart')}>查看购物车</Button>
      </div>
    </div>
  );
}
