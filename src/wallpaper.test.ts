import { describe, expect, it } from 'vitest';
import type { CalendarEvent } from './calendar';
import { DEFAULT_WALLPAPER_CONFIG, isNightMinute, meetingBlocksWallpaper, parseWallpaperConfig, shouldShowNightWallpaper } from './wallpaper';

const meeting = (start: number, end: number): CalendarEvent => ({ id: 'event', title: 'Reunión', start, end, description: '', people: [], location: 'Google Meet', hasMeet: true });

describe('night wallpaper', () => {
  it('handles a schedule that crosses midnight', () => {
    expect(isNightMinute(22 * 60, 21 * 60, 390)).toBe(true);
    expect(isNightMinute(5 * 60, 21 * 60, 390)).toBe(true);
    expect(isNightMinute(12 * 60, 21 * 60, 390)).toBe(false);
  });

  it('leaves the wallpaper before a meeting and during a meeting', () => {
    expect(meetingBlocksWallpaper([meeting(22 * 60, 22 * 60 + 30)], 21 * 3600 + 35 * 60, 30)).toBe(true);
    expect(meetingBlocksWallpaper([meeting(22 * 60, 22 * 60 + 30)], 21 * 3600, 30)).toBe(false);
    expect(meetingBlocksWallpaper([meeting(22 * 60, 22 * 60 + 30)], 22 * 3600 + 5 * 60, 30)).toBe(true);
  });

  it('only starts automatically with a usable calendar and an idle timer', () => {
    const input = { config: DEFAULT_WALLPAPER_CONFIG, events: [], seconds: 22 * 3600, calendarReady: true, pomodoroActive: false };
    expect(shouldShowNightWallpaper(input)).toBe(true);
    expect(shouldShowNightWallpaper({ ...input, calendarReady: false })).toBe(false);
    expect(shouldShowNightWallpaper({ ...input, pomodoroActive: true })).toBe(false);
  });

  it('sanitizes persisted visual settings', () => {
    const parsed = parseWallpaperConfig(JSON.stringify({ version: 1, config: { enabled: true, preset: 'unknown', quality: 'rich', density: 99, glow: -2 } }));
    expect(parsed?.preset).toBe('abyss');
    expect(parsed?.quality).toBe('rich');
    expect(parsed?.density).toBe(1.3);
    expect(parsed?.glow).toBe(.15);
  });
});

