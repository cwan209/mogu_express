import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Tuans from './pages/Tuans';
import TuanEdit from './pages/TuanEdit';
import Products from './pages/Products';
import ProductEdit from './pages/ProductEdit';
import Categories from './pages/Categories';
import Orders from './pages/Orders';
import OrderDetail from './pages/OrderDetail';
import Settings from './pages/Settings';
import RequireAuth from './auth/RequireAuth';
import AppShell from './layout/AppShell';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />

        <Route path="/tuans" element={<Tuans />} />
        <Route path="/tuans/:id" element={<TuanEdit />} />

        <Route path="/products" element={<Products />} />
        <Route path="/products/:id" element={<ProductEdit />} />

        <Route path="/categories" element={<Categories />} />

        <Route path="/orders" element={<Orders />} />
        <Route path="/orders/:id" element={<OrderDetail />} />

        <Route path="/settings" element={<Settings />} />
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
