import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
  const baseEnv = loadEnv('', '.', '');
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        workbox: {
          cleanupOutdatedCaches: true,
          skipWaiting: true,
          clientsClaim: true,
          globPatterns: ['**/*.{js,css,html,woff2}'],
          navigateFallback: 'index.html',
          navigateFallbackDenylist: [/^\/api\//],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/[^/]+\/(rest|auth|storage|realtime)\/v1\//i,
              handler: 'NetworkOnly',
            },
            {
              urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
              handler: 'NetworkOnly',
            },
            {
              urlPattern: /^https:\/\/dash5\.my\.id\/(api|v1)\//i,
              handler: 'NetworkOnly',
            },
            {
              urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts',
                expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
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
          manualChunks(id) {
            if (!id.includes('/node_modules/')) return;
            // React first, or its jsx-runtime leaks into whichever chunk claims it.
            if (/\/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react-core';
            if (/\/node_modules\/(react-markdown|remark-gfm|rehype-sanitize)\//.test(id)) return 'markdown';
            if (id.includes('/node_modules/motion')) return 'motion';
            if (id.includes('/node_modules/@supabase/')) return 'supabase';
          },
        },
      },
    },
  };
});
