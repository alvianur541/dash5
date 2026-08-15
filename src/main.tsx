import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { AuthProvider } from './components/AuthProvider';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LazyMotion, domAnimation } from 'motion/react';
import './index.css';

import { registerSW } from 'virtual:pwa-register';
registerSW({ immediate: true });

// Buang cache jawaban dari generasi lama SEBELUM app render. Tanpa ini, perbaikan
// retrieval/prompt tidak terasa oleh user lama: localStorage masih menyajikan jawaban
// versi sebelumnya sampai TTL 3 hari habis. Lihat CACHE_GEN di services/cacheGen.ts.
import { purgeStaleAnswerCaches } from './services/cacheGen';
purgeStaleAnswerCaches();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <LazyMotion features={domAnimation}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </LazyMotion>
    </ErrorBoundary>
  </StrictMode>,
);
