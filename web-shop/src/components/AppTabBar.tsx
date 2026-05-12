import { TabBar } from 'antd-mobile';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  AppOutline,
  UnorderedListOutline,
  ShopbagOutline,
  UserOutline,
} from 'antd-mobile-icons';

const TABS = [
  { key: '/',        title: '首页',   icon: <AppOutline /> },
  { key: '/cart',    title: '购物车', icon: <ShopbagOutline /> },
  { key: '/orders',  title: '订单',   icon: <UnorderedListOutline /> },
  { key: '/profile', title: '我的',   icon: <UserOutline /> },
];

export default function AppTabBar() {
  const loc = useLocation();
  const nav = useNavigate();

  // 选中态:精确匹配 / 或前缀匹配
  const activeKey =
    TABS.find((t) => (t.key === '/' ? loc.pathname === '/' : loc.pathname.startsWith(t.key)))?.key || '/';

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 max-w-[480px] mx-auto z-50">
      <TabBar activeKey={activeKey} onChange={(k) => nav(k)} safeArea>
        {TABS.map((t) => (
          <TabBar.Item key={t.key} icon={t.icon} title={t.title} />
        ))}
      </TabBar>
    </div>
  );
}
