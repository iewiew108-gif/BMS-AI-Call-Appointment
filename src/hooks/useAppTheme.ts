import { useSyncExternalStore } from 'react';

export type AppTheme = 'hospital' | 'vet';

const STORAGE_KEY = 'app-theme';

function getTheme(): AppTheme {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'vet' || v === 'hospital') return v;
  } catch { /* ignore */ }
  return 'hospital';
}

const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function setAppTheme(theme: AppTheme) {
  try { localStorage.setItem(STORAGE_KEY, theme); } catch { /* ignore */ }
  for (const cb of listeners) cb();
}

export function useAppTheme(): [AppTheme, (t: AppTheme) => void] {
  const theme = useSyncExternalStore(subscribe, getTheme);
  return [theme, setAppTheme];
}
