import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Button } from 'antd-mobile';
import { getPendingOrders, type PendingOrder } from '../api/order';
import { useAuthStore } from '../store/auth';

const DISMISS_KEY = 'pending_banner_dismissed_at';

export default function PendingOrderBanner() {
  const nav = useNavigate();
  const token = useAuthStore((s) => s.token);
  const [orders, setOrders] = useState<PendingOrder[]>([]);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const r = await getPendingOrders();
        setOrders(r);
      } catch {
        // 静默 — 拿不到不打扰用户
      }
    })();
  }, [token]);

  if (!orders.length) return null;

  // dismiss 状态:同一天内只弹一次(用户点 dismiss 后不再弹,但红点在订单页仍显示)
  const dismissedAt = localStorage.getItem(DISMISS_KEY);
  const today = new Date().toISOString().slice(0, 10);
  if (dismissedAt === today) return null;

  const total = orders.reduce((s, o) => s + o.shippingFee.amount, 0);

  return (
    <Card style={{ margin: 12, background: '#FFF7E6', border: '1px solid #FFD591' }}>
      <div style={{ color: '#FA8C16', fontWeight: 'bold', marginBottom: 8 }}>
        ⚠️ 您有 {orders.length} 个订单待付运费 ¥{(total / 100).toFixed(2)}
      </div>
      <div style={{ marginBottom: 12, fontSize: 14, color: '#666' }}>
        {orders.slice(0, 3).map((o) => (
          <div key={o._id}>
            订单 {o.orderNo.slice(-6)}:¥{(o.shippingFee.amount / 100).toFixed(2)}
          </div>
        ))}
        {orders.length > 3 && <div>...共 {orders.length} 单</div>}
      </div>
      <Button
        color="warning"
        block
        size="small"
        onClick={() => {
          if (orders.length === 1) {
            nav(`/pay-shipping/${orders[0]._id}`);
          } else {
            nav('/pending-shipping');
          }
        }}
      >
        立即支付
      </Button>
      <Button
        block
        size="mini"
        fill="none"
        style={{ marginTop: 8 }}
        onClick={() => {
          localStorage.setItem(DISMISS_KEY, today);
          setOrders([]);
        }}
      >
        今天不再提醒
      </Button>
    </Card>
  );
}
