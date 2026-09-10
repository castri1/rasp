import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowsClockwise, Check, HouseLine, Lightbulb, LinkSimple, PencilSimple, Plus, Power, SlidersHorizontal, SpeakerHigh, Trash, WarningCircle } from '@phosphor-icons/react';
import type { HomeDevice, HomeDeviceDraft, HomeRoomDraft } from './home';
import type { HomeController } from './useHome';
import './home.css';

const PLAN_SHAPES: Record<string, { d: string; x: number; y: number }> = {
  'juan-rafael': { d: 'M22 12H178V94H22Z', x: 100, y: 48 },
  oficina: { d: 'M178 12H316V108H178Z', x: 247, y: 50 },
  amalia: { d: 'M22 94H178V175H22Z', x: 100, y: 132 },
  principal: { d: 'M88 175H262V326H88Z', x: 175, y: 250 },
  comedor: { d: 'M316 12H500V150H385V108H316Z', x: 406, y: 66 },
  cocina: { d: 'M500 12H611V165H532V145H500Z', x: 555, y: 70 },
  lavanderia: { d: 'M611 12H706V77H632V96H611Z', x: 660, y: 45 },
  servicio: { d: 'M611 77H706V151H611Z', x: 660, y: 116 },
  sala: { d: 'M262 150H611V300H262Z', x: 442, y: 228 },
  balcon: { d: 'M330 300H611V328H330Z', x: 470, y: 316 },
};

function splitLabel(value: string) {
  const clean = value.replace(' · ', ' ');
  if (clean.length <= 15) return [clean];
  const words = clean.split(' ');
  const midpoint = clean.length / 2;
  let length = 0;
  let index = 1;
  for (; index < words.length; index++) { length += words[index - 1].length + 1; if (length >= midpoint) break; }
  return [words.slice(0, index).join(' '), words.slice(index).join(' ')].filter(Boolean).map(line => line.length > 18 ? `${line.slice(0, 17)}…` : line);
}

function spokenRoomName(value: string) {
  return value.split(' · ')[0].trim().toLocaleLowerCase('es');
}

function roomStatus(room: { devices: HomeDevice[]; on: number; unavailable: number; onCommand: string; offCommand: string; assumedOn: boolean; changedAt: string }) {
  if (room.onCommand && room.offCommand) return room.changedAt ? `Última orden: ${room.assumedOn ? 'encender' : 'apagar'}` : 'Listo por Alexa';
  const available = room.devices.length - room.unavailable;
  if (!room.devices.length) return 'Sin dispositivos';
  if (!available) return 'No disponible';
  return room.on ? `${room.on} encendido${room.on === 1 ? '' : 's'}` : 'Todo apagado';
}

