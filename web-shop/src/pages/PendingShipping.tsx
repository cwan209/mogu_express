import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { NavBar, Button, Empty, Skeleton } from 'antd-mobile';
import { getPendingOrders, type PendingOrder } from '../api/order';
import { formatCny } from '../utils/money';

export default function PendingShipping() {
  const nav = useNavigate();
  const [orders, setOrders] = useState<PendingOrder[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      setOrders(await getPendingOrders());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const totalDue = orders.reduce((s, o) => s + o.shippingFee.amount, 0);

  return (
    <div className="min-h-screen bg-gray-100 pb-16">
      <NavBar onBack={() => nav(-1)}>待付尾款</NavBar>

      {!loading && orders.length > 0 && (
        <div className="bg-orange-50 border-b border-orange-200 p-3 text-orange-700 text-sm">
          共 <b>{orders.length}</b> 单待付运费,合计 <b>{formatCny(totalDue)}</b>
        </div>
      )}

      <div className="p-3 space-y-3">
        {loading ? (
          <>
            <Skeleton.Title animated />
            <Skeleton.Paragraph lineCount={3} animated />
            <Skeleton.Title animated />
            <Skeleton.Paragraph lineCount={3} animated />
          </>
        ) : orders.length === 0 ? (
          <Empty description="暂无待付尾款的订单" />
        ) : (
          orders.map((o) => (
            <div
              key={o._id}
              className="bg-white rounded-lg p-3"
              style={{ borderRadius: 8 }}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs text-gray-500">订单 {o.orderNo}</div>
                <div className="text-xs text-gray-400">
                  {new Date(o.shippingFee.setAt).toLocaleDateString('zh-CN')}
                </div>
              </div>
              {o.items && o.items.length > 0 && (
                <div className="text-sm text-gray-700 mb-2 line-clamp-2">
                  {o.items
                    .slice(0, 2)
                    .map((it) => `${it.title} ×${it.quantity}`)
                    .join(', ')}
                  {o.items.length > 2 && ` 等 ${o.items.length} 件`}
                </div>
              )}
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-gray-500">待付运费</div>
                  <div className="text-orange-600 font-medium text-lg">
                    {formatCny(o.shippingFee.amount)}
                  </div>
                </div>
                <Button
                  color="primary"
                  size="small"
                  onClick={() => nav(`/pay-shipping/${o._id}`)}
                >
                  立即支付
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
