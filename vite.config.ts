import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
  const baseEnv = loadEnv('', '.', '');        // .env.local — untuk proxy target (selalu full URL)
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        workbox: {
          cleanupOutdatedCaches: true,
          // SW baru langsung aktif & ambil alih semua tab → update (kode, index.html,
          // viewport meta) nyampai dalam 1 reload, bukan nunggu semua tab ketutup.
          skipWaiting: true,
          clientsClaim: true,
          globPatterns: ['**/*.{js,css,html,woff2}'],
          navigateFallback: 'index.html',
          navigateFallbackDenylist: [/^\/api\//],
          runtimeCaching: [
            {
              // Supabase: NetworkOnly — jangan pernah cache, selalu fresh.
              // Dicocokkan lewat POLA PATH, bukan nama host, supaya tetap benar saat
              // Supabase pindah ke self-host (mis. db.dash5.my.id atau dash5.my.id/rest/v1).
              // Self-hosted Supabase selalu mengekspos /rest/v1, /auth/v1, /storage/v1,
              // /realtime/v1 — sama seperti cloud.
              // ⚠️ Anchor `^https://[^/]+` WAJIB: Workbox hanya menerapkan regex ke request
              // lintas-origin kalau kecocokannya dimulai dari AWAL URL. Pola path telanjang
              // (mis. /\/rest\/v1\//) akan diam-diam tidak berlaku untuk host lain.
              urlPattern: /^https:\/\/[^/]+\/(rest|auth|storage|realtime)\/v1\//i,
              handler: 'NetworkOnly',
            },
            {
              // Jaring pengaman: host Supabase cloud apa pun path-nya.
              urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
              handler: 'NetworkOnly',
            },
            {
              // Proxy API & streaming: NetworkOnly — POST, tidak cacheable
              urlPattern: /^https:\/\/dash5\.my\.id\/(api|v1)\//i,
              handler: 'NetworkOnly',
            },
            {
              // Google Fonts CSS + font files — CacheFirst, 1 tahun TTL
              urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts',
                expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              // App shell: hanya static assets (JS/CSS/HTML), bukan API.
              // Pengecualian rest/auth/storage/realtime DITAMBAHKAN sebagai lapis kedua:
              // kalau Supabase self-host suatu saat dilayani di PATH domain yang sama
              // (dash5.my.id/rest/v1/...), tanpa ini respons auth & data akan ter-cache
              // StaleWhileRevalidate di service worker — teknisi bisa melihat data basi
              // atau sesi milik orang lain. Aturan NetworkOnly di atas sudah menangkapnya
              // lebih dulu, ini pengaman kalau urutan aturan berubah.
              urlPattern: /^https:\/\/dash5\.my\.id\/(?!api\/|v1\/|rest\/|auth\/|storage\/|realtime\/).*/i,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'app-shell',
                expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 7 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
        },
        manifest: {
          name: 'Dash⁵ — Heavy Equipment Diagnostic',
          short_name: 'Dash⁵',
          description: 'AI-powered heavy equipment troubleshooting assistant for field technicians',
          lang: 'id',
          // theme_color WAJIB match --bg-app dark (#1A1915, palet Claude) — kalau
          // meleset, title bar / task switcher Android salah warna
          theme_color: '#1A1915',
          background_color: '#1A1915',
          display: 'standalone',
          start_url: '/',
          orientation: 'any',
          categories: ['productivity', 'utilities'],
          icons: [
            { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
      }),
    ],

    define: {},

    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },

    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      proxy: {
        '/v1': {
          target: baseEnv.VITE_VERTEX_PROXY_URL,
          changeOrigin: true,
        },
      },
    },

    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            'react-core': ['react', 'react-dom'],
            'motion':     ['motion'],
            'supabase':   ['@supabase/supabase-js'],
            'markdown':   ['react-markdown'],
          },
        },
      },
    },
  };
});
