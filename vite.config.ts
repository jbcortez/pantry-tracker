/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Pantry',
        short_name: 'Pantry',
        description: 'Know what’s in your kitchen.',
        theme_color: '#15803d',
        background_color: '#f6f7f5',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Include the barcode decoder so scanning works offline.
        globPatterns: ['**/*.{js,css,html,svg,png,wasm}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  server: {
    host: true,
    proxy: {
      // Same response shape as api/upc.ts on Vercel.
      '/api/upc': {
        target: 'https://api.upcitemdb.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/upc/, '/prod/trial/lookup'),
      },
    },
  },
  test: {
    environment: 'node',
  },
})
