import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

// Vite 配置
// - HTTPS：浏览器要求 HTTPS 才能访问摄像头
// - host: '0.0.0.0' 让手机能在同一WiFi下访问
// - optimizeDeps: mind-ar有CommonJS依赖，需要预构建
export default defineConfig({
  plugins: [basicSsl()],
  server: {
    https: true,
    host: '0.0.0.0',
    port: 5173,
  },
  optimizeDeps: {
    include: ['mind-ar', 'three'],
  },
  build: {
    target: 'es2018',
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },
  },
});
