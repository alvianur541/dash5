import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

type Theme = 'dark' | 'light';

const THEME_COLOR: Record<Theme, string> = { dark: '#0B0B0D', light: '#FAF9F5' };

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
    // Hover transitions (0.12–0.15 s) would otherwise make buttons lag behind the rest of the screen.
    const root = document.documentElement;
    root.classList.add('theme-switching');
    applyTheme(next);
    flushSync(() => setTheme(next));
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('theme-switching')));
  }, []);

  return { theme, toggle };
}
