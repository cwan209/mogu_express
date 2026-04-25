import { Layout, Menu, Button, theme } from 'antd';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../auth/store';

const { Header, Sider, Content } = Layout;

// 将 /tuans/xxx、/products/yyy 等子路由 映射到顶层菜单 key
function matchTopKey(pathname: string): string {
  if (pathname.startsWith('/tuans'))      return '/tuans';
  if (pathname.startsWith('/products'))   return '/products';
  if (pathname.startsWith('/categories')) return '/categories';
  if (pathname.startsWith('/orders'))     return '/orders';
  if (pathname.startsWith('/settings'))   return '/settings';
  return '/dashboard';
}

export default function AppShell() {
  const nav = useNavigate();
  const loc = useLocation();
  const logout = useAuthStore((s) => s.logout);
  const admin = useAuthStore((s) => s.admin);
  const { token } = theme.useToken();

  const menuItems = [
    { key: '/dashboard', label: '仪表盘' },
    { key: '/tuans',     label: '团管理' },
    { key: '/products',  label: '商品' },
    { key: '/categories',label: '分类' },
    { key: '/orders',    label: '订单' },
    { key: '/settings',  label: '站点设置' },
  ];

  return (
    <Layout style={{ height: '100vh' }}>
      <Sider width={200} style={{ background: '#fff' }}>
        <div
          style={{
            height: 56,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: 18,
            color: token.colorPrimary,
            borderBottom: '1px solid #f0f0f0',
          }}
        >
          接龙团购 · 后台
        </div>
        <Menu
          mode="inline"
          selectedKeys={[matchTopKey(loc.pathname)]}
          items={menuItems}
          onClick={(e) => nav(e.key)}
        />
      </Sider>

      <Layout>
        <Header
          style={{
            background: '#fff',
            padding: '0 24px',
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            borderBottom: '1px solid #f0f0f0',
          }}
        >
          <span style={{ marginRight: 16, color: '#666' }}>
            {admin ? `${admin.username} (${admin.role})` : ''}
          </span>
          <Button size="small" onClick={logout}>退出</Button>
        </Header>

        <Content style={{ padding: 24, overflow: 'auto' }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
