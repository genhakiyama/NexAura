import { useCallback, useEffect, useState } from 'react';

const THEME_KEY = 'nexora_theme';
export const THEME_EVENT = 'nexora:theme';

function readStoredTheme() {
  try {
    return localStorage.getItem(THEME_KEY);
  } catch {
    return null;
  }
}

/**
 * Theme controller for the Developer-Native UI.
 * Resolution order: saved preference -> OS preference -> dark.
 * The resolved theme is written to <html data-theme="…"> so CSS can switch
 * palettes without any JS in the components.
 */
export function useTheme() {
  const [theme, setTheme] = useState(() => {
    // The attribute is the source of truth once App has mounted, so a second
    // consumer (e.g. ChatPage's toggle button) starts in sync with it instead of
    // re-deriving from storage and drifting.
    if (typeof document !== 'undefined') {
      const applied = document.documentElement.getAttribute('data-theme');
      if (applied === 'light' || applied === 'dark') return applied;
    }
    const stored = readStoredTheme();
    if (stored === 'light' || stored === 'dark') return stored;
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }
    return 'dark';
  });

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    root.style.colorScheme = theme;
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // storage unavailable (private mode) — theme still applies for this session
    }
  }, [theme]);

  // Follow the OS only while the user has never picked a theme manually.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = (e) => {
      if (readStoredTheme()) return;
      setTheme(e.matches ? 'light' : 'dark');
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const toggle = useCallback(() => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  }, []);

  return { theme, toggle };
}
