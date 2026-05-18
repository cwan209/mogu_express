import { callCloud } from './client';

export async function registerProfile(payload: { groupId: string }): Promise<{ code: 0 }> {
  return callCloud('registerProfile', payload);
}

export interface WxUserProfile {
  nickname: string | null;
  avatar: string | null;
  sex: 0 | 1 | 2 | null;
  country: string | null;
  province: string | null;
  city: string | null;
  language: string | null;
}

export interface WxLoginRes {
  code: 0;
  token: string;
  openid: string;
  isRegistered: boolean;
  user?: {
    name?: string;       // legacy
    phone?: string;      // legacy
    groupId?: string;
    wechat?: WxUserProfile | null;
  };
}

export async function wxLogin(code: string): Promise<WxLoginRes> {
  return callCloud<WxLoginRes>('wxLogin', { code });
}
