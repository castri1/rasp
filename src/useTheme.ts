import { useEffect, useLayoutEffect, useState } from 'react';
import { DEFAULT_COLORS, THEME_STORAGE_KEY, hexToRgba, loadTheme, parseTheme } from './theme';
import type { ColorKey, ThemeColors } from './theme';

export function useTheme() {
  const [state, setState] = useState(() => ({ colors: loadTheme(), history: [] as ThemeColors[] }));
  const [storageAvailable, setStorageAvailable] = useState(true);

  useEffect(() => {
    function sync(event: StorageEvent) {
      if (event.key !== THEME_STORAGE_KEY || event.newValue === null) return;
      const colors = parseTheme(event.newValue);
      if (colors) setState({ colors, history: [] });
    }
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  useLayoutEffect(() => {
    const root = document.documentElement;
    for (const [key, value] of Object.entries(state.colors)) root.style.setProperty(`--${key}`, value);
    for (const [name, alpha] of [['05', .05], ['10', .10], ['15', .15], ['25', .25], ['45', .45]] as const) {
      root.style.setProperty(`--highlight-${name}`, hexToRgba(state.colors.highlight, alpha));
    }
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', state.colors['device-bg']);
    const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (favicon) favicon.href = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" rx="12" fill="${state.colors['device-bg']}"/><path d="M12 28V12h5v3c2-3 5-4 10-3v5c-7-1-10 2-10 8v3Z" fill="${state.colors.highlight}"/></svg>`)}`;
  }, [state.colors]);

  useEffect(() => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify({ version: 1, colors: state.colors }));
      setStorageAvailable(true);
    } catch { setStorageAvailable(false); }
  }, [state.colors]);

  function updateColor(key: ColorKey, value: string) {
    setState(previous => previous.colors[key] === value ? previous : {
      colors: { ...previous.colors, [key]: value },
      history: [...previous.history.slice(-49), previous.colors],
    });
  }
  function restoreAll() {
    applyColors(DEFAULT_COLORS);
  }
  function applyColors(colors: ThemeColors) {
    setState(previous => ({ colors: { ...colors }, history: [...previous.history.slice(-49), previous.colors] }));
  }
  function undo() {
    setState(previous => previous.history.length ? { colors: previous.history.at(-1)!, history: previous.history.slice(0, -1) } : previous);
  }
  return { colors: state.colors, updateColor, applyColors, restoreAll, undo, canUndo: state.history.length > 0, storageAvailable };
}
export type ThemeController = ReturnType<typeof useTheme>;
