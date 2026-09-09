import { useState } from 'react';
import type { CSSProperties } from 'react';
import { ArrowCounterClockwise, ArrowUUpLeft, CalendarBlank, Check, CheckCircle, Desktop, Palette, SlidersHorizontal, ArrowSquareOut, CircleNotch, SpeakerHigh } from '@phosphor-icons/react';
import ColorEditor from './ColorEditor';
import { matchingPreset, THEME_PRESETS } from './presets';
import { contrastRatio, DEFAULT_COLORS, hexToRgba } from './theme';
import type { ThemeController } from './useTheme';
import type { MacFocusController } from './macFocus';
import { FOCUS_SHORTCUT } from './macFocus';
import AlexaSettings from './AlexaSettings';
import type { AlexaController } from './useAlexa';
import type { SceneId } from './alexa';
import GoogleCalendarSettings from './GoogleCalendarSettings';
import type { GoogleCalendarController } from './useGoogleCalendar';

export type SettingsSection = 'presets' | 'colors' | 'calendar' | 'mac' | 'alexa';
export default function SettingsScreen({ theme, mac, alexa, calendar, initialScene, section, onSection }: {
  alexa: AlexaController; calendar: GoogleCalendarController; initialScene?: SceneId; theme: ThemeController; mac: MacFocusController; section: SettingsSection; onSection: (section: SettingsSection) => void;
}) {
  const [feedback, setFeedback] = useState('');
  const preset = matchingPreset(theme.colors);
  // A contrasting editing surface keeps recovery possible if a custom palette becomes unreadable.
  const readable = contrastRatio(theme.colors['text-primary'], theme.colors.surface) >= 4.5;
  const safe = readable ? theme.colors : DEFAULT_COLORS;
  const editorStyle = {
    '--editor-bg': safe.surface, '--editor-text': safe['text-primary'],
    '--editor-muted': contrastRatio(safe['text-muted'], safe.surface) >= 4.5 ? safe['text-muted'] : safe['text-primary'],
    '--editor-accent': contrastRatio(safe.highlight, safe.surface) >= 4.5 ? safe.highlight : safe['text-primary'],
    '--editor-line': hexToRgba(safe['text-primary'], .12),
  } as CSSProperties;
  return <main className="settings-screen app-content" style={editorStyle} aria-label="Ajustes del dispositivo">
    <aside className="settings-sidebar"><div><span className="eyebrow">A TU MANERA</span><h1>Ajustes</h1></div>
      <nav aria-label="Secciones de ajustes">
        <button aria-current={section === 'presets' ? 'page' : undefined} onClick={() => onSection('presets')}><Palette size={18} />Paletas</button>
        <button aria-current={section === 'colors' ? 'page' : undefined} onClick={() => onSection('colors')}><SlidersHorizontal size={18} />Colores</button>
        <button aria-current={section === 'calendar' ? 'page' : undefined} onClick={() => onSection('calendar')}><CalendarBlank size={18} />Calendario</button>
        <button aria-current={section === 'mac' ? 'page' : undefined} onClick={() => onSection('mac')}><Desktop size={18} />Mi Mac</button>
        <button aria-current={section === 'alexa' ? 'page' : undefined} onClick={() => onSection('alexa')}><SpeakerHigh size={18} />Alexa</button>
      </nav>
      <span className="settings-local">Tu configuración.<br />Siempre a mano.</span>
    </aside>
    <section className="settings-panel">
      {section === 'alexa' ? <AlexaSettings alexa={alexa} initialScene={initialScene} /> : section === 'calendar' ? <GoogleCalendarSettings calendar={calendar} /> : section === 'presets' ? <div className="preset-page"><div className="settings-heading"><div><h2>Encuentra tu tono.</h2><p>Una paleta completa, con un solo toque.</p></div><span className="current-palette">{preset?.name ?? 'Personalizada'}</span></div>
        <div className="presets-grid">{THEME_PRESETS.map(item => <button key={item.id} className="preset-card" aria-label={`Aplicar paleta ${item.name}`} aria-pressed={preset?.id === item.id} onClick={() => { theme.applyColors(item.colors); setFeedback(`Paleta ${item.name} aplicada.`); }}>
          <div className="preset-preview" style={{ background: item.colors['device-bg'], color: item.colors['clock-text'] }}><span className="preset-clock">10<span style={{ color: item.colors['clock-separator'] }}>:</span>42</span><div className="preset-lines"><i style={{ background: item.colors.highlight }} /><i style={{ background: item.colors['text-faint'] }} /></div><span className="preset-accent" style={{ background: item.colors.highlight }} /><span className="preset-alert" style={{ background: item.colors.amber }} /></div>
          <span className="preset-name">{item.name}{preset?.id === item.id && <Check size={15} weight="bold" />}</span><span className="preset-mood">{item.mood}</span>
        </button>)}</div>
      </div> : section === 'colors' ? <ColorEditor colors={theme.colors} onChange={(key, value) => { theme.updateColor(key, value); setFeedback(''); }} /> : <div className="mac-settings-scroll">
        <div className="settings-heading"><div><h2>Menos interrupciones.</h2><p>No molestar durante tus sesiones de enfoque.</p></div><Desktop size={25} /></div>
        <div className={`mac-connection-state ${mac.status?.ready ? 'ready' : ''}`}><span className="connection-symbol">{mac.status?.ready ? <CheckCircle size={21} /> : <Desktop size={21} />}</span><div><strong>{mac.checking ? 'Buscando el atajo…' : mac.status?.ready ? 'Tu Mac está listo' : 'Conecta con Atajos'}</strong><p>{mac.status?.message ?? 'Comprobando la conexión local.'}</p></div><button aria-label="Comprobar conexión con Atajos" disabled={mac.checking} onClick={() => void mac.refresh()}>{mac.checking ? <CircleNotch size={18} className="spinning" /> : <ArrowCounterClockwise size={18} />}</button></div>
        <label className="focus-preference"><div><strong>Activar al iniciar un Pomodoro</strong><span>No se solicita al comenzar un descanso.</span></div><input type="checkbox" role="switch" aria-label="Activar No molestar al iniciar" checked={mac.enabled} disabled={!mac.status?.ready} onChange={event => mac.setEnabled(event.target.checked)} /></label>
        <div className="shortcut-instructions"><h3>Una vez, en tu Mac</h3><ol><li>Abre <strong>Atajos</strong> y crea uno llamado <strong>{FOCUS_SHORTCUT}</strong>.</li><li>Añade <strong>Obtener fechas de la entrada</strong> y selecciona <strong>Entrada del atajo</strong>.</li><li>Añade <strong>Establecer modo de concentración</strong>: activa <strong>No molestar</strong> hasta la fecha recibida.</li><li>Guarda y toca el botón de comprobar de arriba.</li></ol><p>Rasp envía la hora de finalización. No molestar vence a esa hora, incluso si pausas o reinicias el temporizador. Puedes desactivarlo antes en el Centro de control.</p><a href="https://support.apple.com/guide/shortcuts-mac/run-shortcuts-from-the-command-line-apd455c82f02/mac" target="_blank" rel="noreferrer">Atajos en macOS <ArrowSquareOut size={13} /></a><p className="mac-local-note">Conexión local en este Mac. El enlace desde la Raspberry se añadirá en la integración del dispositivo.</p></div>
      </div>}
      {section !== 'alexa' && section !== 'calendar' && <footer className="settings-actions"><span role="status"><Check size={13} />{!theme.storageAvailable || !mac.storageAvailable ? 'Guardado local no disponible' : feedback || 'Guardado en este navegador'}</span>{section !== 'mac' && <div><button disabled={!theme.canUndo} onClick={() => { theme.undo(); setFeedback('Cambio deshecho.'); }} aria-label="Deshacer cambio de colores"><ArrowUUpLeft size={16} />Deshacer</button><button onClick={() => { theme.restoreAll(); setFeedback('Azul noche restaurado.'); }} aria-label="Restaurar azul noche"><ArrowCounterClockwise size={16} /></button></div>}</footer>}
    </section>
  </main>;
}
