import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 端口 5174 避开 web-admin(5173)
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/cloud': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
