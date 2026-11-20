import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // 部署到 GitHub Pages 项目页时为 /attendance-app/；本地开发默认 /
  // 用布尔开关而非路径字符串，避免 Windows Git Bash 对前导 / 的路径转换
  base: process.env.GITHUB_PAGES === 'true' ? '/attendance-app/' : '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon-192.svg', 'icon-512.svg'],
      manifest: {
        name: '员工考勤系统',
        short_name: '考勤',
        description: '基于授权的员工位置考勤系统',
        theme_color: '#0a7cff',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icon-192.svg', sizes: '192x192', type: 'image/svg+xml' },
          { src: '/icon-512.svg', sizes: '512x512', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,ico}'],
        // config.js 必须每次走网络，否则改了后端地址也被离线缓存挡住
        globIgnores: ['**/config.js'],
        navigateFallback: '/index.html',
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
