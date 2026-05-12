// api/client.ts - H5 商城统一 API 入口
//
// 开发期:Vite proxy 把 /cloud/* 转发到 http://localhost:4000
// 生产期:VITE_API_BASE 指向 https://api.xxx.com,直接 POST

import axios from 'axios';
import { useAuthStore } from '../store/auth';

const API_BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');

const http = axios.create({
  baseURL: API_BASE,
  timeout: 20_000,
});

export interface CloudError extends Error {
  code: number;
}

export async function callCloud<T = any>(name: string, data: any = {}): Promise<T> {
  const token = useAuthStore.getState().token;
  const body = token ? { ...data, token } : data;
  try {
    const res = await http.post(`/cloud/${name}`, body);
    const r = res.data;
    if (r && typeof r === 'object' && 'code' in r && r.code !== 0) {
      throw Object.assign(new Error(r.message || `cloud error: ${name}`), { code: r.code }) as CloudError;
    }
    return r as T;
  } catch (err: any) {
    if (err.response?.status === 401 || err.code === 401) {
      useAuthStore.getState().logout();
    }
    throw err;
  }
}
