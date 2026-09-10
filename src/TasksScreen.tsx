import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowsClockwise, CalendarBlank, Check, CheckSquare, CircleNotch, ListChecks, SlidersHorizontal, WarningCircle } from '@phosphor-icons/react';
import type { ReminderList, ReminderTask, RemindersController } from './useReminders';
import './tasks.css';

const DEMO_LISTS: ReminderList[] = [
  { id: 'work', name: 'Trabajo' }, { id: 'personal', name: 'Personal' }, { id: 'ideas', name: 'Ideas' }, { id: 'shopping', name: 'Compras' },
];
const DEMO_TASKS: ReminderTask[] = [
  { id: 'one', title: 'Revisar propuesta del nuevo proyecto', notes: '', listId: 'work', listName: 'Trabajo', dueAt: new Date(2026, 8, 7, 12).toISOString(), priority: 5 },
  { id: 'two', title: 'Enviar seguimiento al equipo', notes: '', listId: 'work', listName: 'Trabajo', dueAt: new Date(2026, 8, 7, 16).toISOString(), priority: 0 },
  { id: 'three', title: 'Reservar la cita de Juan Rafael', notes: '', listId: 'personal', listName: 'Personal', dueAt: new Date(2026, 8, 8, 9).toISOString(), priority: 0 },
  { id: 'four', title: 'Comprar café', notes: '', listId: 'shopping', listName: 'Compras', dueAt: '', priority: 0 },
];

function dueLabel(value: string, today: Date) {
  if (!value) return 'Sin fecha';
  const due = new Date(value);
  const day = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime();
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const difference = Math.round((day - base) / 86_400_000);
  const time = due.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false });
  if (difference < 0) return `Vencido · ${due.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}`;
  if (difference === 0) return `Hoy · ${time}`;
  if (difference === 1) return `Mañana · ${time}`;
  return due.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' }).replace('.', '');
}

function taskOrder(task: ReminderTask) {
  return task.dueAt ? Date.parse(task.dueAt) : Number.MAX_SAFE_INTEGER;
}

export default function TasksScreen({ controller, demo }: { controller: RemindersController; demo: boolean }) {
  const [configuring, setConfiguring] = useState(false);
  const [demoSelected, setDemoSelected] = useState(['work', 'personal']);
  const [completedDemo, setCompletedDemo] = useState<string[]>([]);
  const today = useMemo(() => demo ? new Date(2026, 8, 7, 10, 42) : new Date(), [demo]);
  const lists = demo ? DEMO_LISTS : controller.lists;
  const selected = demo ? demoSelected : controller.selectedListIds;
  const tasks = (demo ? DEMO_TASKS.filter(task => !completedDemo.includes(task.id)) : controller.tasks)
    .filter(task => selected.includes(task.listId)).sort((a, b) => taskOrder(a) - taskOrder(b) || b.priority - a.priority);

  function toggleList(id: string) {
    if (demo) setDemoSelected(previous => previous.includes(id) ? previous.filter(item => item !== id) : [...previous, id]);
    else controller.toggleList(id);
  }

  async function complete(task: ReminderTask) {
    if (demo) setCompletedDemo(previous => [...previous, task.id]);
    else await controller.complete(task.id);
  }

  if (configuring) return <main className="tasks-screen app-content" aria-label="Configurar listas de Recordatorios">
    <div className="tasks-config-heading"><button onClick={() => setConfiguring(false)}><ArrowLeft size={17} />Pendientes</button><div><span className="eyebrow">RECORDATORIOS DEL MAC</span><h1>Elige qué listas ver.</h1></div><button aria-label="Actualizar listas" disabled={!demo && controller.loading} onClick={() => { if (!demo) void controller.refreshLists(); }}>{!demo && controller.loading ? <CircleNotch className="spinning" size={17} /> : <ArrowsClockwise size={17} />}</button></div>
    <section className="tasks-list-picker">
      {lists.map(list => <button key={list.id} aria-pressed={selected.includes(list.id)} onClick={() => toggleList(list.id)}><span className="list-check">{selected.includes(list.id) && <Check size={15} weight="bold" />}</span><span>{list.name}</span></button>)}
      {!lists.length && <div className="tasks-picker-empty"><WarningCircle size={22} /><span>{controller.loading ? 'Buscando tus listas…' : controller.error || 'No se encontraron listas en el Mac.'}</span></div>}
    </section>
    <footer className="tasks-config-footer"><span>{selected.length ? `${selected.length} lista${selected.length === 1 ? '' : 's'} sincronizada${selected.length === 1 ? '' : 's'}` : 'Ninguna lista seleccionada'}</span><button onClick={() => setConfiguring(false)}>Listo <Check size={16} /></button></footer>
  </main>;

  return <main className="tasks-screen app-content" aria-label="Pendientes de Recordatorios">
    <header className="tasks-heading"><div><span className="eyebrow">TUS PENDIENTES</span><h1>Lo que sigue<span>.</span></h1></div><div className="tasks-heading-actions"><span>{selected.length} lista{selected.length === 1 ? '' : 's'}</span><button aria-label="Actualizar pendientes" disabled={!demo && controller.loading} onClick={() => { if (!demo) void controller.refresh(); }}>{!demo && controller.loading ? <CircleNotch className="spinning" size={17} /> : <ArrowsClockwise size={17} />}</button><button onClick={() => setConfiguring(true)}><SlidersHorizontal size={17} />Listas</button></div></header>
    <div className="tasks-layout">
      <aside className="tasks-summary"><span className="tasks-count">{tasks.length}</span><strong>{tasks.length === 1 ? 'pendiente' : 'pendientes'}</strong><p>{tasks.filter(task => task.dueAt && Date.parse(task.dueAt) < today.getTime()).length ? 'Hay algo que pide tu atención.' : 'Todo a su tiempo.'}</p><div><ListChecks size={17} /><span>Sólo las listas que elegiste.</span></div></aside>
      <section className="tasks-list" aria-label="Lista de pendientes">
        {!selected.length ? <button className="tasks-empty tasks-empty-action" onClick={() => setConfiguring(true)}><SlidersHorizontal size={29} /><strong>Elige tus listas</strong><span>Decide cuáles sincronizar desde el Mac.</span></button> : tasks.length ? tasks.map(task => <div className="task-row" key={task.id}>
          <button className="task-complete" disabled={controller.busyTask === task.id} aria-label={`Completar ${task.title}`} onClick={() => void complete(task)}>{controller.busyTask === task.id ? <CircleNotch className="spinning" size={17} /> : <span />}</button>
          <div className="task-copy"><strong>{task.title}</strong><span><i>{task.listName}</i><span className={task.dueAt && Date.parse(task.dueAt) < today.getTime() ? 'is-overdue' : ''}><CalendarBlank size={12} />{dueLabel(task.dueAt, today)}</span></span></div>
          {task.priority > 0 && <span className="task-priority">!</span>}
        </div>) : <div className="tasks-empty"><CheckSquare size={34} weight="thin" /><strong>Todo listo</strong><span>No quedan pendientes en estas listas.</span></div>}
      </section>
    </div>
    {(controller.error || controller.message) && !demo && <footer className={`tasks-feedback ${controller.error ? 'has-error' : ''}`}>{controller.error ? <WarningCircle size={14} /> : <Check size={14} />}<span>{controller.error || controller.message}</span></footer>}
  </main>;
}
