import { useEffect, useState } from 'react';

const KEY = 'sid-theme';
const DEFAULT = 'dark';

const read = () => {
  try { return localStorage.getItem(KEY) || DEFAULT; } catch { return DEFAULT; }
};

const apply = (t) => {
  const b = document.body;
  b.classList.toggle('theme-light', t === 'light');
  b.classList.toggle('theme-dark',  t !== 'light');
};

export function useTheme() {
  const [theme, setThemeState] = useState(read);

  useEffect(() => { apply(theme); }, [theme]);

  useEffect(() => {
    apply(read());
    const onStorage = (e) => { if (e.key === KEY) setThemeState(read()); };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setTheme = (t) => {
    try { localStorage.setItem(KEY, t); } catch {}
    setThemeState(t);
  };

  return { theme, setTheme, toggle: () => setTheme(theme === 'light' ? 'dark' : 'light') };
}
