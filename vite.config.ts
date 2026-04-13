import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],

  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },

  server: {
    hmr: process.env.DISABLE_HMR !== 'true',
    // In dev: forward /api/* to the local proxy server
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },

  build: {
    rollupOptions: {
      output: {
        // Split vendor bundles so browsers can download in parallel
        // and cache each chunk independently across deploys
        manualChunks: {
          'react-core':  ['react', 'react-dom'],
          'motion':      ['motion'],
          'supabase':    ['@supabase/supabase-js'],
          'markdown':    ['react-markdown'],
        },
      },
    },
  },
});
