import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig(() => {
  const baseEnv = loadEnv('', '.', '');        // .env.local — untuk proxy target (selalu full URL)
  return {
    plugins: [react(), tailwindcss(), VitePWA({
      registerType: 'autoUpdate',
      // Precache semua JS, CSS, HTML yang di-generate Vite
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2}'],
        // API calls tidak boleh di-cache
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // Google Fonts — cache 1 tahun
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // App shell — stale-while-revalidate agar tampilan instan
            urlPattern: /^https:\/\/dash5\.my\.id\/.*/i,
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
        theme_color: '#E87100',
        background_color: '#212121',
        display: 'standalone',
        start_url: '/',
        orientation: 'any',
        icons: [],
      },
    }), cloudflare()],

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