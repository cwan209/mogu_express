// web-admin/src/api/upload.ts
//
// 图片上传封装。
//   - 真实模式(USE_MOCK=false):File → base64 → 调 _admin/uploadImage → 返回公网 URL
//   - Mock 模式(USE_MOCK=true):URL.createObjectURL(file) 生成 blob:URL,仅当前浏览器会话可见
//     这种 URL 刷新页面就丢。ImageUploader 的 onFinish 守卫会拦截 blob: 前缀提交。

import { callCloud, USE_MOCK } from './client';

export type UploadPurpose = 'tuan_cover' | 'product_cover' | 'product_image';

export const MAX_SIZE_BYTES = 3 * 1024 * 1024;
export const ALLOWED_MIMES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error('read file failed'));
    r.onload = () => {
      const res = r.result as string;
      // 剥 data:...;base64, 前缀
      const idx = res.indexOf('base64,');
      resolve(idx >= 0 ? res.slice(idx + 7) : res);
    };
    r.readAsDataURL(file);
  });
}

export interface UploadResult {
  url: string;
  key?: string;
  /** Mock 模式下为 true,blob URL,刷新丢失 */
  isBlob?: boolean;
}

export async function uploadImage(file: File, purpose: UploadPurpose): Promise<UploadResult> {
  if (!ALLOWED_MIMES.includes(file.type)) {
    throw new Error('仅支持 png / jpg / webp / gif');
  }
  if (file.size > MAX_SIZE_BYTES) {
    throw new Error(`文件过大(>${MAX_SIZE_BYTES / 1024 / 1024}MB)`);
  }

  if (USE_MOCK) {
    // mock 模式不走 callCloud,避免大 base64 序列化 + localStorage 溢出
    const url = URL.createObjectURL(file);
    // eslint-disable-next-line no-console
    console.warn('[uploadImage] mock 模式返回 blob URL,刷新页面即失效:', url);
    return { url, isBlob: true };
  }

  const fileBase64 = await fileToBase64(file);
  const res = await callCloud<{ url: string; key: string }>('_admin/uploadImage', {
    fileBase64,
    mimeType: file.type,
    fileName: file.name,
    purpose,
  });
  return { url: res.url, key: res.key };
}
