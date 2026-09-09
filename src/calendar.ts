export interface CalendarEvent {
  id: string;
  title: string;
  start: number;
  end: number;
  date?: string;
  startAt?: string;
  endAt?: string;
  description: string;
  people: string[];
  location: string;
  hasMeet: boolean;
  meetUrl?: string;
}

export function calendarDateKey(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

export function startOfCalendarWeek(value: Date): Date {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return date;
}

export function calendarGridRange(value: Date) {
  const first = new Date(value.getFullYear(), value.getMonth(), 1);
  const start = startOfCalendarWeek(first);
  const end = new Date(start);
  end.setDate(end.getDate() + 42);
  return { start, end, timeMin: start.toISOString(), timeMax: end.toISOString() };
}

export type Dataset = 'standard' | 'long' | 'busy' | 'overlap' | 'no-meet';
export type Scenario = 'day' | 'reminder' | 'starting' | 'ongoing' | 'free' | 'done' | 'night' | 'offline' | 'mac-off';

export const scenarios: { id: Scenario; label: string; time: number; caption: string }[] = [
  { id: 'day', label: 'Mi día', time: 642, caption: 'Un vistazo a lo que viene. El resto puede esperar.' },
  { id: 'reminder', label: 'En 5 minutos', time: 655, caption: 'Cuando se acerca una reunión, lo importante pasa al frente.' },
  { id: 'starting', label: 'Es ahora', time: 660, caption: 'Un toque en la pantalla. Tu reunión, lista en el Mac.' },
  { id: 'ongoing', label: 'En reunión', time: 672, caption: 'El tiempo que queda, sin perder de vista lo que sigue.' },
  { id: 'free', label: 'Día libre', time: 642, caption: 'También hay espacio para no tener nada en la agenda.' },
  { id: 'done', label: 'Fin de jornada', time: 990, caption: 'Cuando termina el día, la pantalla también baja el ritmo.' },
  { id: 'night', label: 'Noche', time: 1320, caption: 'Sin reuniones cerca, la pantalla se convierte en una pieza de arte viva.' },
  { id: 'offline', label: 'Sin conexión', time: 642, caption: 'Tu agenda guardada sigue aquí, incluso sin internet.' },
  { id: 'mac-off', label: 'Mac ausente', time: 655, caption: 'La pantalla te avisa si tu Mac aún no está disponible.' },
];

const standard: CalendarEvent[] = [
  { id: 'daily', title: 'Buenos días, equipo', start: 540, end: 565, description: 'Un encuentro breve para compartir prioridades y desbloquear el día.', people: ['Sofía', 'Mateo', 'Lucas'], location: 'Google Meet', hasMeet: true },
  { id: 'design', title: 'Diseño de producto', start: 660, end: 705, description: 'Revisamos la nueva experiencia, compartimos ideas y definimos los próximos pasos.', people: ['Sofía', 'Mateo'], location: 'Google Meet', hasMeet: true },
  { id: 'planning', title: 'Lo que viene', start: 780, end: 810, description: 'Una mirada a las prioridades de la semana y a lo que queremos construir.', people: ['Lucas', 'Valentina'], location: 'Google Meet', hasMeet: true },
  { id: 'coffee', title: 'Un café con el equipo', start: 930, end: 960, description: 'Una pausa para conversar, sin agenda y con un buen café.', people: ['Sofía', 'Lucas', 'Mateo'], location: 'Café de la esquina', hasMeet: false },
];

export function getEvents(dataset: Dataset, scenario: Scenario): CalendarEvent[] {
  if (scenario === 'free') return [];
  let events = standard.map(event => ({ ...event, people: [...event.people] }));
  if (dataset === 'long') events[1].title = 'Revisión de la experiencia de incorporación y planificación del próximo lanzamiento';
  if (dataset === 'no-meet') events[1] = { ...events[1], hasMeet: false, location: 'Sala de diseño · piso 2' };
  if (dataset === 'busy') {
    events = [...events, ...Array.from({ length: 7 }, (_, index) => ({
      ...standard[2], id: `extra-${index}`, title: ['Revisión de propuestas', 'Conversación con Ana', 'Seguimiento de proyecto', 'Ideas para el viernes', 'Revisión de contenidos', 'Cierre de pendientes', 'Última sincronización'][index], start: 720 + index * 40, end: 740 + index * 40,
    }))];
  }
  if (dataset === 'overlap') events.push({ ...standard[2], id: 'overlap', title: 'Conversación con Ana', start: 660, end: 690, people: ['Ana'] });
  return events.sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
}

const demoTitles = [
  ['Buenos días, equipo', 'Revisión de prioridades', 'Diseño de producto'],
  ['Planeación semanal', 'Conversación con clientes'],
  ['Seguimiento de producto', 'Bloque de trabajo', 'Revisión de contenidos'],
  ['Sincronización de equipo', 'Diseño de experiencia'],
  ['Cierre de pendientes', 'Un café con el equipo'],
];

/** A stable multi-week dataset keeps the browser preview useful without Google Calendar. */
export function getDemoCalendarEvents(anchor: Date): CalendarEvent[] {
  const { start } = calendarGridRange(anchor);
  const events: CalendarEvent[] = [];
  for (let offset = 0; offset < 42; offset += 1) {
    const date = new Date(start);
    date.setDate(date.getDate() + offset);
    const weekday = date.getDay();
    if (weekday === 0 || weekday === 6) continue;
    const titles = demoTitles[(weekday + offset) % demoTitles.length];
    const count = 1 + ((offset * 7 + weekday) % 3);
    for (let index = 0; index < count; index += 1) {
      const startMinutes = 540 + index * 125 + ((offset * 13) % 35);
      const length = index % 2 === 0 ? 45 : 30;
      const startAt = new Date(date);
      startAt.setHours(Math.floor(startMinutes / 60), startMinutes % 60, 0, 0);
      const endAt = new Date(startAt.getTime() + length * 60_000);
      events.push({
        id: `demo-${calendarDateKey(date)}-${index}`,
        title: titles[index % titles.length],
        start: startMinutes,
        end: startMinutes + length,
        date: calendarDateKey(date),
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        description: 'Un espacio reservado para avanzar con calma y claridad.',
        people: index % 2 ? ['Sofía', 'Mateo'] : ['Valentina', 'Lucas'],
        location: index === count - 1 && weekday === 5 ? 'Oficina' : 'Google Meet',
        hasMeet: !(index === count - 1 && weekday === 5),
      });
    }
  }
  return events;
}

export function formatTime(seconds: number): string {
  const minutes = Math.floor(Math.max(0, seconds) / 60) % 1440;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export function duration(event: CalendarEvent): string { return `${event.end - event.start} min`; }

export function timeUntil(event: CalendarEvent, seconds: number): string {
  const remaining = Math.max(0, event.start * 60 - seconds);
  return `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(Math.floor(remaining % 60)).padStart(2, '0')}`;
}

/** The agenda opens on what matters now, while leaving earlier meetings reachable above it. */
export function agendaAnchorIndex(events: CalendarEvent[], seconds: number): number {
  if (events.length === 0) return -1;
  const now = seconds / 60;
  const activeOrNext = events.findIndex(event => event.end > now);
  return activeOrNext === -1 ? events.length - 1 : activeOrNext;
}

export function getDayState(events: CalendarEvent[], seconds: number, acknowledged: ReadonlySet<string>) {
  const now = seconds / 60;
  const upcoming = events.filter(event => event.end > now);
  const current = upcoming.find(event => event.start <= now);
  const next = upcoming.find(event => event.start > now);
  // An imminent next event must still alert while another meeting is running.
  const alertEvents = upcoming.filter(event => event.start - now <= 5 && now - event.start < 1 && !acknowledged.has(event.id));
  const featured = alertEvents[0] ?? current ?? next;
  return { current, next, featured, alertEvents, upcoming, completed: events.filter(event => event.end <= now).length };
}
