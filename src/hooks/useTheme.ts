import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

type Theme = 'dark' | 'light';

const THEME_COLOR: Record<Theme, string> = { dark: '#1A1915', light: '#FAF9F5' };
const FALLBACK_MS = 400;

function initialTheme(): Theme {
  const stored = localStorage.getItem('dash-theme');
  if (stored === 'light' || stored === 'dark') return stored;
  const h = new Date().getHours();
  return h >= 6 && h < 17 ? 'light' : 'dark';
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.remove('dark-theme', 'light-theme');
  root.classList.add(`${theme}-theme`);
  localStorage.setItem('dash-theme', theme);
  document.querySelectorAll('meta[name="theme-color"]').forEach(el => el.remove());
  const meta = document.createElement('meta');
  meta.name = 'theme-color';
  meta.content = THEME_COLOR[theme];
  document.head.appendChild(meta);
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const current = useRef(theme);
  current.current = theme;

  useEffect(() => { applyTheme(theme); }, [theme]);

  const toggle = useCallback(() => {
    const next: Theme = current.current === 'dark' ? 'light' : 'dark';
    // The DOM must already show the new theme when the transition callback returns, so apply it there, not in the effect.
    const swap = () => { applyTheme(next); flushSync(() => setTheme(next)); };
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { swap(); return; }
    if (document.startViewTransition) { document.startViewTransition(swap); return; }
    // Older browsers: fade every element's colours instead of snapping the panels while only <body> eases.
    const root = document.documentElement;
    root.classList.add('theme-anim');
    swap();
    window.setTimeout(() => root.classList.remove('theme-anim'), FALLBACK_MS);
  }, []);

  return { theme, toggle };
}
