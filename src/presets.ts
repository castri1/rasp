import { COLOR_FIELDS, DEFAULT_COLORS } from './theme';
import type { ThemeColors } from './theme';

const palette = (colors: Partial<ThemeColors>): ThemeColors => ({ ...DEFAULT_COLORS, ...colors });

export const THEME_PRESETS = [
  { id: 'night', name: 'Azul noche', mood: 'Sereno, como el cielo al anochecer.', colors: palette({}) },
  { id: 'forest', name: 'Bosque', mood: 'Verdes suaves. Un poco de naturaleza.', colors: palette({
    'device-bg': '#111b18', studio: '#101713', surface: '#1b2922', 'surface-raised': '#2b3d32', 'surface-hover': '#3b5042',
    'card-start': '#263d31', 'card-end': '#1c2c23', 'text-primary': '#f0f3e9', 'text-secondary': '#d0dbcc',
    'text-muted': '#acbaa7', 'text-faint': '#96a991', 'clock-text': '#f0f3e9', 'clock-separator': '#96a991',
    highlight: '#c4d9a8', 'highlight-hover': '#dce8c9', 'highlight-ink': '#24311d', track: '#4b6351',
    'studio-glow': '#304d35', 'bezel-edge': '#404a40', 'bezel-start': '#303930', 'bezel-mid-start': '#222a24',
    'bezel-mid-end': '#1b241e', 'bezel-end': '#343f34', backdrop: '#0b120e',
    'avatar-one': '#4a6248', 'avatar-two': '#3e5449', 'avatar-three': '#52624a', 'avatar-text': '#eaf1de',
  }) },
  { id: 'clay', name: 'Arcilla', mood: 'Cálido, íntimo y sin prisa.', colors: palette({
    'device-bg': '#211918', studio: '#1c1615', surface: '#302320', 'surface-raised': '#45312b', 'surface-hover': '#584139',
    'card-start': '#45312a', 'card-end': '#312421', 'text-primary': '#faf0e8', 'text-secondary': '#e0ccc0',
    'text-muted': '#c2aaa0', 'text-faint': '#b29a90', 'clock-text': '#faf0e8', 'clock-separator': '#b29a90',
    highlight: '#e8b39b', 'highlight-hover': '#f5d1ba', 'highlight-ink': '#36251e', track: '#6c5046',
    amber: '#edcf90', 'amber-hover': '#f6e2b7', 'amber-ink': '#352b19', 'alert-text': '#d0bea4', 'alert-muted': '#b9a98e',
    'studio-glow': '#614236', 'bezel-edge': '#55433c', 'bezel-start': '#40322c', 'bezel-mid-start': '#2d2320',
    'bezel-mid-end': '#261e1c', 'bezel-end': '#483730', backdrop: '#190f0d',
    'avatar-one': '#725046', 'avatar-two': '#615148', 'avatar-three': '#635443', 'avatar-text': '#f4e4d6',
  }) },
  { id: 'graphite', name: 'Grafito', mood: 'Lo esencial, en blanco y carbón.', colors: palette({
    'device-bg': '#18191b', studio: '#141517', surface: '#25272a', 'surface-raised': '#36393d', 'surface-hover': '#484c51',
    'card-start': '#303338', 'card-end': '#24262a', 'text-primary': '#f0f1f3', 'text-secondary': '#cfd2d7',
    'text-muted': '#adb2ba', 'text-faint': '#9ca2ac', 'clock-text': '#f0f1f3', 'clock-separator': '#9ca2ac',
    highlight: '#d4dbe4', 'highlight-hover': '#edf1f6', 'highlight-ink': '#252a31', track: '#575f68',
    'studio-glow': '#3a3e46', 'bezel-edge': '#484b50', 'bezel-start': '#34373b', 'bezel-mid-start': '#25272b',
    'bezel-mid-end': '#222427', 'bezel-end': '#3b3e43', backdrop: '#0e1012',
    'avatar-one': '#4c515a', 'avatar-two': '#545962', 'avatar-three': '#424952', 'avatar-text': '#edf0f5',
  }) },
] as const;

export function matchingPreset(colors: ThemeColors) {
  return THEME_PRESETS.find(preset => COLOR_FIELDS.every(field => colors[field.key] === preset.colors[field.key]));
}
