import { useEffect, useMemo, useState } from 'react';
import { ALARMS_STORAGE_KEY, EMPTY_ALARMS, parseAlarms, reconcileAlarms, remainingNamedTimer, validAlarmName, validAlarmTime, validTimerMinutes } from './alarms';
import type { ActiveAlarm, AlarmsState } from './alarms';
import { createRequestId } from './browserCompat';

function loadState() {
  try { return parseAlarms(localStorage.getItem(ALARMS_STORAGE_KEY) || '', Date.now()) ?? structuredClone(EMPTY_ALARMS); }
  catch { return structuredClone(EMPTY_ALARMS); }
}

export function useAlarms() {
  const [state, setState] = useState<AlarmsState>(loadState);
  const [now, setNow] = useState(Date.now);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [preview, setPreview] = useState<ActiveAlarm | null>(null);

  useEffect(() => {
    try { localStorage.setItem(ALARMS_STORAGE_KEY, JSON.stringify(state)); setStorageAvailable(true); }
    catch { setStorageAvailable(false); }
  }, [state]);
  useEffect(() => {
    function tick() { const time = Date.now(); setNow(time); setState(previous => reconcileAlarms(previous, time)); }
    tick();
    const interval = window.setInterval(tick, 500);
    document.addEventListener('visibilitychange', tick);
    return () => { window.clearInterval(interval); document.removeEventListener('visibilitychange', tick); };
  }, []);
  useEffect(() => {
    function sync(event: StorageEvent) {
      if (event.key !== ALARMS_STORAGE_KEY || event.newValue === null) return;
      const next = parseAlarms(event.newValue, Date.now());
      if (next) setState(next);
    }
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  const activeAlerts = useMemo<ActiveAlarm[]>(() => [
    ...(preview ? [preview] : []),
    ...state.alarms.filter(item => item.ringing).map(item => ({ id: `alarm-${item.id}`, sourceId: item.id, kind: 'alarm' as const, name: item.name })),
    ...state.timers.filter(item => item.status === 'ringing').map(item => ({ id: `timer-${item.id}`, sourceId: item.id, kind: 'timer' as const, name: item.name })),
  ], [preview, state]);

  function addAlarm(name: string, time: string) {
    if (!validAlarmName(name) || !validAlarmTime(time) || state.alarms.length >= 20) return false;
    setState(previous => ({ ...previous, alarms: [...previous.alarms, { id: createRequestId(), name: name.trim(), time, enabled: true, ringing: false, lastTriggeredKey: '' }] }));
    return true;
  }
  function updateAlarm(id: string, name: string, time: string) {
    if (!validAlarmName(name) || !validAlarmTime(time)) return false;
    setState(previous => ({ ...previous, alarms: previous.alarms.map(item => item.id === id ? { ...item, name: name.trim(), time, ringing: false, lastTriggeredKey: '' } : item) }));
    return true;
  }
  function addTimer(name: string, minutes: number) {
    if (!validAlarmName(name) || !validTimerMinutes(minutes) || state.timers.length >= 20) return false;
    const durationMs = minutes * 60_000;
    setState(previous => ({ ...previous, timers: [...previous.timers, { id: createRequestId(), name: name.trim(), durationMs, remainingMs: durationMs, deadline: Date.now() + durationMs, status: 'running' }] }));
    return true;
  }
  function dismiss(alert: ActiveAlarm) {
    if (alert.kind === 'preview') { setPreview(null); return; }
    setState(previous => alert.kind === 'alarm' ? { ...previous, alarms: previous.alarms.map(item => item.id === alert.sourceId ? { ...item, ringing: false } : item) } : { ...previous, timers: previous.timers.map(item => item.id === alert.sourceId ? { ...item, status: 'paused', remainingMs: item.durationMs, deadline: null } : item) });
  }
  function pauseTimer(id: string) {
    const time = Date.now();
    setState(previous => ({ ...previous, timers: previous.timers.map(item => item.id === id && item.status === 'running' ? { ...item, status: 'paused', remainingMs: remainingNamedTimer(item, time), deadline: null } : item) }));
  }
  function startTimer(id: string) {
    const time = Date.now();
    setState(previous => ({ ...previous, timers: previous.timers.map(item => {
      if (item.id !== id || item.status === 'running') return item;
      const remainingMs = item.status === 'ringing' || item.remainingMs <= 0 ? item.durationMs : item.remainingMs;
      return { ...item, status: 'running', remainingMs, deadline: time + remainingMs };
    }) }));
  }

  return {
    state, now, storageAvailable, activeAlerts,
    addAlarm, updateAlarm,
    removeAlarm: (id: string) => setState(previous => ({ ...previous, alarms: previous.alarms.filter(item => item.id !== id) })),
    toggleAlarm: (id: string, enabled: boolean) => setState(previous => ({ ...previous, alarms: previous.alarms.map(item => item.id === id ? { ...item, enabled, ringing: false } : item) })),
    addTimer, pauseTimer, startTimer,
    removeTimer: (id: string) => setState(previous => ({ ...previous, timers: previous.timers.filter(item => item.id !== id) })),
    dismiss,
    preview: (name: string) => setPreview({ id: 'preview', sourceId: 'preview', kind: 'preview', name: validAlarmName(name) ? name.trim() : 'Pausa activa' }),
  };
}

export type AlarmsController = ReturnType<typeof useAlarms>;
