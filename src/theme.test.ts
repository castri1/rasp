import { describe, expect, it } from 'vitest';
import { DEFAULT_COLORS, contrastRatio, normalizeHex, parseTheme } from './theme';
import { matchingPreset, THEME_PRESETS } from './presets';

describe('color configuration', () => {
  it('accepts short or full HEX without passing arbitrary CSS through', () => {
    expect(normalizeHex('ABC')).toBe('#aabbcc');
    expect(normalizeHex(' #ACC9F2 ')).toBe('#acc9f2');
    expect(normalizeHex('red')).toBeNull();
    expect(normalizeHex('url(https://example.com)')).toBeNull();
  });
  it('restores saved colors and supplies defaults for newly added fields', () => {
    const restored = parseTheme(JSON.stringify({ version: 1, colors: { highlight: '#FA0', ignored: '#ffffff' } }));
    expect(restored?.highlight).toBe('#ffaa00');
    expect(restored?.['device-bg']).toBe(DEFAULT_COLORS['device-bg']);
    expect(restored).not.toHaveProperty('ignored');
  });
  it('rejects broken storage, unsupported versions and invalid saved values', () => {
    expect(parseTheme('{')).toBeNull();
    expect(parseTheme(JSON.stringify({ version: 2, colors: {} }))).toBeNull();
    expect(parseTheme(JSON.stringify({ version: 1, colors: { highlight: 'expression(alert(1))' } }))).toBeNull();
    expect(parseTheme(JSON.stringify({ version: 1, colors: { highlight: 123 } }))).toBeNull();
  });
  it('calculates readable and unreadable combinations consistently', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBe(21);
    expect(contrastRatio('#111111', '#111111')).toBe(1);
    expect(contrastRatio(DEFAULT_COLORS['highlight-ink'], DEFAULT_COLORS.highlight)).toBeGreaterThan(4.5);
  });
  it('ships complete palettes with readable text and actions', () => {
    for (const preset of THEME_PRESETS) {
      expect(Object.keys(preset.colors).sort()).toEqual(Object.keys(DEFAULT_COLORS).sort());
      expect(matchingPreset(preset.colors)?.id).toBe(preset.id);
      for (const key of ['text-primary', 'text-secondary', 'text-muted', 'text-faint', 'clock-text'] as const) {
        expect(contrastRatio(preset.colors[key], preset.colors['device-bg'])).toBeGreaterThanOrEqual(4.5);
      }
      expect(contrastRatio(preset.colors['highlight-ink'], preset.colors.highlight)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(preset.colors['amber-ink'], preset.colors.amber)).toBeGreaterThanOrEqual(4.5);
    }
    expect(matchingPreset({ ...DEFAULT_COLORS, highlight: '#ffffff' })).toBeUndefined();
  });
});
