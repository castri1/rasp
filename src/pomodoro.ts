export type TimerMode = 'focus' | 'break';
export type TimerStatus = 'idle' | 'running' | 'paused' | 'complete';
export interface PomodoroState {
  version: 1;
  mode: TimerMode;
  status: TimerStatus;
  focusMinutes: number;
  breakMinutes: number;
  totalMs: number;
  remainingMs: number;
  deadline: number | null;
}
export const POMODORO_KEY = 'rasp.pomodoro.v1';
export const DEFAULT_POMODORO: PomodoroState = {
  version: 1, mode: 'focus', status: 'idle', focusMinutes: 25, breakMinutes: 5,
  totalMs: 25 * 60000, remainingMs: 25 * 60000, deadline: null,
};
export function validMinutes(value: number) { return Number.isInteger(value) && value >= 1 && value <= 120; }
export function remainingTime(state: PomodoroState, now: number) {
  return state.status === 'running' && state.deadline !== null ? Math.max(0, Math.min(state.totalMs, state.deadline - now)) : state.remainingMs;
}
export function reconcileTimer(state: PomodoroState, now: number): PomodoroState {
  return state.status === 'running' && remainingTime(state, now) === 0 ? { ...state, status: 'complete', deadline: null, remainingMs: 0 } : state;
}
export function configureTimer(state: PomodoroState, mode: TimerMode, minutes: number): PomodoroState {
  if (!validMinutes(minutes) || state.status === 'running' || state.status === 'paused') return state;
  return { ...state, mode, [mode === 'focus' ? 'focusMinutes' : 'breakMinutes']: minutes, status: 'idle', totalMs: minutes * 60000, remainingMs: minutes * 60000, deadline: null };
}
export function startTimer(state: PomodoroState, now: number): PomodoroState {
  if (state.status === 'running') return state;
  const remainingMs = state.status === 'paused' ? state.remainingMs : state.totalMs;
  return { ...state, status: 'running', remainingMs, deadline: now + remainingMs };
}
export function pauseTimer(state: PomodoroState, now: number): PomodoroState {
  const current = reconcileTimer(state, now);
  return current.status === 'running' ? { ...current, status: 'paused', remainingMs: remainingTime(current, now), deadline: null } : current;
}
export function resetTimer(state: PomodoroState): PomodoroState {
  return { ...state, status: 'idle', remainingMs: state.totalMs, deadline: null };
}
export function parsePomodoro(raw: string, now: number): PomodoroState | null {
  try {
    const p = JSON.parse(raw) as PomodoroState;
    if (!p || p.version !== 1 || !['focus', 'break'].includes(p.mode) || !['idle', 'running', 'paused', 'complete'].includes(p.status) ||
      !validMinutes(p.focusMinutes) || !validMinutes(p.breakMinutes) || !Number.isFinite(p.totalMs) || p.totalMs !== (p.mode === 'focus' ? p.focusMinutes : p.breakMinutes) * 60000 ||
      !Number.isFinite(p.remainingMs) || p.remainingMs < 0 || p.remainingMs > p.totalMs ||
      (p.status === 'running' ? !Number.isFinite(p.deadline) || p.deadline! > now + p.totalMs : p.deadline !== null) ||
      (p.status === 'complete' && p.remainingMs !== 0) || (p.status === 'paused' && p.remainingMs <= 0) || (p.status === 'idle' && p.remainingMs !== p.totalMs)) return null;
    return reconcileTimer({ version: 1, mode: p.mode, status: p.status, focusMinutes: p.focusMinutes, breakMinutes: p.breakMinutes, totalMs: p.totalMs, remainingMs: p.remainingMs, deadline: p.deadline }, now);
  } catch { return null; }
}
export function formatCountdown(ms: number) {
  const seconds = Math.ceil(ms / 1000);
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}
