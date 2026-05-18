import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { NavBar, Tabs, Empty, Skeleton } from 'antd-mobile';
import { listMyCoupons } from '../api/coupon';
import type { Coupon, CouponStatus } from '../types';
import { formatCny } from '../utils/money';

const STATUS_TABS: { key: CouponStatus; label: string }[] = [
  { key: 'unused', label: '未使用' },
  { key: 'used', label: '已使用' },
  { key: 'expired', label: '已过期' },
];

export default function MyCoupons() {
  const nav = useNavigate();
  const [active, setActive] = useState<CouponStatus>('unused');
  const [data, setData] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async (status: CouponStatus) => {
    setLoading(true);
    try {
      setData(await listMyCoupons(status));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(active); }, [active]);

  return (
    <div className="min-h-screen bg-gray-100 pb-4">
      <NavBar onBack={() => nav(-1)}>我的优惠券</NavBar>
      <Tabs activeKey={active} onChange={(k) => setActive(k as CouponStatus)}>
        {STATUS_TABS.map((t) => (
          <Tabs.Tab key={t.key} title={t.label} />
        ))}
      </Tabs>
      <div className="p-3 space-y-2">
        {loading ? (
          <>
            <Skeleton.Title animated />
            <Skeleton.Paragraph lineCount={2} animated />
          </>
        ) : data.length === 0 ? (
          <Empty description="暂无优惠券" />
        ) : (
          data.map((c) => (
            <div
              key={c._id}
              className={`bg-white p-3 rounded-lg flex items-center gap-3 ${c.status !== 'unused' ? 'opacity-60' : ''}`}
            >
              <div className="text-2xl text-brand font-bold flex-shrink-0">
                {formatCny(c.amount)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm">{c.reason || '优惠券'}</div>
                <div className="text-xs text-gray-500 mt-1">
                  {c.validFrom.slice(0, 10)} ~ {c.validTo.slice(0, 10)}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
