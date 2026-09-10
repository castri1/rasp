import { ArrowsClockwise, HouseLine, Lightbulb, Power, WarningCircle } from '@phosphor-icons/react';
import type { HomeController } from './useHome';
import './home.css';

export default function HomeScreen({ controller }: { controller: HomeController }) {
  const { home, busyRoom, error } = controller;
  const devices = home.rooms.reduce((sum, room) => sum + room.devices.length, 0);
  const on = home.rooms.reduce((sum, room) => sum + room.on, 0);
  const ready = home.state === 'ready';
  return <main className="home-screen app-content" aria-label="Plano y control de la casa">
    <header className="home-heading">
      <div><span className="eyebrow">TU CASA, DE UN VISTAZO</span><h1><HouseLine size={21} />Casa <i>·</i> <strong>{ready ? on ? `${on} encendido${on === 1 ? '' : 's'}` : 'Todo en calma' : 'Por conectar'}</strong></h1></div>
      <div className="home-heading-actions"><span className={`home-live ${ready ? 'is-live' : ''}`}><i />{ready ? `${devices} dispositivos` : 'Sin bombillos'}</span><button aria-label="Actualizar estados" disabled={busyRoom !== null} onClick={() => void controller.refresh()}><ArrowsClockwise size={17} className={home.state === 'loading' ? 'spinning' : ''} /></button><button className="all-off" disabled={!on || busyRoom !== null} onClick={() => void controller.toggle('all', false)}><Power size={15} />Apagar todo</button></div>
    </header>
    <section className="house-plan" aria-label="Ambientes de la casa">
      {home.rooms.map(room => {
        const available = room.devices.length - room.unavailable;
        const active = room.on > 0;
        const busy = busyRoom === room.id || busyRoom === 'all';
        const label = !room.devices.length ? 'Sin dispositivos' : !available ? 'No disponible' : active ? `${room.on} de ${available} encendido${room.on === 1 ? '' : 's'}` : 'Todo apagado';
        return <button key={room.id} className={`house-room room-${room.id} ${active ? 'is-on' : ''}`} disabled={!available || busyRoom !== null} onClick={() => void controller.toggle(room.id, !active)} aria-label={`${room.name}. ${label}`}>
          <span className="room-top"><Lightbulb size={16} weight={active ? 'fill' : 'regular'} /><i>{active ? 'ON' : room.devices.length ? 'OFF' : '—'}</i></span>
          <span className="room-furniture" aria-hidden="true"><i /><i /></span>
          <strong>{room.name}</strong><small>{busy ? 'Cambiando…' : label}</small>
          {active && <span className="room-glow" aria-hidden="true" />}
        </button>;
      })}
    </section>
    <footer className={`home-status ${error ? 'has-error' : ''}`}>{error ? <WarningCircle size={14} /> : <span className={`home-status-dot ${ready ? 'is-live' : ''}`} />}<span>{error || home.message}</span></footer>
  </main>;
}
