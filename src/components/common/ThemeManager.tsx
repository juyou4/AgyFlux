import { useEffect } from 'react';
import { useConfigStore } from '../../stores/useConfigStore';

function applyTheme(theme: string) {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = theme === 'dark' || (theme === 'system' && prefersDark);
  const root = document.documentElement;
  root.classList.toggle('dark', isDark);
  root.setAttribute('data-theme', isDark ? 'dark' : 'light');
  localStorage.setItem('app-theme-preference', theme);
  if (!root.classList.contains('panel-window')) {
    root.style.backgroundColor = isDark ? '#141316' : '#F7F5F3';
  }
}

export function ThemeManager() {
  const theme = useConfigStore((s) => s.config?.theme || 'light');

  useEffect(() => {
    applyTheme(theme);
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  return null;
}
