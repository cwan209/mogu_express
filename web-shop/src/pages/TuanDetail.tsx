import { useEffect, useState, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  NavBar, SearchBar, Skeleton, Empty, Modal, Image, Stepper, Tag, Button, Badge,
} from 'antd-mobile';
import { ShopbagOutline, SendOutline } from 'antd-mobile-icons';
import { getTuanDetail } from '../api/tuan';
import { groupProducts, filterProducts } from '../utils/groupProducts';
import { getCountdown } from '../utils/date';
import { formatCny } from '../utils/money';
import { useCartStore } from '../store/cart';
import type { Tuan, Product } from '../types';

export default function TuanDetail() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tuan, setTuan] = useState<Tuan | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [keyword, setKeyword] = useState('');
  const [activeSection, setActiveSection] = useState<string>('');
  const [announceOpen, setAnnounceOpen] = useState(false);
  const [tick, setTick] = useState(0);
  const announceShown = useRef(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await getTuanDetail(id!);
        if (!alive) return;
        setTuan(r.tuan);
        setProducts(r.products || []);
        if (r.tuan.announcement && !announceShown.current) {
          announceShown.current = true;
          setAnnounceOpen(true);
        }
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

  const { groups, hasAnySection } = useMemo(() => groupProducts(products), [products]);
  const searched = useMemo(() => filterProducts(products, keyword), [products, keyword]);

  useEffect(() => {
    if (!activeSection && groups.length > 0) setActiveSection(groups[0].section);
  }, [groups, activeSection]);

  const activeProducts = useMemo(() => {
    if (!hasAnySection) return products;
    const g = groups.find((x) => x.section === activeSection);
    return g?.products || [];
  }, [activeSection, groups, hasAnySection, products]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100">
        <NavBar onBack={() => nav(-1)}>团详情</NavBar>
        <div className="p-4 space-y-3">
          <Skeleton.Title animated />
          <Skeleton.Paragraph lineCount={3} animated />
        </div>
      </div>
    );
  }
  if (error || !tuan) {
    return (
      <div className="min-h-screen bg-gray-100">
        <NavBar onBack={() => nav(-1)}>团详情</NavBar>
        <Empty description={error || '团不存在'} />
      </div>
    );
  }

  const cd = getCountdown(tuan.endAt);
  void tick;

  return (
    <div className="min-h-screen bg-gray-100 pb-20">
      <NavBar
        onBack={() => nav(-1)}
        right={
          <SendOutline
            fontSize={20}
            onClick={() => nav(`/share/poster/tuan/${tuan._id}`)}
          />
        }
      >
        {tuan.title}
      </NavBar>

      <div className="bg-white">
        {tuan.coverFileId && (
          <Image src={tuan.coverFileId} width="100%" height={180} fit="cover" lazy />
        )}
        <div className="p-3">
          <div className="text-base font-medium">{tuan.title}</div>
          <div className="text-xs text-gray-500 mt-1">{tuan.description}</div>
          <div className="flex items-center justify-between mt-2">
            {tuan.status === 'on_sale' && !cd.ended && (
              <div className="text-brand text-xs">
                距截团 {cd.days > 0 ? `${cd.days}天 ` : ''}
                {String(cd.hours).padStart(2, '0')}:
                {String(cd.minutes).padStart(2, '0')}:
                {String(cd.seconds).padStart(2, '0')}
              </div>
            )}
            {tuan.announcement && (
              <a className="text-brand text-xs" onClick={() => setAnnounceOpen(true)}>
                📢 团公告
              </a>
            )}
          </div>
        </div>
      </div>

      <div className="p-2 bg-white border-t border-gray-100">
        <SearchBar
          placeholder="搜本团商品"
          value={keyword}
          onChange={setKeyword}
          showCancelButton={() => keyword.length > 0}
        />
      </div>

      {keyword.trim() ? (
        <div className="bg-white">
          {searched.length === 0 ? (
            <Empty description="没找到匹配商品" />
          ) : (
            searched.map((p) => (
              <ProductRow key={p._id} product={p} onClick={() => nav(`/product/${p._id}`)} />
            ))
          )}
        </div>
      ) : hasAnySection ? (
        <div className="flex bg-white" style={{ minHeight: 'calc(100vh - 360px)' }}>
          <div className="w-24 bg-gray-50 flex-shrink-0">
            {groups.map((g) => (
              <div
                key={g.section}
                className={`px-2 py-3 text-sm border-l-4 cursor-pointer ${
                  activeSection === g.section
                    ? 'bg-white text-brand border-brand font-medium'
                    : 'border-transparent text-gray-600'
                }`}
                onClick={() => setActiveSection(g.section)}
              >
                {g.section}
              </div>
            ))}
          </div>
          <div className="flex-1">
            {activeProducts.map((p) => (
              <ProductRow key={p._id} product={p} onClick={() => nav(`/product/${p._id}`)} />
            ))}
          </div>
        </div>
      ) : (
        <div className="bg-white">
          {products.map((p) => (
            <ProductRow key={p._id} product={p} onClick={() => nav(`/product/${p._id}`)} />
          ))}
        </div>
      )}

      <Modal
        visible={announceOpen}
        title="团公告"
        content={<div className="whitespace-pre-wrap text-sm leading-6">{tuan.announcement}</div>}
        closeOnAction
        actions={[{ key: 'ok', text: '我知道了', primary: true }]}
        onClose={() => setAnnounceOpen(false)}
      />

      <FloatingCart />
    </div>
  );
}

