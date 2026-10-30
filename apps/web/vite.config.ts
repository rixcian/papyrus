import { execSync } from 'node:child_process'
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

/** The commit it was built from, or the build date where there is no git (a Docker build). */
function appVersion(): string {
  const date = new Date().toISOString().slice(0, 10)
  try {
    return `${execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()} (${date})`
  } catch {
    return date
  }
}

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(process.env.PAPYRUS_VERSION ?? appVersion()) },
  plugins: [
    react(),
    tailwindcss(),
    // Ticket 05: our own service worker (injectManifest), and the app asks before updating.
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'prompt',
      injectRegister: false,
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
      manifest: {
        name: 'Papyrus',
        short_name: 'Papyrus',
        description: 'Your ebook library and reader',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#1c1917',
        theme_color: '#1c1917',
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/pwa-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
          { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
    }),
  ],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  server: { proxy: { '/api': 'http://localhost:8080' } },
})
