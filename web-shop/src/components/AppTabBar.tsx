import { useEffect, useState } from 'react';
import { TabBar } from 'antd-mobile';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  AppOutline,
  UnorderedListOutline,
  ShopbagOutline,
  UserOutline,
} from 'antd-mobile-icons';
import { useCartStore } from '../store/cart';
import { useAuthStore } from '../store/auth';
import { getPendingOrders } from '../api/order';

export default function AppTabBar() {
  const loc = useLocation();
  const nav = useNavigate();
  const cartQty = useCartStore((s) => s.items.reduce((a, it) => a + it.quantity, 0));
  const token = useAuthStore((s) => s.token);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const r = await getPendingOrders();
        setPendingCount(r.length);
      } catch {
        // 静默 — 拉不到不打扰用户
      }
    })();
  }, [token]);

  const tabs = [
    { key: '/',        title: '首页',   icon: <AppOutline /> },
    { key: '/cart',    title: '购物车', icon: <ShopbagOutline />, badge: cartQty > 0 ? String(cartQty) : undefined },
    { key: '/orders',  title: '订单',   icon: <UnorderedListOutline />, badge: pendingCount > 0 ? String(pendingCount) : undefined },
    { key: '/profile', title: '我的',   icon: <UserOutline /> },
  ];

  const activeKey =
    tabs.find((t) => (t.key === '/' ? loc.pathname === '/' : loc.pathname.startsWith(t.key)))?.key || '/';

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 max-w-[480px] mx-auto z-50">
      <TabBar activeKey={activeKey} onChange={(k) => nav(k)} safeArea>
        {tabs.map((t) => (
          <TabBar.Item key={t.key} icon={t.icon} title={t.title} badge={t.badge} />
        ))}
      </TabBar>
    </div>
  );
}
