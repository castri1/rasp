import { useState } from 'react';
import { BellRinging, Check, Clock, Pause, PencilSimple, Play, Plus, Trash, X } from '@phosphor-icons/react';
import { formatTimerDuration, remainingNamedTimer, validAlarmName, validAlarmTime, validTimerMinutes } from './alarms';
import type { AlarmsController } from './useAlarms';
import './alarms.css';

type Mode = 'alarms' | 'timers';

export default function AlarmsScreen({ controller }: { controller: AlarmsController }) {
  const [mode, setMode] = useState<Mode>('alarms');
  const [name, setName] = useState('');
  const [time, setTime] = useState('12:00');
  const [minutes, setMinutes] = useState(10);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  const invalidAlarm = !validAlarmName(name) || !validAlarmTime(time);
  const invalidTimer = !validAlarmName(name) || !validTimerMinutes(minutes);

  function resetComposer() { setName(''); setEditingId(null); setFeedback(''); }
  function saveAlarm() {
    const ok = editingId ? controller.updateAlarm(editingId, name, time) : controller.addAlarm(name, time);
    if (ok) { setFeedback(editingId ? 'Alarma actualizada.' : 'Alarma creada.'); setName(''); setEditingId(null); }
  }
  function startTimer() {
    if (controller.addTimer(name, minutes)) { setFeedback('Timer iniciado.'); setName(''); }
  }
  function editAlarm(id: string) {
    const alarm = controller.state.alarms.find(item => item.id === id);
    if (!alarm) return;
    setMode('alarms'); setEditingId(id); setName(alarm.name); setTime(alarm.time); setFeedback('Editando alarma.');
  }

  return <main className="alarms-screen app-content" aria-label="Alarmas y timers">
    <header className="alarms-heading"><div><span className="eyebrow">A TU TIEMPO</span><h1>Alarmas <i>·</i> Timers</h1></div><div className="alarm-mode-switch" aria-label="Tipo de aviso"><button aria-pressed={mode === 'alarms'} onClick={() => { setMode('alarms'); resetComposer(); }}><BellRinging size={17} />Alarmas</button><button aria-pressed={mode === 'timers'} onClick={() => { setMode('timers'); resetComposer(); }}><Clock size={17} />Timers</button></div></header>
    <div className="alarms-layout">
      <section className="alarm-composer">
        <div className="alarm-composer-title"><span>{editingId ? 'EDITAR ALARMA' : mode === 'alarms' ? 'NUEVA ALARMA' : 'NUEVO TIMER'}</span>{editingId && <button aria-label="Cancelar edición" onClick={resetComposer}><X size={17} /></button>}</div>
        <label><span>NOMBRE</span><input value={name} maxLength={40} placeholder={mode === 'alarms' ? 'Ej. Frutas' : 'Ej. Pausa activa'} onChange={event => setName(event.target.value)} /></label>
        {mode === 'alarms' ? <label><span>HORA · TODOS LOS DÍAS</span><input type="time" value={time} onChange={event => setTime(event.target.value)} /></label> : <><label><span>DURACIÓN</span><div className="timer-duration"><input aria-label="Duración del timer en minutos" type="number" min="1" max="720" value={minutes} onChange={event => setMinutes(Number(event.target.value))} /><b>min</b></div></label><div className="timer-presets">{[5, 10, 20, 30].map(value => <button key={value} aria-pressed={minutes === value} onClick={() => setMinutes(value)}>{value}</button>)}</div></>}
        <button className="alarm-primary" disabled={mode === 'alarms' ? invalidAlarm : invalidTimer} onClick={mode === 'alarms' ? saveAlarm : startTimer}>{editingId ? <Check size={18} /> : mode === 'alarms' ? <Plus size={18} /> : <Play size={18} weight="fill" />}{editingId ? 'Guardar cambios' : mode === 'alarms' ? 'Crear alarma' : 'Iniciar timer'}</button>
        <button className="alarm-preview" onClick={() => controller.preview(name)}>Probar animación</button>
      </section>
      <section className="alarms-list-panel">
        <div className="alarms-list-heading"><div><h2>{mode === 'alarms' ? 'Tus alarmas' : 'Timers activos'}</h2><span>{mode === 'alarms' ? `${controller.state.alarms.filter(item => item.enabled).length} activas` : `${controller.state.timers.filter(item => item.status === 'running').length} corriendo`}</span></div>{feedback && <small role="status">{feedback}</small>}</div>
        <div className="alarms-list">
          {mode === 'alarms' ? controller.state.alarms.map(alarm => <article className={`alarm-row ${alarm.ringing ? 'is-ringing' : ''}`} key={alarm.id}><button className="alarm-row-main" onClick={() => editAlarm(alarm.id)}><time>{alarm.time}</time><span><strong>{alarm.name}</strong><small>Todos los días</small></span><PencilSimple size={15} /></button><label className="alarm-switch"><input type="checkbox" role="switch" aria-label={`${alarm.enabled ? 'Desactivar' : 'Activar'} ${alarm.name}`} checked={alarm.enabled} onChange={event => controller.toggleAlarm(alarm.id, event.target.checked)} /></label><button className="alarm-delete" aria-label={`Eliminar ${alarm.name}`} onClick={() => controller.removeAlarm(alarm.id)}><Trash size={17} /></button></article>) : controller.state.timers.map(timer => { const remaining = remainingNamedTimer(timer, controller.now); return <article className={`timer-row ${timer.status === 'ringing' ? 'is-ringing' : ''}`} key={timer.id}><span className="timer-row-time" role="timer">{formatTimerDuration(remaining)}</span><span className="timer-row-copy"><strong>{timer.name}</strong><small>{timer.status === 'running' ? 'En marcha' : timer.status === 'paused' ? 'En pausa' : 'Finalizado'}</small></span><button aria-label={timer.status === 'running' ? `Pausar ${timer.name}` : `Iniciar ${timer.name}`} onClick={() => timer.status === 'running' ? controller.pauseTimer(timer.id) : controller.startTimer(timer.id)}>{timer.status === 'running' ? <Pause size={18} weight="fill" /> : <Play size={18} weight="fill" />}</button><button className="alarm-delete" aria-label={`Eliminar ${timer.name}`} onClick={() => controller.removeTimer(timer.id)}><Trash size={17} /></button></article>; })}
          {mode === 'alarms' && !controller.state.alarms.length && <div className="alarms-empty"><BellRinging size={29} weight="thin" /><strong>Tu día, a su tiempo.</strong><span>Crea una alarma diaria con nombre.</span></div>}
          {mode === 'timers' && !controller.state.timers.length && <div className="alarms-empty"><Clock size={29} weight="thin" /><strong>Ningún timer activo.</strong><span>Elige un nombre y una duración.</span></div>}
        </div>
      </section>
    </div>
    {!controller.storageAvailable && <footer className="alarms-storage-error">No se pueden guardar los avisos en este navegador.</footer>}
  </main>;
}