export default function HomeScreen({ controller }: { controller: HomeController }) {
  const { home, busyRoom, error } = controller;
  const [selectedRoomId, setSelectedRoomId] = useState('sala');
  const [editing, setEditing] = useState(false);
  const [draftRooms, setDraftRooms] = useState<HomeRoomDraft[]>([]);
  const [draftDevices, setDraftDevices] = useState<HomeDeviceDraft[]>([]);
  const allDevices = useMemo(() => [...home.rooms.flatMap(room => room.devices), ...home.unassignedDevices], [home.rooms, home.unassignedDevices]);
  const devices = allDevices.length;
  const commandRooms = home.rooms.filter(room => room.onCommand && room.offCommand);
  const directOn = [...home.rooms.filter(room => !room.onCommand || !room.offCommand).flatMap(room => room.devices), ...home.unassignedDevices].filter(device => device.state === 'on').length;
  const commandOn = commandRooms.filter(room => room.assumedOn).length;
  const on = directOn + commandOn;
  const connected = ['ready', 'empty'].includes(home.state);
  const houseSummary = home.state === 'ready' ? on ? `${on} activo${on === 1 ? '' : 's'}` : 'Todo en calma' : home.state === 'empty' ? 'Sin dispositivos' : home.state === 'loading' ? 'Actualizando' : 'Por conectar';
  const selectedRoom = home.rooms.find(room => room.id === selectedRoomId) || home.rooms[0];
  const invalidDraft = draftRooms.some(room => !room.name.trim() || Boolean(room.onCommand.trim()) !== Boolean(room.offCommand.trim())) || draftDevices.some(device => !device.name.trim());

  useEffect(() => {
    if (!editing && !home.rooms.some(room => room.id === selectedRoomId) && home.rooms[0]) setSelectedRoomId(home.rooms[0].id);
  }, [editing, home.rooms, selectedRoomId]);

  function openEditor() {
    setDraftRooms(home.rooms.map(room => ({ id: room.id, name: room.name, slot: room.slot, onCommand: room.onCommand, offCommand: room.offCommand })));
    setDraftDevices(allDevices.map(device => ({ entityId: device.entityId, name: device.name, roomId: device.roomId })));
    setEditing(true);
  }

  function addRoom() {
    const id = `custom-${Date.now().toString(36)}`;
    setDraftRooms(previous => [...previous, { id, name: 'Nuevo ambiente', slot: 'other', onCommand: '', offCommand: '' }]);
    setSelectedRoomId(id);
  }

  function removeRoom(id: string) {
    setDraftRooms(previous => previous.filter(room => room.id !== id));
    setDraftDevices(previous => previous.map(device => device.roomId === id ? { ...device, roomId: '' } : device));
    setSelectedRoomId(draftRooms[0]?.id || 'sala');
  }

  async function save() {
    if (invalidDraft) return;
    if (await controller.saveConfiguration(draftRooms, draftDevices)) setEditing(false);
  }

  if (editing) {
    const selectedDraft = draftRooms.find(room => room.id === selectedRoomId) || draftRooms[0];
    return <main className="home-editor app-content" aria-label="Organizar ambientes y dispositivos">
      <header className="home-editor-heading">
        <button onClick={() => setEditing(false)}><ArrowLeft size={17} />Casa</button>
        <div><span className="eyebrow">CONFIGURA TU PLANO</span><h1>Organiza tu casa.</h1></div>
        <button className="home-save" disabled={controller.saving || invalidDraft} onClick={() => void save()}>{controller.saving ? <ArrowsClockwise className="spinning" size={17} /> : <Check size={17} />}Guardar</button>
      </header>
      <div className="home-editor-layout">
        <aside className="home-room-editor-list" aria-label="Ambientes">
          {draftRooms.map(room => <button key={room.id} aria-current={selectedDraft?.id === room.id ? 'true' : undefined} onClick={() => setSelectedRoomId(room.id)}><span className="room-editor-dot" />{room.name}</button>)}
          <button className="add-room" disabled={draftRooms.length >= 16} onClick={addRoom}><Plus size={15} />Añadir ambiente</button>
        </aside>
        <section className="home-editor-detail">
          {selectedDraft && <div className="room-name-editor"><label><span>NOMBRE DEL AMBIENTE</span><input value={selectedDraft.name} maxLength={40} onChange={event => setDraftRooms(previous => previous.map(room => room.id === selectedDraft.id ? { ...room, name: event.target.value } : room))} /></label>{selectedDraft.slot === 'other' && <button aria-label="Eliminar ambiente" onClick={() => removeRoom(selectedDraft.id)}><Trash size={17} /></button>}</div>}
          {selectedDraft && <div className="room-command-editor"><div className="room-command-heading"><span>CONTROL POR COMANDOS DE ALEXA</span><small>Guarda el último estado enviado</small></div><div><label><span>ENCENDER</span><input value={selectedDraft.onCommand} maxLength={180} placeholder={`prende ${spokenRoomName(selectedDraft.name)}`} onChange={event => setDraftRooms(previous => previous.map(room => room.id === selectedDraft.id ? { ...room, onCommand: event.target.value } : room))} /></label><label><span>APAGAR</span><input value={selectedDraft.offCommand} maxLength={180} placeholder={`apaga ${spokenRoomName(selectedDraft.name)}`} onChange={event => setDraftRooms(previous => previous.map(room => room.id === selectedDraft.id ? { ...room, offCommand: event.target.value } : room))} /></label></div></div>}
          <div className="device-editor-heading"><div><span>DISPOSITIVOS DE HOME ASSISTANT</span><strong>{draftDevices.length ? 'Asocia y nombra cada elemento.' : 'Todavía no hay dispositivos.'}</strong></div><LinkSimple size={18} /></div>
          <div className="device-editor-list">
            {draftDevices.map(device => <div className="device-editor-row" key={device.entityId}>
              <Lightbulb size={17} />
              <input aria-label={`Nombre de ${device.name}`} value={device.name} maxLength={100} onChange={event => setDraftDevices(previous => previous.map(item => item.entityId === device.entityId ? { ...item, name: event.target.value } : item))} />
              <select aria-label={`Ambiente de ${device.name}`} value={device.roomId} onChange={event => setDraftDevices(previous => previous.map(item => item.entityId === device.entityId ? { ...item, roomId: event.target.value } : item))}><option value="">Sin ambiente</option>{draftRooms.map(room => <option key={room.id} value={room.id}>{room.name}</option>)}</select>
            </div>)}
            {!draftDevices.length && <div className="device-editor-empty"><SlidersHorizontal size={25} /><span>Cuando conectes bombillos o interruptores, aparecerán aquí para asociarlos.</span></div>}
          </div>
        </section>
      </div>
      {error && <footer className="home-editor-error"><WarningCircle size={14} />{error}</footer>}
    </main>;
  }

  return <main className="home-screen app-content" aria-label="Plano y control de la casa">
    <header className="home-heading">
      <div><span className="eyebrow">TU CASA, DE UN VISTAZO</span><h1><HouseLine size={21} />Casa <i>·</i> <strong>{houseSummary}</strong></h1></div>
      <div className="home-heading-actions"><span className={`home-live ${connected ? 'is-live' : ''}`}><i />{devices ? `${devices} dispositivos` : commandRooms.length ? `${commandRooms.length} por Alexa` : connected ? 'Home Assistant' : 'Sin conexión'}</span><button aria-label="Actualizar estados" disabled={busyRoom !== null} onClick={() => void controller.refresh()}><ArrowsClockwise size={17} className={home.state === 'loading' ? 'spinning' : ''} /></button><button onClick={openEditor}><PencilSimple size={15} />Editar</button><button className="all-off" disabled={!on || busyRoom !== null} onClick={() => void controller.toggle('all', false)}><Power size={15} />Apagar</button></div>
    </header>
    <div className="home-layout">
      <section className="real-house-plan" aria-label="Plano de la casa">
        <svg viewBox="0 0 728 340" role="group" aria-label="Plano táctil basado en la distribución de la casa">
          <path className="plan-outline" d="M18 8H710V154H616V332H326V330H84V178H18Z" />
          <g className="plan-services" aria-hidden="true"><path d="M178 108H262V175H178Z" /><path d="M262 108H385V150H350V175H262Z" /><path d="M611 151H706V181H611Z" /></g>
          {home.rooms.filter(room => PLAN_SHAPES[room.id]).map(room => {
            const shape = PLAN_SHAPES[room.id];
            const lines = splitLabel(room.name);
            const commandConfigured = Boolean(room.onCommand && room.offCommand);
            const active = commandConfigured ? room.assumedOn : room.on > 0;
            const selected = room.id === selectedRoom?.id;
            const toggleRoom = () => { setSelectedRoomId(room.id); if (commandConfigured || room.devices.length) void controller.toggle(room.id, !active); };
            return <g key={room.id} className={`plan-room ${active ? 'is-on' : ''} ${selected ? 'is-selected' : ''}`} role="button" tabIndex={0} aria-label={`${room.name}. ${roomStatus(room)}${commandConfigured || room.devices.length ? `. Tocar para ${active ? 'apagar' : 'encender'}` : ''}`} onClick={toggleRoom} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') toggleRoom(); }}>
              <path d={shape.d} />
              <circle cx={shape.x - 2} cy={shape.y - 18} r="3.5" />
              <text x={shape.x} y={shape.y} textAnchor="middle">{lines.map((line, index) => <tspan key={line} x={shape.x} dy={index ? 14 : 0}>{line}</tspan>)}</text>
              <text className="plan-device-count" x={shape.x} y={shape.y + (lines.length > 1 ? 32 : 19)} textAnchor="middle">{commandConfigured ? active ? 'orden: encendido' : room.changedAt ? 'orden: apagado' : 'Alexa lista' : room.devices.length ? `${room.on}/${room.devices.length} activos` : 'toca para configurar'}</text>
            </g>;
          })}
          <text className="service-label" x="220" y="146" textAnchor="middle">BAÑOS</text>
          <text className="service-label" x="660" y="171" textAnchor="middle">BAÑO</text>
        </svg>
      </section>
      {selectedRoom && <aside className="home-room-panel" aria-label={`Dispositivos de ${selectedRoom.name}`}>
        <div className="home-room-panel-heading"><select aria-label="Ambiente seleccionado" value={selectedRoom.id} onChange={event => setSelectedRoomId(event.target.value)}>{home.rooms.map(room => <option key={room.id} value={room.id}>{room.name}</option>)}</select><button aria-label={`${selectedRoom.onCommand ? selectedRoom.assumedOn ? 'Apagar' : 'Encender' : selectedRoom.on ? 'Apagar' : 'Encender'} ${selectedRoom.name}`} disabled={!selectedRoom.onCommand && !selectedRoom.devices.length || busyRoom !== null} onClick={() => void controller.toggle(selectedRoom.id, selectedRoom.onCommand ? !selectedRoom.assumedOn : !selectedRoom.on)}><Power size={16} /></button></div>
        <span className="room-panel-status">{roomStatus(selectedRoom)}</span>
        <div className="home-device-list">
          {selectedRoom.devices.map(device => { const active = device.state === 'on'; const unavailable = ['unknown', 'unavailable'].includes(device.state); return <button key={device.entityId} disabled={unavailable || busyRoom !== null} onClick={() => void controller.toggleDevice(device.entityId, !active)}><Lightbulb size={16} weight={active ? 'fill' : 'regular'} /><span><strong>{device.name}</strong><small>{unavailable ? 'No disponible' : active ? 'Encendido' : 'Apagado'}</small></span><i className={active ? 'is-on' : ''} /></button>; })}
          {!selectedRoom.devices.length && selectedRoom.onCommand && <div className="home-command-summary"><SpeakerHigh size={23} weight="thin" /><strong>Control por Alexa</strong><span>{selectedRoom.assumedOn ? 'Encendido' : 'Apagado'} según la última orden.</span><small>Toca el ambiente o el botón superior para cambiarlo.</small></div>}
          {!selectedRoom.devices.length && !selectedRoom.onCommand && <div className="home-room-empty"><Lightbulb size={22} weight="thin" /><span>Configura dos comandos desde <b>Editar</b>.</span></div>}
        </div>
      </aside>}
    </div>
    <footer className={`home-status ${error ? 'has-error' : ''}`}>{error ? <WarningCircle size={14} /> : <span className={`home-status-dot ${connected ? 'is-live' : ''}`} />}<span>{error || home.message}</span></footer>
  </main>;
}
