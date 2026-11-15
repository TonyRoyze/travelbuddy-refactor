'use client';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

type Theme = 'light' | 'dark';
type Preference = Theme | 'system';
const KEY = 'travelbuddy-v1.1-theme';
const ThemeContext = createContext<{ theme: Theme; preference: Preference; setPreference: (value: Preference) => void } | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light');
  const [preference, setPreferenceState] = useState<Preference | null>(null);
  useEffect(() => { try { const value = localStorage.getItem(KEY); setPreferenceState(value === 'light' || value === 'dark' ? value : 'system'); } catch { setPreferenceState('system'); } }, []);
  useEffect(() => {
    if (preference === null) return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => { const resolved = preference === 'system' ? (media.matches ? 'dark' : 'light') : preference; document.documentElement.dataset.theme = resolved; setTheme(resolved); };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [preference]);
  const setPreference = useCallback((value: Preference) => {
    try { if (value === 'system') localStorage.removeItem(KEY); else localStorage.setItem(KEY, value); } catch { /* Keep the selection for this session. */ }
    const resolved = value === 'system' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : value;
    document.documentElement.dataset.theme = resolved;
    setTheme(resolved);
    setPreferenceState(value);
  }, []);
  return <ThemeContext.Provider value={{ theme, preference: preference ?? 'system', setPreference }}>{children}</ThemeContext.Provider>;
}
export function useTheme() { const value = useContext(ThemeContext); if (!value) throw new Error('ThemeProvider is required'); return value; }
