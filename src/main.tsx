import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { AuthProvider } from './components/AuthProvider';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider } from './components/Toast';
import { LazyMotion, domAnimation } from 'motion/react';
import './index.css';

import { registerSW } from 'virtual:pwa-register';
registerSW({ immediate: true });

import { purgeStaleAnswerCaches } from './services/cacheGen';
purgeStaleAnswerCaches();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <LazyMotion features={domAnimation}>
        <AuthProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </AuthProvider>
      </LazyMotion>
    </ErrorBoundary>
  </StrictMode>,
);
