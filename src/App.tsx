import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  ArrowCounterClockwise, ArrowLeft, ArrowRight, ArrowUpRight, BellSimple,
  BellSimpleSlash, CalendarBlank, Check, CheckCircle, Clock,
  Desktop, CornersOut, Info, Leaf, MapPin, GearSix, Lamp, Timer, Pause, Play, Plus,
  SlidersHorizontal, VideoCamera, WifiHigh, WifiSlash, X,
} from '@phosphor-icons/react';
import { duration, formatTime, getDayState, getEvents, scenarios, timeUntil } from './calendar';
import type { CalendarEvent, Dataset, Scenario } from './calendar';
import SettingsScreen from './SettingsScreen';
import type { SettingsSection } from './SettingsScreen';
import PomodoroScreen from './PomodoroScreen';
import { usePomodoro } from './usePomodoro';
import type { PomodoroController } from './usePomodoro';
import { useMacFocus } from './macFocus';
import type { MacFocusController } from './macFocus';
import type { ThemeController } from './useTheme';
import { formatCountdown } from './pomodoro';
import './app-screens.css';
import { useTheme } from './useTheme';
import AmbienceScreen from './AmbienceScreen';
import { useAlexa } from './useAlexa';
import type { AlexaController } from './useAlexa';
import type { SceneId } from './alexa';
import { useGoogleCalendar } from './useGoogleCalendar';
import type { GoogleCalendarController } from './useGoogleCalendar';

type AppView = 'agenda' | 'pomodoro' | 'ambience' | 'settings';
type OpenStatus = { id: string; state: 'opening' | 'opened' } | null;

function People({ names }: { names: string[] }) {
  return <div className="people">
    <div className="avatars" aria-hidden="true">{names.slice(0, 3).map((name, i) => <span key={name} className={`avatar avatar-${i}`}>{name.slice(0, 1)}</span>)}</div>
    <span>{names.length === 0 ? 'Sin invitados' : names.length === 1 ? `${names[0]} y tú` : names.length === 2 ? `${names[0]}, ${names[1]} y tú` : `${names.length} personas y tú`}</span>
  </div>;
}

function MeetAction({ event, available, status, onOpen }: { event: CalendarEvent; available: boolean; status: OpenStatus; onOpen: (event: CalendarEvent) => void }) {
  const opening = status?.id === event.id && status.state === 'opening';
  const opened = status?.id === event.id && status.state === 'opened';
  if (!event.hasMeet) return <div className="location-note"><MapPin size={19} /><span>{event.location}</span></div>;
  return <div className="meet-action">
    <button className={`primary-button ${opened ? 'is-opened' : ''}`} onClick={() => onOpen(event)} disabled={!available || opening}>
      {opened ? <Check size={19} weight="bold" /> : <VideoCamera size={20} />}
      <span>{!available ? 'Mac no disponible' : opening ? 'Abriendo…' : opened ? 'Abierto · simulación' : 'Abrir en mi Mac'}</span>
      {!opened && !opening && <ArrowUpRight size={18} className="button-arrow" />}
    </button>
    {!available && <span className="unavailable-help">Conecta tu Mac para abrir la reunión.</span>}
  </div>;
}

function EventDetails({ event, seconds, available, status, muted, onClose, onOpen, onMute }: {
  event: CalendarEvent; seconds: number; available: boolean; status: OpenStatus; muted: boolean;
  onClose: () => void; onOpen: (event: CalendarEvent) => void; onMute: (id: string) => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => previouslyFocused?.focus();
  }, []);
  return <div className="detail-backdrop">
    <div className="event-details" role="dialog" aria-modal="true" aria-labelledby="detail-title" ref={dialogRef} onKeyDown={event => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'Tab') {
        const buttons = [...(dialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
        const first = buttons[0];
        const last = buttons.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }}>
      <div className="detail-top"><span className="eyebrow">EN TU AGENDA DE HOY</span><button ref={closeRef} className="icon-button" onClick={onClose} aria-label="Cerrar detalles"><X size={23} /></button></div>
      <div className="detail-content">
        <span className="detail-time">{formatTime(event.start * 60)} <span>–</span> {formatTime(event.end * 60)} <span>· {duration(event)}</span></span>
        <h2 id="detail-title">{event.title}</h2>
        <p className="detail-description">{event.description}</p>
        <People names={event.people} />
        <div className="detail-platform">{event.hasMeet ? <VideoCamera size={18} /> : <MapPin size={18} />}{event.location}</div>
      </div>
      <div className="detail-actions">
        {event.end * 60 > seconds ? <MeetAction event={event} available={available} status={status} onOpen={onOpen} /> : <div className="ended-note"><CheckCircle size={21} />Esta reunión ya terminó</div>}
        {event.end * 60 > seconds && <button className="secondary-button" onClick={() => onMute(event.id)}>{muted ? <Check size={19} /> : <BellSimpleSlash size={19} />}{muted ? 'Aviso silenciado' : 'Silenciar este evento'}</button>}
      </div>
    </div>
  </div>;
}

