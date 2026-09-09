export const COLOR_GROUPS = [
  { id: 'backgrounds', label: 'Fondos', description: 'La pantalla, las tarjetas y el entorno.', fields: [
    { key: 'device-bg', label: 'Fondo de la pantalla', value: '#10151e' },
    { key: 'studio', label: 'Fondo del entorno', value: '#11141b' },
    { key: 'surface', label: 'Paneles y detalles', value: '#1a2230' },
    { key: 'surface-raised', label: 'Superficie destacada', value: '#263247' },
    { key: 'surface-hover', label: 'Superficie al pasar el cursor', value: '#32425a' },
    { key: 'card-start', label: 'Tarjeta · inicio del degradado', value: '#202e42' },
    { key: 'card-end', label: 'Tarjeta · final del degradado', value: '#182332' },
  ] },
  { id: 'text', label: 'Textos y reloj', description: 'Desde la hora hasta los pequeños detalles.', fields: [
    { key: 'text-primary', label: 'Texto principal', value: '#edf2fa' },
    { key: 'text-secondary', label: 'Texto secundario', value: '#c6d2e4' },
    { key: 'text-muted', label: 'Texto de apoyo', value: '#a0afc5' },
    { key: 'text-faint', label: 'Etiquetas y texto discreto', value: '#899bb4' },
    { key: 'clock-text', label: 'Números del reloj', value: '#edf2fa' },
    { key: 'clock-separator', label: 'Separador del reloj', value: '#899bb4' },
  ] },
  { id: 'buttons', label: 'Acentos y botones', description: 'El color que guía la atención.', fields: [
    { key: 'highlight', label: 'Acento y botón principal', value: '#acc9f2' },
    { key: 'highlight-hover', label: 'Botón al pasar el cursor', value: '#cde0ff' },
    { key: 'highlight-ink', label: 'Texto del botón principal', value: '#132237' },
    { key: 'track', label: 'Líneas e indicadores', value: '#41516a' },
    { key: 'disabled-text', label: 'Texto de botones desactivados', value: '#a89d8e' },
  ] },
  { id: 'alerts', label: 'Alertas y conexión', description: 'Cuenta regresiva y avisos de disponibilidad.', fields: [
    { key: 'amber', label: 'Acento de la alerta', value: '#e4c28a' },
    { key: 'amber-hover', label: 'Botón de alerta al pasar el cursor', value: '#f0d9ad' },
    { key: 'amber-ink', label: 'Texto del botón de alerta', value: '#292316' },
    { key: 'alert-text', label: 'Texto de apoyo de la alerta', value: '#c4b79f' },
    { key: 'alert-muted', label: 'Detalles discretos de la alerta', value: '#a49e90' },
    { key: 'warning', label: 'Aviso de desconexión', value: '#dfb780' },
  ] },
  { id: 'frame', label: 'Marcos y efectos', description: 'Bordes, sombras y marco del dispositivo.', fields: [
    { key: 'border', label: 'Bordes y reflejos', value: '#ffffff' },
    { key: 'shadow', label: 'Sombras', value: '#000000' },
    { key: 'backdrop', label: 'Fondo detrás de los detalles', value: '#090d15' },
    { key: 'studio-glow', label: 'Luz ambiental del entorno', value: '#26344d' },
    { key: 'bezel-edge', label: 'Contorno exterior', value: '#3d424d' },
    { key: 'bezel-start', label: 'Marco · luz superior', value: '#2c3039' },
    { key: 'bezel-mid-start', label: 'Marco · tono intermedio', value: '#1f2229' },
    { key: 'bezel-mid-end', label: 'Marco · tono profundo', value: '#1d2027' },
    { key: 'bezel-end', label: 'Marco · luz inferior', value: '#303641' },
  ] },
  { id: 'people', label: 'Participantes', description: 'Los pequeños avatares de cada reunión.', fields: [
    { key: 'avatar-one', label: 'Primer avatar', value: '#3a5070' },
    { key: 'avatar-two', label: 'Segundo avatar', value: '#42536b' },
    { key: 'avatar-three', label: 'Tercer avatar', value: '#344457' },
    { key: 'avatar-text', label: 'Iniciales de los participantes', value: '#e2ebfa' },
  ] },
] as const;

export type ColorKey = typeof COLOR_GROUPS[number]['fields'][number]['key'];
export type ThemeColors = Record<ColorKey, string>;
export const COLOR_FIELDS = COLOR_GROUPS.flatMap(group => [...group.fields]);
export const DEFAULT_COLORS = Object.fromEntries(COLOR_FIELDS.map(field => [field.key, field.value])) as ThemeColors;
export const THEME_STORAGE_KEY = 'rasp.colors.v1';

export function normalizeHex(value: string): string | null {
  const trimmed = value.trim();
  const short = /^#?([\da-f]{3})$/i.exec(trimmed);
  if (short) return `#${[...short[1]].map(char => char + char).join('').toLowerCase()}`;
  const full = /^#?([\da-f]{6})$/i.exec(trimmed);
  return full ? `#${full[1].toLowerCase()}` : null;
}

export function hexToRgba(hex: string, alpha: number): string {
  const value = normalizeHex(hex) ?? '#000000';
  const channels = [1, 3, 5].map(index => parseInt(value.slice(index, index + 2), 16));
  return `rgba(${channels[0]}, ${channels[1]}, ${channels[2]}, ${alpha})`;
}

export function parseTheme(raw: string): ThemeColors | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !('version' in parsed) || parsed.version !== 1 || !('colors' in parsed) || !parsed.colors || typeof parsed.colors !== 'object') return null;
    const saved = parsed.colors as Record<string, unknown>;
    const colors = { ...DEFAULT_COLORS };
    for (const field of COLOR_FIELDS) {
      if (!(field.key in saved)) continue;
      const value = saved[field.key];
      if (typeof value !== 'string') return null;
      const hex = normalizeHex(value);
      if (!hex) return null;
      colors[field.key] = hex;
    }
    return colors;
  } catch { return null; }
}

export function loadTheme(): ThemeColors {
  try { return parseTheme(localStorage.getItem(THEME_STORAGE_KEY) ?? '') ?? { ...DEFAULT_COLORS }; }
  catch { return { ...DEFAULT_COLORS }; }
}

export function contrastRatio(foreground: string, background: string): number {
  const luminance = (hex: string) => {
    const rgb = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255)
      .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
  };
  const a = luminance(foreground), b = luminance(background);
  return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
}
