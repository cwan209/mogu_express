import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from './store/auth';
import Home from './pages/Home';
import TuanDetail from './pages/TuanDetail';
import ProductDetail from './pages/ProductDetail';
import Cart from './pages/Cart';
import Checkout from './pages/Checkout';
import PayResult from './pages/PayResult';
import Orders from './pages/Orders';
import OrderDetail from './pages/OrderDetail';
import Profile from './pages/Profile';
import Addresses from './pages/Addresses';
import Login from './pages/Login';
import RegisterProfile from './pages/RegisterProfile';

function Protected({ children }: { children: JSX.Element }) {
  const token = useAuthStore((s) => s.token);
  const isRegistered = useAuthStore((s) => s.isRegistered);
  const loc = useLocation();
  if (!token) {
    const ret = encodeURIComponent(loc.pathname + loc.search);
    return <Navigate to={`/login?returnTo=${ret}`} replace />;
  }
  if (!isRegistered && loc.pathname !== '/register-profile') {
    const ret = encodeURIComponent(loc.pathname + loc.search);
    return <Navigate to={`/register-profile?returnTo=${ret}`} replace />;
  }
  return children;
}

export default function App() {
  return (
    <Routes>
      {/* 游客可访问 */}
      <Route path="/" element={<Home />} />
      <Route path="/tuan/:id" element={<TuanDetail />} />
      <Route path="/product/:id" element={<ProductDetail />} />
      <Route path="/cart" element={<Cart />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register-profile" element={<RegisterProfile />} />

      {/* 需登录 */}
      <Route path="/checkout" element={<Protected><Checkout /></Protected>} />
      <Route path="/pay-result/:orderId" element={<Protected><PayResult /></Protected>} />
      <Route path="/orders" element={<Protected><Orders /></Protected>} />
      <Route path="/orders/:id" element={<Protected><OrderDetail /></Protected>} />
      <Route path="/profile" element={<Protected><Profile /></Protected>} />
      <Route path="/addresses" element={<Protected><Addresses /></Protected>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