function Agenda({ events, seconds, featured, onSelect, emptyMessage = <>Sin compromisos.<br />Con posibilidades.</> }: { events: CalendarEvent[]; seconds: number; featured?: CalendarEvent; onSelect: (event: CalendarEvent) => void; emptyMessage?: React.ReactNode }) {
  return <aside className="agenda" aria-label="Agenda de hoy">
    <div className="agenda-heading"><h2>Tu agenda</h2><span>{String(events.length).padStart(2, '0')}</span></div>
    {events.length === 0 ? <div className="empty-agenda"><CalendarBlank size={32} weight="thin" /><p>{emptyMessage}</p></div> : <div className="agenda-list">{events.map(event => {
      const past = event.end * 60 <= seconds;
      const current = event.start * 60 <= seconds && !past;
      const active = event.id === featured?.id;
      return <button key={event.id} className={`agenda-event ${past ? 'past' : ''} ${active ? 'active' : ''}`} onClick={() => onSelect(event)} aria-label={`Ver ${event.title}, ${formatTime(event.start * 60)}`}>
        <span className="agenda-marker">{past ? <Check size={11} weight="bold" /> : <span />}</span>
        <span className="agenda-event-content"><span className="agenda-time">{formatTime(event.start * 60)} <span>{current ? 'EN CURSO' : duration(event)}</span></span><span className="agenda-title">{event.title}</span><span className="agenda-platform">{event.hasMeet ? <VideoCamera size={12} /> : <MapPin size={12} />}{past ? 'Terminada' : event.location}</span></span>
      </button>;
    })}</div>}
    <div className="agenda-bottom"><span className="tiny-rule" />Solo lo importante, a su tiempo.</div>
  </aside>;
}

function ClockFace({ seconds, subtitle }: { seconds: number; subtitle: string }) {
  const [hours, minutes] = formatTime(seconds).split(':');
  return <div className="clock-block"><div className="clock" aria-label={`Hora ${hours}:${minutes}`}><span>{hours}</span><span className="clock-colon">:</span><span>{minutes}</span></div><p>{subtitle}</p></div>;
}

type CalendarMode = 'demo' | 'loading' | 'connected' | 'disconnected';

