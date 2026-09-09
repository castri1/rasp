import { useEffect, useState } from 'react';
import { DEFAULT_POMODORO, POMODORO_KEY, configureTimer, parsePomodoro, pauseTimer, reconcileTimer, remainingTime, resetTimer, startTimer } from './pomodoro';
import type { TimerMode } from './pomodoro';

export function usePomodoro() {
  const [timer, setTimer] = useState(() => {
    try { return parsePomodoro(localStorage.getItem(POMODORO_KEY) ?? '', Date.now()) ?? DEFAULT_POMODORO; }
    catch { return DEFAULT_POMODORO; }
  });
  const [now, setNow] = useState(Date.now);
  const [storageAvailable, setStorageAvailable] = useState(true);
  useEffect(() => {
    function sync(event: StorageEvent) {
      if (event.key !== POMODORO_KEY || event.newValue === null) return;
      const current = parsePomodoro(event.newValue, Date.now());
      if (current) { setNow(Date.now()); setTimer(current); }
    }
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
  useEffect(() => {
    try { localStorage.setItem(POMODORO_KEY, JSON.stringify(timer)); setStorageAvailable(true); }
    catch { setStorageAvailable(false); }
  }, [timer]);
  useEffect(() => {
    if (timer.status !== 'running') return;
    function tick() { const time = Date.now(); setNow(time); setTimer(previous => reconcileTimer(previous, time)); }
    tick();
    const interval = setInterval(tick, 250);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', tick); };
  }, [timer.status]);
  function start() {
    const time = Date.now();
    const next = startTimer(timer, time);
    setNow(time); setTimer(next);
    return next;
  }
  return {
    timer, remaining: remainingTime(timer, now), storageAvailable, start,
    pause: () => setTimer(previous => pauseTimer(previous, Date.now())),
    reset: () => setTimer(previous => resetTimer(previous)),
    configure: (mode: TimerMode, minutes: number) => setTimer(previous => configureTimer(previous, mode, minutes)),
  };
}
export type PomodoroController = ReturnType<typeof usePomodoro>;
