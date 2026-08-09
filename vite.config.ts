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
              // Supabase: NetworkOnly — jangan pernah cache, selalu fresh
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
              // App shell: hanya static assets (JS/CSS/HTML), bukan API
              urlPattern: /^https:\/\/dash5\.my\.id\/(?!api\/|v1\/).*/i,
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
          description: 'Asisten teknis alat berat Hitachi: fault code, troubleshooting, spec, dan parts dari manual resmi',
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
