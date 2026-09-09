import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CalendarBlank, CaretLeft, CaretRight, Clock, SpinnerGap, VideoCamera } from '@phosphor-icons/react';
import type { CalendarEvent } from './calendar';
import { calendarDateKey, calendarGridRange, formatTime, getDemoCalendarEvents, startOfCalendarWeek } from './calendar';
import type { GoogleCalendarController } from './useGoogleCalendar';
import './calendar-screen.css';

type CalendarView = 'day' | 'week' | 'month';

function addDays(value: Date, amount: number) {
  const next = new Date(value);
  next.setDate(next.getDate() + amount);
  return next;
}

function eventsForDate(events: CalendarEvent[], date: Date) {
  const key = calendarDateKey(date);
  return events.filter(event => event.date === key).sort((a, b) => a.start - b.start || a.title.localeCompare(b.title));
}

function sentence(value: string) {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function fullDate(value: Date) {
  return sentence(value.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' }));
}

function monthTitle(value: Date) {
  return sentence(value.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' }));
}

function weekTitle(value: Date) {
  const start = startOfCalendarWeek(value);
  const end = addDays(start, 6);
  if (start.getMonth() === end.getMonth()) return `${start.getDate()}–${end.getDate()} de ${end.toLocaleDateString('es-CO', { month: 'long' })}`;
  return `${start.getDate()} ${start.toLocaleDateString('es-CO', { month: 'short' })} – ${end.getDate()} ${end.toLocaleDateString('es-CO', { month: 'short' })}`;
}

function eventHasEnded(event: CalendarEvent, now: number) {
  return event.endAt ? Date.parse(event.endAt) <= now : false;
}

function EventRow({ event, now, onSelect }: { event: CalendarEvent; now: number; onSelect: (event: CalendarEvent) => void }) {
  const ended = eventHasEnded(event, now);
  return <button className={`calendar-event-row ${ended ? 'is-ended' : ''}`} onClick={() => onSelect(event)}>
    <span className="calendar-event-time">{formatTime(event.start * 60)}</span>
    <span className="calendar-event-rule" />
    <span className="calendar-event-copy"><strong>{event.title}</strong><small>{event.hasMeet ? 'Google Meet' : event.location}</small></span>
    {event.hasMeet ? <VideoCamera size={16} /> : <Clock size={16} />}
  </button>;
}

function DayView({ date, events, now, onSelect }: { date: Date; events: CalendarEvent[]; now: number; onSelect: (event: CalendarEvent) => void }) {
  const dayEvents = eventsForDate(events, date);
  return <div className="calendar-day-view">
    <div className="calendar-day-summary">
      <span className="eyebrow">{date.toLocaleDateString('es-CO', { weekday: 'long' }).toUpperCase()}</span>
      <strong>{date.getDate()}</strong>
      <span>{date.toLocaleDateString('es-CO', { month: 'long' })}</span>
      <p>{dayEvents.length === 0 ? 'Un día libre.' : dayEvents.length === 1 ? '1 encuentro' : `${dayEvents.length} encuentros`}</p>
    </div>
    <div className="calendar-day-list" aria-label={`Agenda de ${fullDate(date)}`}>
      {dayEvents.length > 0 ? dayEvents.map(event => <EventRow key={event.id} event={event} now={now} onSelect={onSelect} />) : <div className="calendar-empty"><CalendarBlank size={34} weight="thin" /><strong>Nada programado</strong><span>Este espacio también es parte de tu agenda.</span></div>}
    </div>
  </div>;
}

function WeekView({ date, today, events, onDate, onSelect }: { date: Date; today: Date; events: CalendarEvent[]; onDate: (date: Date) => void; onSelect: (event: CalendarEvent) => void }) {
  const start = startOfCalendarWeek(date);
  const days = Array.from({ length: 7 }, (_, index) => addDays(start, index));
  const todayKey = calendarDateKey(today);
  return <div className="calendar-week-view" aria-label={`Semana del ${weekTitle(date)}`}>
    {days.map(day => {
      const dayEvents = eventsForDate(events, day);
      const key = calendarDateKey(day);
      return <section className={`calendar-week-day ${key === todayKey ? 'is-today' : ''}`} key={key}>
        <button className="calendar-week-date" onClick={() => onDate(day)} aria-label={`Ver ${fullDate(day)}`}>
          <span>{day.toLocaleDateString('es-CO', { weekday: 'short' }).replace('.', '')}</span><strong>{day.getDate()}</strong>
        </button>
        <div className="calendar-week-events">
          {dayEvents.slice(0, 3).map(event => <button key={event.id} className="calendar-week-event" onClick={() => onSelect(event)} title={event.title}>
            <span>{formatTime(event.start * 60)}</span><strong>{event.title}</strong>
          </button>)}
          {dayEvents.length === 0 && <span className="calendar-week-free">—</span>}
          {dayEvents.length > 3 && <button className="calendar-more" onClick={() => onDate(day)}>+{dayEvents.length - 3}</button>}
        </div>
      </section>;
    })}
  </div>;
}

function MonthView({ date, today, events, onDate }: { date: Date; today: Date; events: CalendarEvent[]; onDate: (date: Date) => void }) {
  const { start } = calendarGridRange(date);
  const days = Array.from({ length: 42 }, (_, index) => addDays(start, index));
  const todayKey = calendarDateKey(today);
  const selectedKey = calendarDateKey(date);
  return <div className="calendar-month-view">
    <div className="calendar-weekdays" aria-hidden="true">{['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(day => <span key={day}>{day}</span>)}</div>
    <div className="calendar-month-grid">
      {days.map(day => {
        const key = calendarDateKey(day);
        const dayEvents = eventsForDate(events, day);
        return <button key={key} className={`calendar-month-day ${day.getMonth() !== date.getMonth() ? 'is-outside' : ''} ${key === todayKey ? 'is-today' : ''} ${key === selectedKey ? 'is-selected' : ''}`} onClick={() => onDate(day)} aria-label={`${fullDate(day)}, ${dayEvents.length} eventos`}>
          <span>{day.getDate()}</span>
          <span className="calendar-dots">{dayEvents.slice(0, 3).map(event => <i key={event.id} />)}</span>
          {dayEvents.length > 3 && <small>+{dayEvents.length - 3}</small>}
        </button>;
      })}
    </div>
  </div>;
}

export default function CalendarScreen({ calendar, demo, seconds, onBack, onSelect }: { calendar: GoogleCalendarController; demo: boolean; seconds: number; onBack: () => void; onSelect: (event: CalendarEvent) => void }) {
  const today = useMemo(() => demo ? new Date(2026, 8, 7) : new Date(), [demo]);
  const now = useMemo(() => {
    if (!demo) return Date.now();
    const value = new Date(today);
    value.setHours(Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60, 0);
    return value.getTime();
  }, [demo, seconds, today]);
  const [view, setView] = useState<CalendarView>('day');
  const [cursor, setCursor] = useState(() => new Date(today));
  const range = calendarGridRange(cursor);
  const rangeKey = `${range.timeMin}|${range.timeMax}`;
  const demoEvents = useMemo(() => getDemoCalendarEvents(cursor), [cursor.getFullYear(), cursor.getMonth()]);
  const events = demo ? demoEvents : calendar.calendarEvents;

  useEffect(() => {
    if (demo || !calendar.config.connected || calendar.calendarRangeKey === rangeKey) return;
    void calendar.loadCalendarRange(cursor);
  }, [calendar.config.connected, calendar.calendarRangeKey, calendar.loadCalendarRange, cursor.getFullYear(), cursor.getMonth(), demo, rangeKey]);

  function move(direction: number) {
    setCursor(previous => {
      const next = new Date(previous);
      if (view === 'day') next.setDate(next.getDate() + direction);
      else if (view === 'week') next.setDate(next.getDate() + direction * 7);
      else next.setMonth(next.getMonth() + direction, 1);
      return next;
    });
  }

  function openDate(date: Date) { setCursor(new Date(date)); setView('day'); }
  const title = view === 'day' ? fullDate(cursor) : view === 'week' ? weekTitle(cursor) : monthTitle(cursor);

  return <main className="calendar-browser">
    <div className="calendar-toolbar">
      <button className="calendar-now" onClick={onBack}><ArrowLeft size={16} />Ahora</button>
      <div className="calendar-view-switch" aria-label="Vista del calendario">
        {(['day', 'week', 'month'] as CalendarView[]).map(option => <button key={option} aria-pressed={view === option} onClick={() => setView(option)}>{option === 'day' ? 'Día' : option === 'week' ? 'Semana' : 'Mes'}</button>)}
      </div>
      <div className="calendar-navigation">
        <button aria-label="Periodo anterior" onClick={() => move(-1)}><CaretLeft size={17} /></button>
        <button onClick={() => setCursor(new Date(today))}>Hoy</button>
        <button aria-label="Periodo siguiente" onClick={() => move(1)}><CaretRight size={17} /></button>
      </div>
    </div>
    <div className="calendar-period"><h1>{title}</h1><span>{calendar.calendarLoading && !demo ? <><SpinnerGap className="spinning" size={13} /> Actualizando</> : demo ? 'Vista de ejemplo' : calendar.calendarMessage || 'Google Calendar'}</span></div>
    <div className="calendar-view-body">
      {view === 'day' ? <DayView date={cursor} events={events} now={now} onSelect={onSelect} /> : view === 'week' ? <WeekView date={cursor} today={today} events={events} onDate={openDate} onSelect={onSelect} /> : <MonthView date={cursor} today={today} events={events} onDate={openDate} />}
      {!demo && calendar.calendarLoading && events.length === 0 && <div className="calendar-loading"><SpinnerGap className="spinning" size={25} /><span>Cargando tu calendario…</span></div>}
    </div>
  </main>;
}
