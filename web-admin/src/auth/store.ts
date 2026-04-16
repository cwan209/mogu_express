import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface AdminInfo {
  id: string;
  username: string;
  role: string;
}

interface AuthState {
  token: string | null;
  admin: AdminInfo | null;
  setAuth: (token: string, admin: AdminInfo) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      admin: null,
      setAuth: (token, admin) => set({ token, admin }),
      logout: () => {
        set({ token: null, admin: null });
        // 回跳登录页(调用方若在 React 组件内可用 useNavigate 更优)
        if (typeof window !== 'undefined' && window.location) {
          window.location.href = '/login';
        }
      },
    }),
    {
      name: 'mogu_express_admin_auth',
    }
  )
);
