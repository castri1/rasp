export interface CalendarEvent {
  id: string;
  title: string;
  start: number;
  end: number;
  description: string;
  people: string[];
  location: string;
  hasMeet: boolean;
}

export type Dataset = 'standard' | 'long' | 'busy' | 'overlap' | 'no-meet';
export type Scenario = 'day' | 'reminder' | 'starting' | 'ongoing' | 'free' | 'done' | 'offline' | 'mac-off';

export const scenarios: { id: Scenario; label: string; time: number; caption: string }[] = [
  { id: 'day', label: 'Mi día', time: 642, caption: 'Un vistazo a lo que viene. El resto puede esperar.' },
  { id: 'reminder', label: 'En 5 minutos', time: 655, caption: 'Cuando se acerca una reunión, lo importante pasa al frente.' },
  { id: 'starting', label: 'Es ahora', time: 660, caption: 'Un toque en la pantalla. Tu reunión, lista en el Mac.' },
  { id: 'ongoing', label: 'En reunión', time: 672, caption: 'El tiempo que queda, sin perder de vista lo que sigue.' },
  { id: 'free', label: 'Día libre', time: 642, caption: 'También hay espacio para no tener nada en la agenda.' },
  { id: 'done', label: 'Día completo', time: 990, caption: 'Cuando termina el día, la pantalla también baja el ritmo.' },
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

export function formatTime(seconds: number): string {
  const minutes = Math.floor(Math.max(0, seconds) / 60) % 1440;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export function duration(event: CalendarEvent): string { return `${event.end - event.start} min`; }

export function timeUntil(event: CalendarEvent, seconds: number): string {
  const remaining = Math.max(0, event.start * 60 - seconds);
  return `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(Math.floor(remaining % 60)).padStart(2, '0')}`;
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
