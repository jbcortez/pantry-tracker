/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

/** Serves api/*.ts in `npm run dev` with the same handlers Vercel runs in production. */
function devApi(): Plugin {
  return {
    name: 'dev-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const match = req.url?.match(/^\/api\/([a-z-]+)(\?.*)?$/)
        if (!match) return next()
        // Let local API handlers see .env.local (e.g. ANTHROPIC_API_KEY), as Vercel would.
        Object.assign(process.env, { ...loadEnv(server.config.mode, process.cwd(), ''), ...process.env })
        try {
          const mod = await server.ssrLoadModule(`/api/${match[1]}.ts`)
          const handler = mod[req.method ?? 'GET']
          if (typeof handler !== 'function') {
            res.statusCode = 405
            return res.end()
          }
          const chunks: Buffer[] = []
          for await (const chunk of req) chunks.push(chunk as Buffer)
          const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(chunks)
          const request = new Request(`http://${req.headers.host}${req.url}`, {
            method: req.method,
            headers: req.headers as Record<string, string>,
            body,
          })
          const response: Response = await handler(request)
          res.statusCode = response.status
          response.headers.forEach((v, k) => res.setHeader(k, v))
          res.end(Buffer.from(await response.arrayBuffer()))
        } catch (err) {
          next(err)
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [
    devApi(),
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
  },
  test: {
    environment: 'node',
  },
})
