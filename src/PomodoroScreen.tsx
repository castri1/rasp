import { useState } from 'react';
import { ArrowCounterClockwise, ArrowRight, Check, Coffee, Minus, Moon, Pause, Play, Plus, SlidersHorizontal } from '@phosphor-icons/react';
import { formatCountdown, validMinutes } from './pomodoro';
import type { PomodoroController } from './usePomodoro';
import type { MacFocusController } from './macFocus';

export default function PomodoroScreen({ pomodoro, mac, onMacSettings, onSessionStart }: { pomodoro: PomodoroController; mac: MacFocusController; onMacSettings: () => void; onSessionStart: (mode: 'focus' | 'break') => void }) {
  const { timer, remaining } = pomodoro;
  const [draft, setDraft] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const locked = timer.status === 'running' || timer.status === 'paused';
  const minutes = timer.mode === 'focus' ? timer.focusMinutes : timer.breakMinutes;
  const complete = timer.status === 'complete';
  const progress = remaining / timer.totalMs;
  function updateDuration(value: number) { if (validMinutes(value)) { pomodoro.configure(timer.mode, value); setInvalid(false); } }
  function commit() {
    if (draft !== null && validMinutes(Number(draft))) updateDuration(Number(draft));
    else if (draft !== null) setInvalid(true);
    setDraft(null);
  }
  function start() {
    if (draft !== null && !validMinutes(Number(draft))) { setInvalid(true); return; }
    const isNewSession = timer.status === 'idle' || timer.status === 'complete';
    const next = pomodoro.start();
    if (isNewSession) onSessionStart(next.mode);
    if (next.mode === 'focus' && next.deadline) void mac.activate(next.deadline);
  }
  return <main className="pomodoro-screen app-content" aria-label="Temporizador Pomodoro">
    <section className={`focus-clock-panel ${complete ? 'is-complete' : ''}`}>
      <span className="eyebrow">{complete ? 'UN MOMENTO BIEN INVERTIDO' : timer.mode === 'break' ? 'RESPIRA. SUELTA. VUELVE.' : 'UNA COSA A LA VEZ'}</span>
      <div className="focus-dial"><svg viewBox="0 0 256 256" aria-hidden="true"><circle className="dial-track" cx="128" cy="128" r="117" /><circle className="dial-progress" cx="128" cy="128" r="117" pathLength="100" strokeDasharray="100" strokeDashoffset={100 - progress * 100} /></svg>
        <div className="focus-dial-content"><span className="focus-mode-label">{complete ? <Check size={21} /> : timer.mode === 'break' ? <Coffee size={21} /> : <span className={`focus-breath ${timer.status === 'running' ? 'is-running' : ''}`} />}{complete ? 'COMPLETADO' : timer.status === 'paused' ? 'EN PAUSA' : timer.mode === 'focus' ? 'ENFOQUE' : 'DESCANSO'}</span><span className="focus-countdown" role="timer" aria-label="Tiempo restante">{formatCountdown(remaining)}</span><span className="focus-dial-caption">{complete ? 'Tu pausa también importa.' : timer.status === 'running' ? 'Este tiempo es para ti.' : timer.status === 'paused' ? 'Continúa cuando quieras.' : 'Sin prisa. Sin distracciones.'}</span></div>
      </div>
      <div className="focus-transport">{complete ? <button className="primary-button" onClick={() => pomodoro.configure(timer.mode === 'focus' ? 'break' : 'focus', timer.mode === 'focus' ? timer.breakMinutes : timer.focusMinutes)}>{timer.mode === 'focus' ? <Coffee size={19} /> : <Play size={18} />}<span>{timer.mode === 'focus' ? 'Preparar descanso' : 'Otro Pomodoro'}</span><ArrowRight size={17} /></button> : <button className="primary-button" disabled={invalid || (mac.requesting && timer.status !== 'running')} onClick={timer.status === 'running' ? () => { pomodoro.pause(); void mac.deactivate(); } : start}>{timer.status === 'running' ? <Pause size={19} weight="fill" /> : <Play size={18} weight="fill" />}<span>{timer.status === 'running' ? 'Pausar' : timer.status === 'paused' ? 'Continuar' : timer.mode === 'focus' ? 'Comenzar enfoque' : 'Comenzar descanso'}</span></button>}
        <button className="focus-reset" onClick={() => { pomodoro.reset(); setInvalid(false); void mac.deactivate(); }} disabled={timer.status === 'idle' || mac.requesting} aria-label="Reiniciar Pomodoro"><ArrowCounterClockwise size={21} /></button>
      </div>
    </section>
    <section className="focus-options"><div className="focus-options-heading"><h1>Encuentra tu ritmo<span>.</span></h1><p>Tiempo para crear. Espacio para respirar.</p></div>
      <div className="focus-mode-switch" aria-label="Tipo de sesión"><button disabled={locked} aria-pressed={timer.mode === 'focus'} onClick={() => { setDraft(null); pomodoro.configure('focus', timer.focusMinutes); }}>Enfoque</button><button disabled={locked} aria-pressed={timer.mode === 'break'} onClick={() => { setDraft(null); pomodoro.configure('break', timer.breakMinutes); }}><Coffee size={15} />Descanso</button></div>
      <div className="duration-heading"><label htmlFor="focus-duration">DURACIÓN</label><span>{locked ? 'Reinicia para ajustar' : '1–120 minutos'}</span></div>
      <div className="duration-stepper"><button disabled={locked || minutes <= 1} aria-label="Restar un minuto" onClick={() => updateDuration(minutes - 1)}><Minus size={19} /></button><div><input id="focus-duration" aria-label="Duración del Pomodoro en minutos" aria-invalid={invalid} type="number" min="1" max="120" step="1" disabled={locked} value={draft ?? minutes} onChange={event => setDraft(event.target.value)} onBlur={commit} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} /><span>min</span></div><button disabled={locked || minutes >= 120} aria-label="Sumar un minuto" onClick={() => updateDuration(minutes + 1)}><Plus size={19} /></button></div>
      {invalid && <span className="duration-error" role="status">Elige un número entero entre 1 y 120.</span>}
      <div className="duration-presets" aria-label="Duraciones sugeridas">{(timer.mode === 'focus' ? [15, 25, 45, 50] : [5, 10, 15, 20]).map(value => <button key={value} disabled={locked} aria-pressed={minutes === value} onClick={() => updateDuration(value)}>{value}<span> min</span></button>)}</div>
      <div className="focus-mac"><div><Moon size={18} /><span>No molestar en el Mac</span><button aria-label="Configurar No molestar" onClick={onMacSettings}><SlidersHorizontal size={19} /></button></div>{mac.status?.ready ? <label className="focus-toggle"><span>{timer.mode === 'break' ? 'Solo se activa durante el enfoque' : mac.enabled ? 'Activar al comenzar o continuar' : 'Activación automática desactivada'}</span><input type="checkbox" role="switch" aria-label="No molestar durante el enfoque" checked={mac.enabled} onChange={event => mac.setEnabled(event.target.checked)} /></label> : <button className="setup-mac-button" onClick={onMacSettings}>Configurar con Atajos <ArrowRight size={14} /></button>}
        {mac.enabled && <span className="focus-expiry-note">Se apaga al pausar, reiniciar o terminar.</span>}
      </div>
      {(mac.message || !pomodoro.storageAvailable) && <p className="focus-response" role="status">{!pomodoro.storageAvailable ? 'No se puede guardar el temporizador en este navegador.' : mac.message}</p>}
    </section>
  </main>;
}
