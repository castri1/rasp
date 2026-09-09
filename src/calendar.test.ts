import { describe, expect, it } from 'vitest';
import { agendaAnchorIndex, formatTime, getDayState, getEvents, timeUntil } from './calendar';

describe('meeting clock', () => {
  const events = getEvents('standard', 'day');
  it('alerts only from five minutes before until one minute after start', () => {
    expect(getDayState(events, 654 * 60 + 59, new Set()).alertEvents).toHaveLength(0);
    expect(getDayState(events, 655 * 60, new Set()).alertEvents[0]?.id).toBe('design');
    expect(getDayState(events, 660 * 60, new Set()).alertEvents).toHaveLength(1);
    expect(getDayState(events, 661 * 60, new Set()).alertEvents).toHaveLength(0);
  });
  it('silences one meeting without suppressing overlapping reminders', () => {
    const state = getDayState(getEvents('overlap', 'day'), 655 * 60, new Set(['design']));
    expect(state.alertEvents.map(event => event.id)).toEqual(['overlap']);
  });
  it('preserves the next meeting when another meeting is in progress', () => {
    const overlapping = [...events, { ...events[1], id: 'later', start: 680, end: 700 }];
    expect(getDayState(overlapping, 678 * 60, new Set()).featured?.id).toBe('later');
  });
  it('ends meetings at the exact end time and handles empty days', () => {
    expect(getDayState(events, 705 * 60, new Set()).current).toBeUndefined();
    expect(getDayState(events, 990 * 60, new Set()).upcoming).toHaveLength(0);
    expect(getDayState([], 642 * 60, new Set()).featured).toBeUndefined();
  });
  it('formats countdowns and time without negative values', () => {
    expect(timeUntil(events[1], 659 * 60 + 59)).toBe('00:01');
    expect(timeUntil(events[1], 661 * 60)).toBe('00:00');
    expect(formatTime(642 * 60)).toBe('10:42');
  });
  it('opens the agenda on the current or next meeting instead of past events', () => {
    expect(agendaAnchorIndex(events, 642 * 60)).toBe(1);
    expect(agendaAnchorIndex(events, 672 * 60)).toBe(1);
    expect(agendaAnchorIndex(events, 750 * 60)).toBe(2);
    expect(agendaAnchorIndex(events, 990 * 60)).toBe(events.length - 1);
    expect(agendaAnchorIndex([], 642 * 60)).toBe(-1);
  });
});