function Device({ alexa, calendar, calendarMode, initialScene, onAlexaSettings, onCalendarSettings, onSessionStart, view, onView, theme, pomodoro, mac, settingsSection, onSection, events, seconds, scenario, selected, setSelected, acknowledged, muted, onMute, onOpen, openStatus, notice, onNotice }: {
  alexa: AlexaController; calendar: GoogleCalendarController; calendarMode: CalendarMode; initialScene?: SceneId; onAlexaSettings: (scene?: SceneId) => void; onCalendarSettings: () => void; onSessionStart: (mode: 'focus' | 'break') => void;
  view: AppView; onView: (view: AppView) => void; theme: ThemeController; pomodoro: PomodoroController; mac: MacFocusController; settingsSection: SettingsSection; onSection: (section: SettingsSection) => void;
  events: CalendarEvent[]; seconds: number; scenario: Scenario; selected: CalendarEvent | null; setSelected: (event: CalendarEvent | null) => void;
  acknowledged: Set<string>; muted: Set<string>; onMute: (id: string) => void; onOpen: (event: CalendarEvent) => void; openStatus: OpenStatus; notice: string; onNotice: (text: string) => void;
}) {
  const state = getDayState(events, seconds, acknowledged);
  const { featured, current, completed, alertEvents } = state;
  const isAlert = alertEvents.length > 0;
  const offline = scenario === 'offline' || calendarMode === 'connected' && calendar.source === 'cache';
  const macAvailable = calendarMode === 'demo' ? scenario !== 'mac-off' : Boolean(mac.status?.ready);
  const calendarUnavailable = calendarMode === 'loading' || calendarMode === 'disconnected';
  const isDone = events.length > 0 && state.upcoming.length === 0;
  const isFree = events.length === 0 && !calendarUnavailable;
  const remaining = featured ? Math.max(0, Math.ceil((featured.start * 60 - seconds) / 60)) : 0;
  const minutesLeft = current ? Math.ceil(current.end - seconds / 60) : 0;
  const subtitle = isFree ? 'El día es tuyo.' : isDone ? 'Todo por hoy. Bien hecho.' : current ? 'Estás donde tienes que estar.' : `Tienes ${remaining} minutos para ti.`;

  const currentDate = new Date();
  const dateLabel = calendarMode === 'demo' ? 'Lunes, 7 de septiembre' : currentDate.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
  const normalizedDate = `${dateLabel.charAt(0).toUpperCase()}${dateLabel.slice(1)}`;

  return <section className={`device ${isAlert && view === 'agenda' ? 'alert-mode' : ''} ${view === 'settings' ? 'settings-mode' : ''} ${isDone || isFree ? 'quiet-mode' : ''}`} aria-label="Pantalla del reloj de reuniones" data-testid="device">
    <header className="device-header">{view !== 'agenda' && isAlert && featured ? <button className="meeting-nudge" onClick={() => onView('agenda')}><BellSimple size={18} /><span>{featured.title}</span><strong>{remaining > 0 ? `en ${remaining} min` : 'Ahora'}</strong><ArrowRight size={17} /></button> : view !== 'pomodoro' && pomodoro.timer.status === 'complete' ? <button className="meeting-nudge timer-nudge" onClick={() => onView('pomodoro')}><CheckCircle size={18} /><span>{pomodoro.timer.mode === 'focus' ? 'Tu Pomodoro terminó. Es momento de una pausa.' : 'Descanso terminado. Vuelve a tu ritmo.'}</span><ArrowRight size={17} /></button> : <><span className="device-date"><CalendarBlank size={17} /><span>{normalizedDate}</span></span><button className={`mac-status ${!macAvailable ? 'is-offline' : ''}`} onClick={() => { onSection('mac'); onView('settings'); }}><Desktop size={17} /><span>{mac.status?.ready ? 'Atajos listo' : 'Configurar Mac'}</span><span className="status-dot" /></button></>}</header>

    {view === 'settings' ? <SettingsScreen theme={theme} mac={mac} alexa={alexa} calendar={calendar} initialScene={initialScene} section={settingsSection} onSection={onSection} /> : view === 'ambience' ? <AmbienceScreen alexa={alexa} onSettings={onAlexaSettings} /> : view === 'pomodoro' ? <PomodoroScreen onSessionStart={onSessionStart} pomodoro={pomodoro} mac={mac} onMacSettings={() => { onSection('mac'); onView('settings'); }} /> : isAlert && featured ? <main className={`alert-content ${alertEvents.length > 1 ? 'has-overlap' : ''}`} key="alert">
      <div className="alert-topline"><span className="alert-label"><BellSimple size={18} weight="fill" />{remaining > 0 ? 'TU PRÓXIMA REUNIÓN' : 'ES MOMENTO DE CONECTAR'}</span><span className="alert-clock">{formatTime(seconds)}</span></div>
      <div className="alert-body"><div className="countdown-block"><span className="countdown-prefix">{remaining > 0 ? 'Comienza en' : 'Tu reunión comienza'}</span><div className={`countdown ${remaining === 0 ? 'now' : ''}`}>{remaining > 0 ? timeUntil(featured, seconds) : 'Ahora'}</div><span className="countdown-caption">{remaining > 0 ? 'Toma aire. Ya casi es hora.' : 'Todo listo para estar presente.'}</span></div>
        <div className="alert-meeting"><span className="meeting-time">{formatTime(featured.start * 60)} <span>–</span> {formatTime(featured.end * 60)} <span className="duration">{duration(featured)}</span></span><button className="title-button" onClick={() => setSelected(featured)}><h1>{featured.title}</h1><ArrowUpRight size={22} /></button><People names={featured.people} /><span className="meeting-platform">{featured.hasMeet ? <VideoCamera size={16} /> : <MapPin size={16} />}{featured.location}</span></div>
      </div>
      {alertEvents.length > 1 && <div className="overlap-note"><Info size={16} /><span>Coinciden {alertEvents.length} reuniones.</span>{alertEvents.slice(1).map(event => <button key={event.id} onClick={() => setSelected(event)}>{event.title}<ArrowUpRight size={13} /></button>)}</div>}
      <div className="alert-actions"><MeetAction event={featured} available={macAvailable} status={openStatus} onOpen={onOpen} /><button className="secondary-button" onClick={() => onMute(featured.id)}><BellSimpleSlash size={20} />Silenciar este evento</button></div>
    </main> : <main className="day-content" key="day">
      <div className="day-main"><ClockFace seconds={seconds} subtitle={calendarUnavailable ? calendarMode === 'loading' ? 'Preparando tu agenda.' : 'Tu calendario está por conectar.' : subtitle} />
        {calendarUnavailable ? <button className="calendar-disconnected-card" onClick={onCalendarSettings}><span className="eyebrow">GOOGLE WORKSPACE</span><strong>{calendarMode === 'loading' ? 'Consultando tu calendario…' : 'Conecta tu agenda.'}</strong><span>{calendarMode === 'loading' ? 'Un momento.' : 'Autoriza el acceso desde Ajustes.'}</span><ArrowRight size={18} /></button> : featured ? <div className={`featured-meeting ${current ? 'in-progress' : ''}`}>
          <div className="featured-eyebrow"><span><span className="status-dot" />{current ? 'EN REUNIÓN' : 'A CONTINUACIÓN'}</span><span>{current ? `${minutesLeft} min restantes` : `en ${remaining} min`}</span></div>
          <button className="title-button" onClick={() => setSelected(featured)}><h1>{featured.title}</h1><ArrowUpRight size={20} /></button>
          <div className="featured-meta"><span>{formatTime(featured.start * 60)} <span>–</span> {formatTime(featured.end * 60)}</span><span className="meta-divider" /><span>{featured.hasMeet ? <VideoCamera size={15} /> : <MapPin size={15} />}{featured.hasMeet ? 'Google Meet' : 'Presencial'}</span></div>
          {current && <div className="meeting-progress" role="progressbar" aria-label="Progreso de la reunión" aria-valuenow={Math.round((seconds / 60 - current.start) / (current.end - current.start) * 100)} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${Math.min(100, (seconds / 60 - current.start) / (current.end - current.start) * 100)}%` }} /></div>}
          <MeetAction event={featured} available={macAvailable} status={openStatus} onOpen={onOpen} />
        </div> : <div className="quiet-card"><div className="quiet-symbol">{isFree ? <Leaf size={40} weight="thin" /> : <CheckCircle size={40} weight="thin" />}</div><div><span className="eyebrow">{isFree ? 'SIN PRISA' : 'TODO EN SU LUGAR'}</span><h1>{isFree ? 'Espacio para ti.' : 'Por hoy, listo.'}</h1><p>{isFree ? 'No hay reuniones en tu agenda.' : `${completed} encuentros. Ahora, una pausa.`}</p></div></div>}
      </div>
      <Agenda events={events} seconds={seconds} featured={featured} onSelect={setSelected} emptyMessage={calendarUnavailable ? <>Calendario<br />por conectar.</> : undefined} />
    </main>}

    <footer className="device-footer"><div className={`sync-status ${offline ? 'offline' : ''}`}>{offline ? <WifiSlash size={15} /> : <WifiHigh size={15} />}<span>{calendarMode === 'demo' ? offline ? 'Agenda de ejemplo · sin conexión' : 'Agenda de ejemplo' : calendarMode === 'connected' ? offline ? 'Google Calendar · agenda guardada' : 'Google Calendar' : calendarMode === 'loading' ? 'Preparando calendario' : 'Calendario por conectar'}</span></div><nav className="device-nav" aria-label="Navegación principal"><button aria-current={view === 'agenda' ? 'page' : undefined} onClick={() => onView('agenda')}><CalendarBlank size={17} />Agenda{isAlert && <i className="nav-alert-dot" />}</button><button aria-label="Pomodoro" aria-current={view === 'pomodoro' ? 'page' : undefined} onClick={() => onView('pomodoro')}><Timer size={18} />{pomodoro.timer.status === 'running' || pomodoro.timer.status === 'paused' ? formatCountdown(pomodoro.remaining) : 'Pomodoro'}{pomodoro.timer.status === 'complete' && <i className="nav-alert-dot" />}</button><button aria-current={view === 'ambience' ? 'page' : undefined} onClick={() => onView('ambience')}><Lamp size={18} />Ambiente</button><button aria-current={view === 'settings' ? 'page' : undefined} onClick={() => onView('settings')}><GearSix size={18} />Ajustes</button></nav></footer>
    {notice && <div className="device-toast" role="status"><Info size={18} /><span>{notice}</span><button aria-label="Cerrar aviso" onClick={() => onNotice('')}><X size={17} /></button></div>}
    {selected && <EventDetails event={selected} seconds={seconds} available={macAvailable} status={openStatus} muted={muted.has(selected.id)} onClose={() => setSelected(null)} onOpen={onOpen} onMute={onMute} />}
  </section>;
}

export default function App() {
  const theme = useTheme();
  const pomodoro = usePomodoro();
  const mac = useMacFocus();
  const alexa = useAlexa();
  const calendar = useGoogleCalendar();
  const [initialScene, setInitialScene] = useState<SceneId | undefined>();
  const [view, setView] = useState<AppView>('agenda');
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('presets');
  const standalone = window.location.pathname.replace(/\/$/, '') === '/app';
  const [windowSize, setWindowSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  const [scenario, setScenario] = useState<Scenario>('day');
  const [dataset, setDataset] = useState<Dataset>('standard');
  const [seconds, setSeconds] = useState(642 * 60);
  const [playing, setPlaying] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<CalendarEvent | null>(null);
  const [acknowledged, setAcknowledged] = useState<Set<string>>(new Set());
  const [muted, setMuted] = useState<Set<string>>(new Set());
  const [openStatus, setOpenStatus] = useState<OpenStatus>(null);
  const [notice, setNotice] = useState('');
  const [stageWidth, setStageWidth] = useState(860);
  const [showInfo, setShowInfo] = useState(false);
  const [liveSeconds, setLiveSeconds] = useState(() => { const now = new Date(); return now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds(); });
  const stageRef = useRef<HTMLDivElement>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const demoEvents = useMemo(() => getEvents(dataset, scenario), [dataset, scenario]);
  const calendarMode: CalendarMode = standalone ? calendar.loading ? 'loading' : calendar.config.connected ? 'connected' : 'disconnected' : 'demo';
  const events = calendarMode === 'demo' ? demoEvents : calendarMode === 'connected' ? calendar.events : [];
  const visibleSeconds = calendarMode === 'demo' ? seconds : liveSeconds;
  const scenarioInfo = scenarios.find(item => item.id === scenario)!;
  const scale = Math.min(expanded ? 1.4 : 1, Math.max(0.25, (stageWidth - 24) / 824));

  useEffect(() => {
    function resize() { setWindowSize({ width: window.innerWidth, height: window.innerHeight }); }
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  useEffect(() => {
    if (!standalone) return;
    function updateClock() { const now = new Date(); setLiveSeconds(now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()); }
    updateClock();
    const timer = window.setInterval(updateClock, 1000);
    return () => window.clearInterval(timer);
  }, [standalone]);
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') {
      function measure() { if (stageRef.current) setStageWidth(stageRef.current.getBoundingClientRect().width); }
      measure();
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const observer = new ResizeObserver(entries => setStageWidth(entries[0].contentRect.width));
    if (stageRef.current) observer.observe(stageRef.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!playing) return;
    const start = performance.now();
    const original = seconds;
    const timer = setInterval(() => setSeconds(Math.min(86399, original + Math.floor((performance.now() - start) / 1000))), 250);
    return () => clearInterval(timer);
    // Restart the baseline only when playback is toggled. Manual changes pause it first.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 5000);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => () => { if (openTimer.current) clearTimeout(openTimer.current); }, []);

  function resetInteraction() {
    if (openTimer.current) clearTimeout(openTimer.current);
    setSelected(null); setAcknowledged(new Set()); setMuted(new Set()); setOpenStatus(null); setNotice(''); setPlaying(false);
  }
  function changeScenario(next: Scenario) {
    resetInteraction(); setScenario(next); setSeconds(scenarios.find(item => item.id === next)!.time * 60);
  }
  function changeDataset(next: Dataset) { resetInteraction(); setDataset(next); }
  function openMeeting(event: CalendarEvent) {
    if (scenario === 'mac-off' || !event.hasMeet || openStatus?.state === 'opening') return;
    setOpenStatus({ id: event.id, state: 'opening' });
    openTimer.current = setTimeout(() => {
      setOpenStatus({ id: event.id, state: 'opened' });
      setAcknowledged(previous => new Set(previous).add(event.id));
      setNotice('Simulación completada. El enlace se abrirá en tu Mac cuando lo conectemos.');
    }, 650);
  }
  function muteEvent(id: string) {
    setMuted(previous => new Set(previous).add(id));
    setAcknowledged(previous => new Set(previous).add(id));
    setNotice('Avisos silenciados para esta reunión. Sigue disponible en tu agenda.');
  }

  function onAlexaSettings(scene?: SceneId) { setInitialScene(scene); setSettingsSection('alexa'); setView('settings'); }
  function onSessionStart(mode: 'focus' | 'break') {
    if (!alexa.config.automatic[mode]) return;
    if (alexa.busy) { setNotice('La sesión comenzó. Alexa está ocupada; puedes activar la escena desde Ambiente.'); return; }
    void alexa.run(mode, 'automatic').then(message => { if (message) setNotice(message); });
  }
  const device = <Device alexa={alexa} calendar={calendar} calendarMode={calendarMode} initialScene={initialScene} onAlexaSettings={onAlexaSettings} onCalendarSettings={() => { setSettingsSection('calendar'); setView('settings'); }} onSessionStart={onSessionStart} view={view} onView={next => { setView(next); setSelected(null); }} theme={theme} pomodoro={pomodoro} mac={mac} settingsSection={settingsSection} onSection={setSettingsSection} events={events} seconds={visibleSeconds} scenario={scenario} selected={selected} setSelected={setSelected} acknowledged={acknowledged} muted={muted} onMute={muteEvent} onOpen={openMeeting} openStatus={openStatus} notice={notice} onNotice={setNotice} />;
  if (standalone) {
    const appScale = Math.min(windowSize.width / 800, windowSize.height / 480);
    return <div className="standalone-app"><div style={{ width: 800 * appScale, height: 480 * appScale }}><div className="standalone-screen" style={{ transform: `scale(${appScale})` }}>{device}</div></div></div>;
  }
  return <div className="studio">
    <header className="studio-header"><a href="#" className="wordmark" aria-label="Rasp, inicio" onClick={event => { event.preventDefault(); changeScenario('day'); }}><span className="wordmark-symbol"><span /><span /><span /></span>rasp<span className="wordmark-period">.</span></a><div className="studio-header-right"><span className="prototype-tag">PROTOTIPO INTERACTIVO</span><button className="studio-icon" aria-label="Acerca del prototipo" aria-expanded={showInfo} onClick={() => setShowInfo(value => !value)}><Info size={19} /></button></div></header>
    {showInfo && <div className="prototype-info" role="status"><strong>Una primera mirada a tu reloj de reuniones.</strong><p>La agenda y las aperturas de reuniones son simuladas. Los ajustes y el temporizador son funcionales; No molestar requiere configurar Atajos en el Mac. La pantalla interior representa la Raspberry de 7″; los controles de abajo pertenecen únicamente a esta demostración.</p><button onClick={() => setShowInfo(false)}>Entendido <Check size={15} /></button></div>}
    <main className="studio-main">
      <div className="intro"><div className="intro-text"><span className="intro-eyebrow">MENOS DISTRACCIONES. MÁS PRESENCIA.</span><h1>Tu día, en calma<span>.</span></h1><p>Un lugar para tu agenda. Un toque para estar ahí.</p></div><div className="preview-options"><span className="screen-spec">7″ <span>·</span> 800 × 480</span><div className="size-switch" aria-label="Tamaño de previsualización"><button className={!expanded ? 'selected' : ''} aria-pressed={!expanded} onClick={() => setExpanded(false)}>1:1</button><button className={expanded ? 'selected' : ''} aria-pressed={expanded} onClick={() => setExpanded(true)}><CornersOut size={15} />Ampliar</button></div></div></div>
      <div className="app-preview-toolbar"><span>Tu agenda, tu enfoque y tu ambiente.</span><a href="/app" target="_blank" rel="noreferrer">Abrir solo la aplicación <ArrowUpRight size={15} /></a></div>
      <div className="device-stage" ref={stageRef}>
        <div className="device-wrap" style={{ width: 824 * scale, height: 504 * scale } as CSSProperties}>
          <div className="device-bezel" style={{ transform: `scale(${scale})` }}>
            {device}
          </div>
        </div>
      </div>
      <div className="under-device"><span className="demo-label"><span />VISTA PREVIA · DATOS DE EJEMPLO</span><p key={scenario}>{scenarioInfo.caption}</p></div>
      <section className="demo-controls" aria-label="Controles de demostración">
        <div className="controls-heading"><div><SlidersHorizontal size={17} /><h2>Explora tu pantalla</h2></div><button className="reset-button" onClick={() => { setDataset('standard'); changeScenario('day'); }}><ArrowCounterClockwise size={15} />Reiniciar</button></div>
        <div className="scenario-tabs" aria-label="Escenarios">{scenarios.map(item => <button key={item.id} aria-pressed={scenario === item.id} onClick={() => changeScenario(item.id)} className={scenario === item.id ? 'active' : ''}>{item.id === 'day' ? <CalendarBlank size={16} /> : item.id === 'reminder' ? <BellSimple size={16} /> : item.id === 'starting' ? <VideoCamera size={16} /> : item.id === 'ongoing' ? <Clock size={16} /> : item.id === 'free' ? <Leaf size={16} /> : item.id === 'done' ? <CheckCircle size={16} /> : item.id === 'offline' ? <WifiSlash size={16} /> : <Desktop size={16} />}{item.label}</button>)}</div>
        <div className="controls-bottom"><div className="clock-controls"><span className="control-label">RELOJ DE DEMO</span><div className="time-controls"><button className="transport-button" aria-label={playing ? 'Pausar reloj' : 'Iniciar reloj'} title={playing ? 'Pausar reloj' : 'Iniciar reloj'} onClick={() => setPlaying(value => !value)}>{playing ? <Pause size={16} weight="fill" /> : <Play size={16} weight="fill" />}</button><span className="demo-time">{formatTime(seconds)}</span><button className="transport-button" aria-label="Retroceder 5 minutos" onClick={() => { setPlaying(false); setSeconds(value => Math.max(0, value - 300)); }}><ArrowLeft size={15} /></button><button className="advance-button" onClick={() => { setPlaying(false); setSeconds(value => Math.min(86399, value + 300)); }}><Plus size={13} />5 min<ArrowRight size={14} /></button></div></div><div className="dataset-control"><label className="control-label" htmlFor="dataset">AGENDA DE EJEMPLO</label><select id="dataset" value={dataset} onChange={event => changeDataset(event.target.value as Dataset)}><option value="standard">Un día habitual</option><option value="long">Títulos largos</option><option value="busy">Agenda extensa</option><option value="overlap">Reuniones simultáneas</option><option value="no-meet">Reunión presencial</option></select></div></div>
      </section>
      <footer className="studio-footer"><span>Diseñado para estar presente.</span><span>Raspberry Pi 3 <span className="footer-separator">/</span> Pantalla táctil de 7″</span></footer>
    </main>

  </div>;
}