function FloatingCart() {
  const nav = useNavigate();
  const qty = useCartStore((s) => s.totalQty());
  const total = useCartStore((s) => s.totalCents());
  return (
    <div className="fixed left-0 right-0 bottom-0 max-w-[480px] mx-auto bg-white border-t border-gray-200 p-3 flex items-center justify-between z-50 shadow-lg">
      <div className="flex items-center gap-3" onClick={() => nav('/cart')}>
        <Badge content={qty > 0 ? String(qty) : null}>
          <div className="w-11 h-11 rounded-full bg-brand text-white flex items-center justify-center">
            <ShopbagOutline fontSize={22} />
          </div>
        </Badge>
        <div>
          <div className="text-brand font-medium text-base">{formatCny(total)}</div>
          <div className="text-xs text-gray-400">{qty} 件商品</div>
        </div>
      </div>
      <Button
        color="primary"
        size="large"
        disabled={qty === 0}
        onClick={() => nav('/checkout')}
      >
        去结算
      </Button>
    </div>
  );
}

function ProductRow({ product, onClick }: { product: Product; onClick: () => void }) {
  const qty = useCartStore((s) => s.getQty(product._id));
  const setItem = useCartStore((s) => s.setItem);
  const soldOut = product.stock - product.sold <= 0;

  const onStep = (n: number) => {
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
    <div className="flex p-3 gap-3 border-b border-gray-100 active:bg-gray-50">
      <div onClick={onClick} className="w-20 h-20 flex-shrink-0 rounded overflow-hidden bg-gray-100">
        {product.coverFileId && (
          <Image src={product.coverFileId} width={80} height={80} fit="cover" lazy />
        )}
      </div>
      <div className="flex-1 min-w-0" onClick={onClick}>
        <div className="text-sm line-clamp-2">{product.title}</div>
        {product.section && (
          <Tag color="default" className="mt-1" fill="outline" style={{ fontSize: 10 }}>
            {product.section}
          </Tag>
        )}
        <div className="flex items-center justify-between mt-2">
          <span className="text-brand font-medium">{formatCny(product.price)}</span>
          <span className="text-xs text-gray-400">
            已订 {product.participantCount || 0} · 剩 {product.stock - product.sold}
          </span>
        </div>
      </div>
      <div className="flex flex-col justify-end" onClick={(e) => e.stopPropagation()}>
        {soldOut ? (
          <Tag color="default">已售罄</Tag>
        ) : (
          <Stepper
            min={0}
            max={product.stock - product.sold}
            value={qty}
            onChange={onStep}
          />
        )}
      </div>
    </div>
  );
}
