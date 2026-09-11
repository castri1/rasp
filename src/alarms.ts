export type NamedTimerStatus = 'running' | 'paused' | 'ringing';

export interface DailyAlarm {
  id: string;
  name: string;
  time: string;
  enabled: boolean;
  ringing: boolean;
  lastTriggeredKey: string;
}

export interface NamedTimer {
  id: string;
  name: string;
  durationMs: number;
  remainingMs: number;
  deadline: number | null;
  status: NamedTimerStatus;
}

export interface AlarmsState {
  version: 1;
  alarms: DailyAlarm[];
  timers: NamedTimer[];
}

export interface ActiveAlarm {
  id: string;
  sourceId: string;
  kind: 'alarm' | 'timer' | 'preview';
  name: string;
}

export const ALARMS_STORAGE_KEY = 'rasp.alarms.v1';
export const EMPTY_ALARMS: AlarmsState = { version: 1, alarms: [], timers: [] };

export function validAlarmName(value: string) {
  const name = value.trim();
  return name.length >= 1 && name.length <= 40 && !/[\x00-\x1f\x7f]/.test(value);
}

export function validAlarmTime(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  return Boolean(match && Number(match[1]) <= 23 && Number(match[2]) <= 59);
}

export function validTimerMinutes(value: number) {
  return Number.isInteger(value) && value >= 1 && value <= 720;
}

export function remainingNamedTimer(timer: NamedTimer, now: number) {
  return timer.status === 'running' && timer.deadline !== null ? Math.max(0, Math.min(timer.durationMs, timer.deadline - now)) : timer.remainingMs;
}

function localDayKey(now: number) {
  const value = new Date(now);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function localTime(now: number) {
  const value = new Date(now);
  return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;
}

export function reconcileAlarms(state: AlarmsState, now: number): AlarmsState {
  const time = localTime(now);
  const triggerKey = `${localDayKey(now)}T${time}`;
  let changed = false;
  const alarms = state.alarms.map(alarm => {
    if (!alarm.enabled || alarm.time !== time || alarm.lastTriggeredKey === triggerKey) return alarm;
    changed = true;
    return { ...alarm, ringing: true, lastTriggeredKey: triggerKey };
  });
  const timers = state.timers.map(timer => {
    if (timer.status !== 'running' || timer.deadline === null || timer.deadline > now) return timer;
    changed = true;
    return { ...timer, status: 'ringing' as const, deadline: null, remainingMs: 0 };
  });
  return changed ? { ...state, alarms, timers } : state;
}

export function parseAlarms(raw: string, now: number): AlarmsState | null {
  try {
    const value = JSON.parse(raw) as Partial<AlarmsState>;
    if (value.version !== 1 || !Array.isArray(value.alarms) || !Array.isArray(value.timers) || value.alarms.length > 20 || value.timers.length > 20) return null;
    const ids = new Set<string>();
    const alarms: DailyAlarm[] = value.alarms.map(item => {
      if (!item || typeof item.id !== 'string' || !/^[a-zA-Z0-9-]{8,80}$/.test(item.id) || ids.has(item.id) || !validAlarmName(item.name) || !validAlarmTime(item.time) || typeof item.enabled !== 'boolean' || typeof item.ringing !== 'boolean' || typeof item.lastTriggeredKey !== 'string' || item.lastTriggeredKey.length > 32) throw new Error();
      ids.add(item.id);
      return { id: item.id, name: item.name.trim(), time: item.time, enabled: item.enabled, ringing: item.ringing, lastTriggeredKey: item.lastTriggeredKey };
    });
    const timers: NamedTimer[] = value.timers.map(item => {
      if (!item || typeof item.id !== 'string' || !/^[a-zA-Z0-9-]{8,80}$/.test(item.id) || ids.has(item.id) || !validAlarmName(item.name) || !Number.isFinite(item.durationMs) || item.durationMs < 60_000 || item.durationMs > 720 * 60_000 || !Number.isFinite(item.remainingMs) || item.remainingMs < 0 || item.remainingMs > item.durationMs || !['running', 'paused', 'ringing'].includes(item.status) || (item.status === 'running' ? !Number.isFinite(item.deadline) || item.deadline! > now + item.durationMs : item.deadline !== null)) throw new Error();
      ids.add(item.id);
      return { id: item.id, name: item.name.trim(), durationMs: item.durationMs, remainingMs: item.remainingMs, deadline: item.deadline, status: item.status };
    });
    return reconcileAlarms({ version: 1, alarms, timers }, now);
  } catch { return null; }
}

export function formatTimerDuration(ms: number) {
  const totalSeconds = Math.ceil(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor(totalSeconds % 3600 / 60);
  const seconds = totalSeconds % 60;
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}` : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
