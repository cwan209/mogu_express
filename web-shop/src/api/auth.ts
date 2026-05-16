import { callCloud } from './client';

export interface SendOtpRes {
  code: 0;
  expiresIn: number;
}

export interface VerifyOtpRes {
  code: 0;
  token: string;
  openid: string;
  isRegistered: boolean;
  user?: { name?: string; phone?: string };
}

export async function sendOtp(phone: string): Promise<SendOtpRes> {
  return callCloud<SendOtpRes>('sendOtp', { phone });
}

export async function verifyOtp(phone: string, otp: string): Promise<VerifyOtpRes> {
  return callCloud<VerifyOtpRes>('verifyOtp', { phone, otp });
}

export async function registerProfile(payload: {
  name: string;
  phone: string;
  address?: {
    recipient: string;
    phone: string;
    line1: string;
    line2?: string;
    suburb: string;
    state: string;
    postcode: string;
  };
}): Promise<{ code: 0 }> {
  return callCloud('registerProfile', payload);
}

export interface WxLoginRes {
  code: 0;
  token: string;
  openid: string;
  isRegistered: boolean;
  user?: { name?: string; phone?: string };
}

export async function wxLogin(code: string): Promise<WxLoginRes> {
  return callCloud<WxLoginRes>('wxLogin', { code });
}
