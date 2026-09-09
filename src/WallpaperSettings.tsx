import { ArrowCounterClockwise, Eye, MoonStars, ShuffleAngular } from '@phosphor-icons/react';
import type { WallpaperController } from './useWallpaper';
import { formatScheduleTime, parseScheduleTime, WALLPAPER_PRESETS } from './wallpaper';

function RangeSetting({ label, value, minimum, maximum, onChange }: { label: string; value: number; minimum: number; maximum: number; onChange: (value: number) => void }) {
  return <label className="wallpaper-range"><span>{label}<strong>{Math.round(value * 100)}%</strong></span><input type="range" min={minimum} max={maximum} value={Math.round(value * 100)} onChange={event => onChange(Number(event.target.value) / 100)} /></label>;
}

export default function WallpaperSettings({ wallpaper, onPreview }: { wallpaper: WallpaperController; onPreview: () => void }) {
  const { config } = wallpaper;
  return <div className="wallpaper-settings">
    <div className="settings-heading wallpaper-settings-heading"><div><h2>La noche, en calma.</h2><p>Arte vivo cuando tu agenda puede descansar.</p></div><MoonStars size={25} /></div>
    <div className="wallpaper-settings-scroll">
      <label className="wallpaper-toggle"><div><strong>Activar automáticamente</strong><span>La agenda reaparece antes de cualquier reunión.</span></div><input type="checkbox" role="switch" checked={config.enabled} onChange={event => wallpaper.update('enabled', event.target.checked)} /></label>
      <div className="wallpaper-schedule">
        <label><span>Desde</span><input type="time" value={formatScheduleTime(config.startMinutes)} onChange={event => { const value = parseScheduleTime(event.target.value); if (value !== null) wallpaper.update('startMinutes', value); }} /></label>
        <label><span>Hasta</span><input type="time" value={formatScheduleTime(config.endMinutes)} onChange={event => { const value = parseScheduleTime(event.target.value); if (value !== null) wallpaper.update('endMinutes', value); }} /></label>
        <label><span>Despertar antes</span><select value={config.wakeBeforeMinutes} onChange={event => wallpaper.update('wakeBeforeMinutes', Number(event.target.value))}><option value="15">15 min</option><option value="30">30 min</option><option value="45">45 min</option><option value="60">60 min</option></select></label>
      </div>
      <div className="wallpaper-setting-label">ATMÓSFERA</div>
      <div className="wallpaper-presets">{WALLPAPER_PRESETS.map(preset => <button key={preset.id} aria-pressed={config.preset === preset.id} onClick={() => wallpaper.update('preset', preset.id)}><span className="wallpaper-swatch" style={{ background: `radial-gradient(circle at 65% 45%, ${preset.colors.accent}, ${preset.colors.deep} 34%, ${preset.colors.background} 72%)` }} /><span><strong>{preset.name}</strong><small>{preset.mood}</small></span></button>)}</div>
      <div className="wallpaper-tuning">
        <RangeSetting label="Ritmo" value={config.speed} minimum={25} maximum={150} onChange={value => wallpaper.update('speed', value)} />
        <RangeSetting label="Movimiento" value={config.motion} minimum={25} maximum={135} onChange={value => wallpaper.update('motion', value)} />
        <RangeSetting label="Densidad" value={config.density} minimum={45} maximum={130} onChange={value => wallpaper.update('density', value)} />
        <RangeSetting label="Brillo" value={config.brightness} minimum={35} maximum={115} onChange={value => wallpaper.update('brightness', value)} />
        <RangeSetting label="Resplandor" value={config.glow} minimum={15} maximum={120} onChange={value => wallpaper.update('glow', value)} />
      </div>
      <div className="wallpaper-quality"><span>RENDIMIENTO</span><div>{(['eco', 'balanced', 'rich'] as const).map(quality => <button key={quality} aria-pressed={config.quality === quality} onClick={() => wallpaper.update('quality', quality)}>{quality === 'eco' ? 'Ligero' : quality === 'balanced' ? 'Equilibrado' : 'Máximo'}</button>)}</div></div>
    </div>
    <div className="wallpaper-settings-actions"><span>{wallpaper.storageAvailable ? 'Guardado en esta pantalla' : 'No se pudo guardar'}</span><div><button onClick={wallpaper.restore} aria-label="Restaurar ajustes nocturnos"><ArrowCounterClockwise size={16} /></button><button onClick={() => wallpaper.update('seed', wallpaper.config.seed * 48271 % 999983 || 1)}><ShuffleAngular size={16} />Variar</button><button className="wallpaper-preview-button" onClick={onPreview}><Eye size={16} />Ver ahora</button></div></div>
  </div>;
}
