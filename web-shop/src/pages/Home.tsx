import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { NavBar, NoticeBar, PullToRefresh, Skeleton, Empty, Image, Tag, Swiper } from 'antd-mobile';
import { listTuans, getHomeBanner, type HomeBanner } from '../api/tuan';
import { listAnnouncements, type Announcement } from '../api/announcement';
import type { Tuan } from '../types';
import { getCountdown } from '../utils/date';
import PendingOrderBanner from '../components/PendingOrderBanner';

const STATUS_LABEL: Record<Tuan['status'], { text: string; color: string }> = {
  draft: { text: '草稿', color: '#999' },
  scheduled: { text: '即将开团', color: '#FF8F1F' },
  on_sale: { text: '开团中', color: '#E34D59' },
  closed: { text: '已截团', color: '#666' },
  archived: { text: '已归档', color: '#999' },
};

export default function Home() {
  const nav = useNavigate();
  const [loading, setLoading] = useState(true);
  const [tuans, setTuans] = useState<Tuan[]>([]);
  const [banner, setBanner] = useState<HomeBanner | null>(null);
  const [banners, setBanners] = useState<Announcement[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);  // 倒计时刷新

  const load = async () => {
    setError(null);
    try {
      const [list, b, ann] = await Promise.all([
        listTuans(),
        getHomeBanner().catch(() => null),
        listAnnouncements().catch(() => []),
      ]);
      setTuans(list);
      setBanner(b);
      setBanners(ann);
    } catch (e: any) {
      setError(e.message || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="min-h-screen bg-gray-100 pb-16">
      <NavBar back={null} className="bg-white">蘑菇接龙</NavBar>

      {banners.length > 0 && (
        <Swiper
          autoplay
          loop
          autoplayInterval={4000}
          indicator={(total, current) => (
            <div style={{
              position: 'absolute', bottom: 8, right: 12,
              background: 'rgba(0,0,0,0.4)', color: '#fff',
              padding: '2px 8px', borderRadius: 10, fontSize: 12,
            }}>
              {current + 1}/{total}
            </div>
          )}
        >
          {banners.map((b) => (
            <Swiper.Item key={b._id}>
              <div
                onClick={() => nav(b.link)}
                style={{ cursor: 'pointer' }}
              >
                <img
                  src={b.image}
                  alt=""
                  style={{ width: '100%', height: 180, objectFit: 'cover', display: 'block' }}
                />
              </div>
            </Swiper.Item>
          ))}
        </Swiper>
      )}

      <PendingOrderBanner />

      {banner?.enabled && (
        <NoticeBar
          color="info"
          content={banner.title ? `${banner.title} · ${banner.content}` : banner.content}
          icon={null}
        />
      )}

      <PullToRefresh onRefresh={load}>
        <div className="p-3 space-y-3">
          {loading ? (
            <>
              <Skeleton.Title animated />
              <Skeleton.Paragraph lineCount={3} animated />
              <Skeleton.Title animated />
              <Skeleton.Paragraph lineCount={3} animated />
            </>
          ) : error ? (
            <Empty description={error} />
          ) : tuans.length === 0 ? (
            <Empty description="暂无进行中的团" />
          ) : (
            tuans.map((t) => <TuanCard key={t._id} tuan={t} tick={tick} onClick={() => nav(`/tuan/${t._id}`)} />)
          )}
        </div>
      </PullToRefresh>
    </div>
  );
}

function TuanCard({ tuan, tick, onClick }: { tuan: Tuan; tick: number; onClick: () => void }) {
  void tick;
  const cd = getCountdown(tuan.endAt);
  const status = STATUS_LABEL[tuan.status];
  return (
    <div
      className="bg-white rounded-lg overflow-hidden shadow-sm active:opacity-80"
      onClick={onClick}
    >
      {tuan.coverFileId && (
        <Image
          src={tuan.coverFileId}
          width="100%"
          height={180}
          fit="cover"
          lazy
        />
      )}
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="font-medium text-base flex-1 line-clamp-2">{tuan.title}</div>
          <Tag color={status.color} fill="outline">{status.text}</Tag>
        </div>
        <div className="text-gray-500 text-xs mt-2 line-clamp-1">{tuan.description}</div>
        <div className="flex justify-between items-center mt-2">
          <div className="text-xs text-gray-400">商品 {tuan.productCount} 件</div>
          {tuan.status === 'on_sale' && !cd.ended && (
            <div className="text-xs text-brand">
              {cd.days > 0 ? `剩余 ${cd.days} 天 ` : ''}
              {String(cd.hours).padStart(2, '0')}:
              {String(cd.minutes).padStart(2, '0')}:
              {String(cd.seconds).padStart(2, '0')}
            </div>
          )}
          {tuan.status === 'closed' && <div className="text-xs text-gray-400">已结束</div>}
        </div>
      </div>
    </div>
  );
}
