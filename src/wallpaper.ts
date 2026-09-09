import type { CalendarEvent } from './calendar';

export type WallpaperPresetId = 'abyss' | 'indigo' | 'arctic';
export type WallpaperQuality = 'eco' | 'balanced' | 'rich';

export interface WallpaperPalette {
  background: string;
  midnight: string;
  deep: string;
  filament: string;
  accent: string;
  sparkle: string;
}

export interface WallpaperConfig {
  enabled: boolean;
  startMinutes: number;
  endMinutes: number;
  wakeBeforeMinutes: number;
  preset: WallpaperPresetId;
  quality: WallpaperQuality;
  speed: number;
  density: number;
  glow: number;
  brightness: number;
  motion: number;
  parallax: number;
  seed: number;
}

export const WALLPAPER_STORAGE_KEY = 'rasp.wallpaper.v1';

export const WALLPAPER_PRESETS: ReadonlyArray<{ id: WallpaperPresetId; name: string; mood: string; colors: WallpaperPalette }> = [
  {
    id: 'abyss',
    name: 'Abismo',
    mood: 'Azul profundo y cian contenido.',
    colors: { background: '#03060c', midnight: '#071529', deep: '#111436', filament: '#345b91', accent: '#68bdea', sparkle: '#d8f4ff' },
  },
  {
    id: 'indigo',
    name: 'Índigo',
    mood: 'Violeta oscuro, sereno y misterioso.',
    colors: { background: '#05050b', midnight: '#0b1026', deep: '#1b1234', filament: '#554384', accent: '#7d9ee8', sparkle: '#e2e9ff' },
  },
  {
    id: 'arctic',
    name: 'Ártico',
    mood: 'Noche fría con reflejos de hielo.',
    colors: { background: '#02080c', midnight: '#061c28', deep: '#0a2433', filament: '#286b7d', accent: '#65d2dc', sparkle: '#e1feff' },
  },
];

export const DEFAULT_WALLPAPER_CONFIG: WallpaperConfig = {
  enabled: true,
  startMinutes: 21 * 60,
  endMinutes: 6 * 60 + 30,
  wakeBeforeMinutes: 30,
  preset: 'abyss',
  quality: 'balanced',
  speed: .68,
  density: 1,
  glow: .82,
  brightness: .9,
  motion: .72,
  parallax: .24,
  seed: 1709,
};

const qualityValues = new Set<WallpaperQuality>(['eco', 'balanced', 'rich']);
const presetValues = new Set<WallpaperPresetId>(WALLPAPER_PRESETS.map(item => item.id));
const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));

export function parseWallpaperConfig(raw: string): WallpaperConfig | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const record = parsed as Record<string, unknown>;
    if (record.version !== 1 || !record.config || typeof record.config !== 'object') return null;
    const saved = record.config as Partial<Record<keyof WallpaperConfig, unknown>>;
    const preset = typeof saved.preset === 'string' && presetValues.has(saved.preset as WallpaperPresetId) ? saved.preset as WallpaperPresetId : DEFAULT_WALLPAPER_CONFIG.preset;
    const quality = typeof saved.quality === 'string' && qualityValues.has(saved.quality as WallpaperQuality) ? saved.quality as WallpaperQuality : DEFAULT_WALLPAPER_CONFIG.quality;
    const numeric = (key: keyof WallpaperConfig, minimum: number, maximum: number) => {
      const value = saved[key];
      return typeof value === 'number' && Number.isFinite(value) ? clamp(value, minimum, maximum) : DEFAULT_WALLPAPER_CONFIG[key] as number;
    };
    return {
      enabled: typeof saved.enabled === 'boolean' ? saved.enabled : DEFAULT_WALLPAPER_CONFIG.enabled,
      startMinutes: Math.round(numeric('startMinutes', 0, 1439)),
      endMinutes: Math.round(numeric('endMinutes', 0, 1439)),
      wakeBeforeMinutes: Math.round(numeric('wakeBeforeMinutes', 5, 90)),
      preset,
      quality,
      speed: numeric('speed', .25, 1.5),
      density: numeric('density', .45, 1.3),
      glow: numeric('glow', .15, 1.2),
      brightness: numeric('brightness', .35, 1.15),
      motion: numeric('motion', .25, 1.35),
      parallax: numeric('parallax', 0, .8),
      seed: Math.round(numeric('seed', 1, 999999)),
    };
  } catch { return null; }
}

export function loadWallpaperConfig(): WallpaperConfig {
  try { return parseWallpaperConfig(localStorage.getItem(WALLPAPER_STORAGE_KEY) ?? '') ?? { ...DEFAULT_WALLPAPER_CONFIG }; }
  catch { return { ...DEFAULT_WALLPAPER_CONFIG }; }
}

export function formatScheduleTime(minutes: number): string {
  const normalized = Math.round(clamp(minutes, 0, 1439));
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}

export function parseScheduleTime(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours <= 23 && minutes <= 59 ? hours * 60 + minutes : null;
}

export function isNightMinute(minutes: number, start: number, end: number): boolean {
  if (start === end) return true;
  return start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}

export function meetingBlocksWallpaper(events: CalendarEvent[], seconds: number, wakeBeforeMinutes: number): boolean {
  const now = seconds / 60;
  return events.some(event => event.end > now && event.start <= now + wakeBeforeMinutes);
}

export function shouldShowNightWallpaper({ config, events, seconds, calendarReady, pomodoroActive }: {
  config: WallpaperConfig;
  events: CalendarEvent[];
  seconds: number;
  calendarReady: boolean;
  pomodoroActive: boolean;
}): boolean {
  const minute = Math.floor(seconds / 60) % 1440;
  return config.enabled && calendarReady && !pomodoroActive && isNightMinute(minute, config.startMinutes, config.endMinutes)
    && !meetingBlocksWallpaper(events, seconds, config.wakeBeforeMinutes);
}

export function wallpaperPalette(id: WallpaperPresetId): WallpaperPalette {
  return WALLPAPER_PRESETS.find(item => item.id === id)?.colors ?? WALLPAPER_PRESETS[0].colors;
}
