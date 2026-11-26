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
        type: 'module',
        navigateFallback: '/index.html',
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
          {
            src: '/nextnav-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/nextnav-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,ico,png,woff2}'],
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