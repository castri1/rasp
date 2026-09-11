import { describe, expect, it } from 'vitest';
import { EMPTY_ALARMS, formatTimerDuration, parseAlarms, reconcileAlarms, remainingNamedTimer } from './alarms';

describe('named alarms and timers', () => {
  it('rings a daily alarm once during its matching minute', () => {
    const now = new Date(2026, 8, 11, 9, 30, 10).getTime();
    const state = { ...structuredClone(EMPTY_ALARMS), alarms: [{ id: 'alarm-test-001', name: 'Frutas', time: '09:30', enabled: true, ringing: false, lastTriggeredKey: '' }] };
    const ringing = reconcileAlarms(state, now);
    expect(ringing.alarms[0].ringing).toBe(true);
    expect(reconcileAlarms({ ...ringing, alarms: [{ ...ringing.alarms[0], ringing: false }] }, now + 20_000).alarms[0].ringing).toBe(false);
  });

  it('reconciles an expired timer and keeps useful countdown formatting', () => {
    const timer = { id: 'timer-test-001', name: 'Pausa activa', durationMs: 300_000, remainingMs: 300_000, deadline: 1_100_000, status: 'running' as const };
    expect(remainingNamedTimer(timer, 1_040_000)).toBe(60_000);
    expect(formatTimerDuration(60_000)).toBe('01:00');
    const result = reconcileAlarms({ ...structuredClone(EMPTY_ALARMS), timers: [timer] }, 1_100_000);
    expect(result.timers[0]).toMatchObject({ status: 'ringing', remainingMs: 0, deadline: null });
  });

  it('loads only bounded valid local data', () => {
    const valid = JSON.stringify({ version: 1, alarms: [{ id: 'alarm-test-002', name: 'Agua', time: '15:05', enabled: true, ringing: false, lastTriggeredKey: '' }], timers: [] });
    expect(parseAlarms(valid, Date.now())?.alarms[0].name).toBe('Agua');
    expect(parseAlarms(valid.replace('15:05', '27:90'), Date.now())).toBeNull();
  });
});
