// store/auth.ts - JWT + 用户态
//
// 持久化:localStorage(`web-shop.auth.v1`)
// 后端鉴权:服务器签 JWT 后,所有请求通过 callCloud 自动带上 token
// 注销:清 token + 跳 /login

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface WxProfile {
  nickname: string | null;
  avatar: string | null;
  sex: 0 | 1 | 2 | null;
  country: string | null;
  province: string | null;
  city: string | null;
  language: string | null;
}

interface UserProfile {
  openid: string;
  name?: string;            // legacy,新代码不写
  phone?: string;           // legacy
  groupId?: string;         // OAuth 用户的群号
  /** 微信公众号 OAuth (snsapi_userinfo) 拉到的资料,null = 走 OTP 流程没有 */
  wechat?: WxProfile | null;
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
