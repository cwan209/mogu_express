import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { NavBar, Tabs, Empty, Tag, Image, PullToRefresh, Button } from 'antd-mobile';
import { listMyOrders } from '../api/order';
import { formatCny } from '../utils/money';
import { formatTime } from '../utils/date';
import type { Order, OrderStatus } from '../types';

const STATUS_LABEL: Record<OrderStatus, string> = {
  pending_pay: '待支付',
  paid: '已支付',
  refund_requested: '退款申请中',
  shipped: '已发货',
  completed: '已完成',
  cancelled: '已取消',
  refunded: '已退款',
};

const STATUS_COLOR: Record<OrderStatus, string> = {
  pending_pay: 'warning',
  paid: 'success',
  refund_requested: 'warning',
  shipped: 'primary',
  completed: 'default',
  cancelled: 'default',
  refunded: 'danger',
};

const TABS: Array<{ key: string; title: string; status?: OrderStatus }> = [
  { key: 'all', title: '全部' },
  { key: 'pending_pay', title: '待支付', status: 'pending_pay' },
  { key: 'paid', title: '已支付', status: 'paid' },
  { key: 'shipped', title: '已发货', status: 'shipped' },
];

export default function Orders() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const filter = params.get('filter'); // 'pending_shipping' 时只显示待付运费
  const [tab, setTab] = useState('all');
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const t = TABS.find((x) => x.key === tab);
      const list = await listMyOrders(t?.status ? { status: t.status } : {});
      setOrders(list);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [tab]);

  const displayOrders = useMemo(() => {
    if (filter === 'pending_shipping') {
      return orders.filter((o) => o.shippingFee?.payStatus === 'pending');
    }
    return orders;
  }, [orders, filter]);

  return (
    <div className="min-h-screen bg-gray-100">
      <NavBar back={null}>我的订单</NavBar>

      <Tabs activeKey={tab} onChange={setTab}>
        {TABS.map((t) => (
          <Tabs.Tab key={t.key} title={t.title} />
        ))}
      </Tabs>

      <PullToRefresh onRefresh={load}>
        <div className="p-2 space-y-2">
          {loading ? null : displayOrders.length === 0 ? (
            <Empty description="暂无订单" />
          ) : (
            displayOrders.map((o) => {
              const pendingShip = o.shippingFee?.payStatus === 'pending';
              return (
                <div
                  key={o._id}
                  className="bg-white rounded p-3 active:opacity-80"
                  onClick={() => nav(`/orders/${o._id}`)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-gray-400">{formatTime(o.createdAt)}</span>
                    <Tag color={STATUS_COLOR[o.status]}>{STATUS_LABEL[o.status]}</Tag>
                  </div>
                  <div className="space-y-1">
                    {o.items.slice(0, 2).map((it) => (
                      <div key={it.tuanItemId || it.productId} className="flex items-center gap-2">
                        <Image src={it.coverFileId} width={40} height={40} fit="cover" />
                        <div className="flex-1 min-w-0 text-sm line-clamp-1">{it.title}</div>
                        <div className="text-xs text-gray-500">×{it.quantity}</div>
                      </div>
                    ))}
                    {o.items.length > 2 && (
                      <div className="text-xs text-gray-400">等 {o.items.length} 件商品</div>
                    )}
                  </div>
                  <div className="flex justify-end mt-2 text-brand font-medium">
                    {formatCny(o.amount)}
                  </div>
                  {pendingShip && o.shippingFee && (
                    <div
                      className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Tag color="warning">
                        待付运费 {formatCny(o.shippingFee.amount)}
                      </Tag>
                      <Button
                        size="mini"
                        color="warning"
                        onClick={() => nav(`/pay-shipping/${o._id}`)}
                      >
                        去支付
                      </Button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </PullToRefresh>
    </div>
  );
}
