import { useEffect, useState } from 'react';
import { DEFAULT_WALLPAPER_CONFIG, loadWallpaperConfig, parseWallpaperConfig, WALLPAPER_STORAGE_KEY } from './wallpaper';
import type { WallpaperConfig } from './wallpaper';

export function useWallpaper() {
  const [config, setConfig] = useState<WallpaperConfig>(loadWallpaperConfig);
  const [storageAvailable, setStorageAvailable] = useState(true);

  useEffect(() => {
    function sync(event: StorageEvent) {
      if (event.key !== WALLPAPER_STORAGE_KEY || event.newValue === null) return;
      const next = parseWallpaperConfig(event.newValue);
      if (next) setConfig(next);
    }
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(WALLPAPER_STORAGE_KEY, JSON.stringify({ version: 1, config }));
      setStorageAvailable(true);
    } catch { setStorageAvailable(false); }
  }, [config]);

  function update<K extends keyof WallpaperConfig>(key: K, value: WallpaperConfig[K]) {
    setConfig(previous => previous[key] === value ? previous : { ...previous, [key]: value });
  }

  function restore() { setConfig({ ...DEFAULT_WALLPAPER_CONFIG }); }

  return { config, update, restore, storageAvailable };
}

export type WallpaperController = ReturnType<typeof useWallpaper>;

