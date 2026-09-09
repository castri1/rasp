import { describe, expect, it } from 'vitest';
import { DEFAULT_POMODORO, configureTimer, formatCountdown, parsePomodoro, pauseTimer, reconcileTimer, remainingTime, resetTimer, startTimer } from './pomodoro';

describe('Pomodoro real-time lifecycle', () => {
  const now = 1800000000000;
  it('uses a deadline so throttled tabs and sleep do not slow the clock', () => {
    const running = startTimer(DEFAULT_POMODORO, now);
    expect(remainingTime(running, now + 20000)).toBe(1480000);
    expect(reconcileTimer(running, now + 1500000).status).toBe('complete');
    expect(reconcileTimer(running, now + 3600000).remainingMs).toBe(0);
  });
  it('pauses exactly and resumes without counting the paused interval', () => {
    const paused = pauseTimer(startTimer(DEFAULT_POMODORO, now), now + 60450);
    expect(paused.status).toBe('paused');
    expect(paused.remainingMs).toBe(1439550);
    const resumed = startTimer(paused, now + 3600000);
    expect(resumed.deadline).toBe(now + 3600000 + 1439550);
    expect(formatCountdown(remainingTime(resumed, now + 3600550))).toBe('23:59');
  });
  it('recovers a running timer on reload and completes expired sessions once', () => {
    const running = startTimer(DEFAULT_POMODORO, now);
    const restored = parsePomodoro(JSON.stringify(running), now + 120000)!;
    expect(remainingTime(restored, now + 120000)).toBe(1380000);
    const completed = parsePomodoro(JSON.stringify(running), now + 1600000)!;
    expect(completed.status).toBe('complete');
    expect(reconcileTimer(completed, now + 1700000)).toBe(completed);
  });
  it('treats pause after expiry as completion, and reset keeps the chosen duration', () => {
    const configured = configureTimer(DEFAULT_POMODORO, 'focus', 45);
    const running = startTimer(configured, now);
    expect(configureTimer(running, 'break', 5)).toBe(running);
    expect(pauseTimer(running, now + 45 * 60000).status).toBe('complete');
    expect(resetTimer(running).remainingMs).toBe(45 * 60000);
  });
  it('keeps focus and break durations independent and rejects invalid input/storage', () => {
    const focus = configureTimer(DEFAULT_POMODORO, 'focus', 50);
    const rest = configureTimer(focus, 'break', 10);
    expect(rest.focusMinutes).toBe(50);
    expect(rest.totalMs).toBe(600000);
    for (const invalid of [0, -1, 121, 1.5, NaN]) expect(configureTimer(focus, 'focus', invalid)).toBe(focus);
    expect(parsePomodoro('{broken', now)).toBeNull();
    expect(parsePomodoro(JSON.stringify({ ...focus, totalMs: 1 }), now)).toBeNull();
    expect(parsePomodoro(JSON.stringify({ ...focus, status: 'running', deadline: now + 999999999 }), now)).toBeNull();
  });
});
