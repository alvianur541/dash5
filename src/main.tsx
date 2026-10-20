import { StrictMode, Suspense, lazy } from 'react';
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

import { trackVisualViewport } from './lib/viewport';
trackVisualViewport();

const RichAnswersFixture = import.meta.env.DEV
  ? lazy(() => import('./dev/RichAnswersFixture').then(module => ({ default: module.RichAnswersFixture })))
  : null;
const RICH_FIXTURE = !!RichAnswersFixture && window.location.search.includes('fixture=rich-answers');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      {RICH_FIXTURE && RichAnswersFixture ? (
        <Suspense fallback={null}><RichAnswersFixture /></Suspense>
      ) : (
        <LazyMotion features={domAnimation}>
          <AuthProvider>
            <ToastProvider>
              <App />
            </ToastProvider>
          </AuthProvider>
        </LazyMotion>
      )}
    </ErrorBoundary>
  </StrictMode>,
);
