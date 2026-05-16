/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
  readonly VITE_WECHAT_APP_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
