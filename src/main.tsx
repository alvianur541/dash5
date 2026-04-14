import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { AuthProvider } from './components/AuthProvider';
import { LazyMotion, domAnimation } from 'motion/react';
import './index.css';

// PWA: auto-register service worker yang di-generate vite-plugin-pwa
// Service worker ini berisi daftar semua asset untuk precache (offline support)
import { registerSW } from 'virtual:pwa-register';
registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LazyMotion features={domAnimation}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </LazyMotion>
  </StrictMode>,
);
