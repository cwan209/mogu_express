// store/auth.ts - JWT + 用户态
//
// 持久化:localStorage(`web-shop.auth.v1`)
// 后端鉴权:服务器签 JWT 后,所有请求通过 callCloud 自动带上 token
// 注销:清 token + 跳 /login

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UserProfile {
  openid: string;
  name?: string;
  phone?: string;
}

interface AuthState {
  token: string | null;
  user: UserProfile | null;
  isRegistered: boolean;   // false → 强制走 /register-profile
  setAuth: (token: string, user: UserProfile, isRegistered: boolean) => void;
  updateUser: (patch: Partial<UserProfile>) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      isRegistered: false,
      setAuth: (token, user, isRegistered) => set({ token, user, isRegistered }),
      updateUser: (patch) =>
        set((s) => ({ user: s.user ? { ...s.user, ...patch } : null })),
      logout: () => set({ token: null, user: null, isRegistered: false }),
    }),
    {
      name: 'web-shop.auth.v1',
    },
  ),
);
