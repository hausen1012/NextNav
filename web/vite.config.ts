import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// The dev server proxies the single /api namespace to the Go service; in
// production one Go binary serves both the SPA and the API.
const backendPort = process.env.PORT || '8787'
const backend = `http://127.0.0.1:${backendPort}`

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    // Bind IPv4 explicitly: on Windows, plain `localhost` can end up listening
    // only on ::1, which makes http://127.0.0.1:5173 unreachable.
    host: '127.0.0.1',
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