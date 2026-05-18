import { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from './store/auth';
import { useCartStore } from './store/cart';
import { getCart } from './api/order';
import { isWechatBrowser, redirectToWechatAuth } from './utils/wechat';
import AppTabBar from './components/AppTabBar';
import Home from './pages/Home';
import TuanDetail from './pages/TuanDetail';
import ProductDetail from './pages/ProductDetail';
import Cart from './pages/Cart';
import Checkout from './pages/Checkout';
import PayResult from './pages/PayResult';
import PayShipping from './pages/PayShipping';
import Orders from './pages/Orders';
import OrderDetail from './pages/OrderDetail';
import Profile from './pages/Profile';
import MyCoupons from './pages/MyCoupons';
import Addresses from './pages/Addresses';
import RegisterProfile from './pages/RegisterProfile';
import Poster from './pages/Poster';
import OauthCallback from './pages/OauthCallback';
import QrFallback from './pages/QrFallback';
import PendingShipping from './pages/PendingShipping';

function WithTabBar({ children }: { children: JSX.Element }) {
  return (
    <>
      <div className="pb-14">{children}</div>
      <AppTabBar />
    </>
  );
}

function Protected({ children }: { children: JSX.Element }) {
  const token = useAuthStore((s) => s.token);
  const isRegistered = useAuthStore((s) => s.isRegistered);
  const loc = useLocation();
  if (!token) {
    return <Navigate to="/qr-fallback" replace />;
  }
  if (!isRegistered && loc.pathname !== '/register-profile') {
    const ret = encodeURIComponent(loc.pathname + loc.search);
    return <Navigate to={`/register-profile?returnTo=${ret}`} replace />;
  }
  return children;
}

export default function App() {
  const token = useAuthStore((s) => s.token);
  const hydrateCart = useCartStore((s) => s.hydrateFromServer);
  const loc = useLocation();

  useEffect(() => {
    // 已经在 oauth-callback / qr-fallback 页 → 不重复跳
    const skipPaths = ['/oauth-callback', '/qr-fallback'];
    if (skipPaths.includes(loc.pathname)) return;
    // 有 JWT → 跳过
    if (token) return;
    // URL 已带 code(防误进 callback)→ 跳过
    if (window.location.search.includes('code=')) return;

    if (isWechatBrowser()) {
      // 在微信里 + 没登录 → 静默 OAuth
      redirectToWechatAuth(loc.pathname + loc.search);
    }
    // 非微信 + 没登录 → 让 Protected 跳 /qr-fallback
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc.pathname, token]);

  // Cart server sync: token 0→1 时拉服务端 cart 覆盖 local;logout 时重置 synced flag
  useEffect(() => {
    if (!token) {
      // logout → 后续 cart 改动不再 push 到 server(本地 cart 保留作 guest cart)
      useCartStore.setState({ syncedFromServer: false });
      return;
    }
    getCart()
      .then(hydrateCart)
      .catch(() => {
        // 拉不到(网络/auth)— 不阻塞 app,本地 cart 照常用
        // syncedFromServer 仍为 false,下次用户操作 cart 时不会乱推
      });
  }, [token, hydrateCart]);

  return (
    <Routes>
      {/* 游客可访问 — 主 tab(底部 TabBar) */}
      <Route path="/" element={<WithTabBar><Home /></WithTabBar>} />
      <Route path="/cart" element={<WithTabBar><Cart /></WithTabBar>} />

      {/* 游客可访问 — 二级页(无 TabBar) */}
      <Route path="/tuan/:id" element={<TuanDetail />} />
      <Route path="/product/:id" element={<ProductDetail />} />
      <Route path="/register-profile" element={<RegisterProfile />} />
      <Route path="/share/poster/:type/:id" element={<Poster />} />
      <Route path="/oauth-callback" element={<OauthCallback />} />
      <Route path="/qr-fallback" element={<QrFallback />} />

      {/* 需登录 — 主 tab */}
      <Route path="/orders" element={<Protected><WithTabBar><Orders /></WithTabBar></Protected>} />
      <Route path="/profile" element={<Protected><WithTabBar><Profile /></WithTabBar></Protected>} />

      {/* 需登录 — 二级页 */}
      <Route path="/checkout" element={<Protected><Checkout /></Protected>} />
      <Route path="/pay-result/:orderId" element={<Protected><PayResult /></Protected>} />
      <Route path="/pay-shipping/:id" element={<Protected><PayShipping /></Protected>} />
      <Route path="/pending-shipping" element={<Protected><WithTabBar><PendingShipping /></WithTabBar></Protected>} />
      <Route path="/orders/:id" element={<Protected><OrderDetail /></Protected>} />
      <Route path="/addresses" element={<Protected><Addresses /></Protected>} />
      <Route path="/coupons" element={<Protected><WithTabBar><MyCoupons /></WithTabBar></Protected>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
