import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'node:path'

// The dev server proxies the single /api namespace to the Go service; in
// production one Go binary serves both the SPA and the API.
const backendPort = process.env.PORT || '8787'
const backend = `http://127.0.0.1:${backendPort}`

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: {
        enabled: true,
      },
      manifest: {
        name: 'NextNav',
        short_name: 'NextNav',
        description: '极速个人专属导航站',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,ico,woff2}'],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/icons\//],
        runtimeCaching: [
          {
            // 导航主数据：采用 CacheFirst 策略，1 小时内完全走本地缓存，不向后端发网络请求
            urlPattern: ({ url }) => url.pathname === '/api/home' && !url.searchParams.has('nocache'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'api-home-cache',
              cacheableResponse: {
                statuses: [0, 200],
              },
              expiration: {
                maxEntries: 1,
                maxAgeSeconds: 60 * 60, // 1 小时内免请求
              },
            },
          },
          {
            // 身份状态：采用 CacheFirst 策略，1 小时内完全走本地缓存
            urlPattern: ({ url }) => url.pathname === '/api/me' && !url.searchParams.has('nocache'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'api-me-cache',
              cacheableResponse: {
                statuses: [0, 200],
              },
              expiration: {
                maxEntries: 1,
                maxAgeSeconds: 60 * 60, // 1 小时内免请求
              },
            },
          },
          {
            // 站点图标：采用 CacheFirst 策略，30 天内直接使用本地缓存，避免打开新标签页重复请求图标
            urlPattern: ({ url }) => url.pathname.startsWith('/icons/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'site-icons-cache',
              cacheableResponse: {
                statuses: [0, 200],
              },
              expiration: {
                maxEntries: 500,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 天
              },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    // 监听 0.0.0.0，使本机与局域网/其他 IP 均可访问
    host: process.env.WEB_HOST || '0.0.0.0',
    port: Number(process.env.WEB_PORT) || 5173,
    proxy: {
      '/api': { target: backend, changeOrigin: false },
      '/icons': { target: backend, changeOrigin: false },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})