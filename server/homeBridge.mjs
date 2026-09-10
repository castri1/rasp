import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { allowedRequest } from './macBridge.mjs';
import { createConfigStore } from './alexaBridge.mjs';

export const HOUSE_ROOMS = [
  { id: 'juan-rafael', name: 'Habitación auxiliar', slot: 'auxiliar', aliases: ['cuarto juan rafael', 'habitacion juan rafael', 'juan rafael'] },
  { id: 'oficina', name: 'Oficina Daniel', slot: 'oficina-daniel', aliases: ['oficina', 'estudio', 'estudio daniel'] },
  { id: 'amalia', name: 'Oficina Amalia', slot: 'oficina-amalia', aliases: ['estudio amalia'] },
  { id: 'principal', name: 'Habitación principal', slot: 'principal', aliases: ['cuarto principal'] },
  { id: 'comedor', name: 'Comedor', slot: 'comedor', aliases: [] },
  { id: 'cocina', name: 'Cocina', slot: 'cocina', aliases: [] },
  { id: 'sala', name: 'Sala · Estar TV', slot: 'sala', aliases: ['sala', 'sala de estar', 'estar tv'] },
  { id: 'balcon', name: 'Balcón', slot: 'balcon', aliases: ['balcon', 'terraza'] },
  { id: 'lavanderia', name: 'Lavandería', slot: 'lavanderia', aliases: ['zona de ropas'] },
  { id: 'servicio', name: 'Habitación servicio', slot: 'servicio', aliases: ['cuarto de servicio'] },
];

export const EMPTY_HOME_CONFIG = {
  version: 2,
  rooms: HOUSE_ROOMS.map(room => ({ id: room.id, name: room.name, slot: room.slot, onCommand: '', offCommand: '', assumedOn: false, changedAt: '' })),
  assignments: {},
  deviceNames: {},
};

// Area names come from Home Assistant. Devices without an area remain available for manual assignment in Rasp.
export const HOME_ENTITIES_TEMPLATE = `{% set ns = namespace(items=[]) %}{% for item in states.light %}{% set area = area_name(item.entity_id) or '' %}{% set ns.items = ns.items + [{'entityId': item.entity_id, 'name': item.name, 'area': area, 'domain': 'light', 'state': item.state, 'brightness': item.attributes.brightness | default(0, true)}] %}{% endfor %}{% for item in states.switch %}{% set area = area_name(item.entity_id) or '' %}{% set ns.items = ns.items + [{'entityId': item.entity_id, 'name': item.name, 'area': area, 'domain': 'switch', 'state': item.state, 'brightness': 0}] %}{% endfor %}{{ ns.items | to_json }}`;

class HomeError extends Error {
  constructor(message, status = 400, code = 'invalid') { super(message); this.status = status; this.code = code; }
}

function normalized(value) {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('es');
}

function validSingleLine(value, limit, optional = false) {
  if (typeof value !== 'string') return false;
  if (optional && !value.trim()) return true;
  return value.trim().length > 0 && value.trim().length <= limit && !/[\x00-\x1f\x7f]/.test(value);
}

function validEntityId(value) {
  return typeof value === 'string' && /^(light|switch)\.[a-z0-9_]+$/.test(value);
}

function isHouseControl(item) {
  if (!validEntityId(item?.entityId) || !['light', 'switch'].includes(item.domain)) return false;
  return item.domain !== 'switch' || !/_(do_not_disturb|announcements|communications)$/.test(item.entityId);
}

function savedState(previous, id, onCommand, offCommand) {
  const prior = previous?.rooms?.find(room => room.id === id);
  const sameCommands = prior?.onCommand === onCommand && prior?.offCommand === offCommand;
  const changedAt = sameCommands && typeof prior?.changedAt === 'string' && Number.isFinite(Date.parse(prior.changedAt)) ? prior.changedAt : '';
  return { assumedOn: Boolean(sameCommands && prior?.assumedOn), changedAt };
}

export function validateHomeConfig(input, previous = EMPTY_HOME_CONFIG) {
  if (!input || typeof input !== 'object' || !Array.isArray(input.rooms) || input.rooms.length < HOUSE_ROOMS.length || input.rooms.length > 16) throw new HomeError('Configura entre 10 y 16 ambientes.');
  const ids = new Set();
  const slots = new Set(HOUSE_ROOMS.map(room => room.slot));
  const rooms = input.rooms.map((room, index) => {
    if (!room || typeof room.id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(room.id) || ids.has(room.id) || !validSingleLine(room.name, 40)) throw new HomeError('Revisa los nombres de los ambientes.');
    ids.add(room.id);
    const expected = HOUSE_ROOMS[index];
    if (index < HOUSE_ROOMS.length && (room.id !== expected.id || room.slot !== expected.slot)) throw new HomeError('La posición del plano no es válida.');
    if (index >= HOUSE_ROOMS.length && room.slot !== 'other') throw new HomeError('Los ambientes adicionales deben quedar en Otros.');
    if (room.slot !== 'other' && !slots.has(room.slot)) throw new HomeError('La posición del ambiente no existe.');
    const onCommand = typeof room.onCommand === 'string' ? room.onCommand.trim() : '';
    const offCommand = typeof room.offCommand === 'string' ? room.offCommand.trim() : '';
    if (!validSingleLine(onCommand, 180, true) || !validSingleLine(offCommand, 180, true)) throw new HomeError('Los comandos de Alexa deben estar en una sola línea.');
    if (Boolean(onCommand) !== Boolean(offCommand)) throw new HomeError('Configura tanto el comando de encendido como el de apagado.');
    return { id: room.id, name: room.name.trim(), slot: room.slot, onCommand, offCommand, ...savedState(previous, room.id, onCommand, offCommand) };
  });
  const assignments = {};
  const deviceNames = {};
  const devices = Array.isArray(input.devices) ? input.devices : [];
  if (devices.length > 300) throw new HomeError('Hay demasiados dispositivos para guardar.');
  for (const device of devices) {
    if (!device || !validEntityId(device.entityId) || typeof device.roomId !== 'string' || device.roomId && !ids.has(device.roomId)) throw new HomeError('La asociación de un dispositivo no es válida.');
    if (device.name !== '' && !validSingleLine(device.name, 100)) throw new HomeError('Revisa los nombres de los dispositivos.');
    assignments[device.entityId] = device.roomId;
    if (device.name.trim()) deviceNames[device.entityId] = device.name.trim();
  }
  return { version: 2, rooms, assignments, deviceNames };
}

function normalizeStoredConfig(input) {
  if (![1, 2].includes(input?.version) || !Array.isArray(input.rooms)) return structuredClone(EMPTY_HOME_CONFIG);
  try {
    const rooms = input.rooms.map(room => ({ ...room, onCommand: room.onCommand || '', offCommand: room.offCommand || '', assumedOn: Boolean(room.assumedOn), changedAt: room.changedAt || '' }));
    const previous = { ...input, version: 2, rooms };
    return validateHomeConfig({ rooms, devices: Object.keys(input.assignments || {}).map(entityId => ({ entityId, roomId: input.assignments[entityId], name: input.deviceNames?.[entityId] || '' })) }, previous);
  } catch { return structuredClone(EMPTY_HOME_CONFIG); }
}

export function createHomeConfigStore(file = resolve('.rasp/home.json')) {
  return {
    async load() {
      try { return normalizeStoredConfig(JSON.parse(await readFile(file, 'utf8'))); }
      catch (error) { if (error.code === 'ENOENT') return structuredClone(EMPTY_HOME_CONFIG); throw new HomeError('No se pudo leer la organización de la casa.', 500, 'storage'); }
    },
    async save(config) {
      await mkdir(dirname(file), { recursive: true, mode: 0o700 });
      const temporary = `${file}.${randomUUID()}.tmp`;
      await writeFile(temporary, JSON.stringify(config), { mode: 0o600 });
      await rename(temporary, file);
    },
  };
}

function reply(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(data));
}

async function readBody(req) {
  let value = '';
  for await (const part of req) { value += part; if (value.length > 64000) throw new HomeError('Solicitud demasiado grande.'); }
  try { return JSON.parse(value); } catch { throw new HomeError('Solicitud no válida.'); }
}

function roomForArea(area, rooms) {
  const value = normalized(area);
  if (!value) return undefined;
  return rooms.find(room => {
    const fixed = HOUSE_ROOMS.find(item => item.id === room.id);
    return [room.name, ...(fixed?.aliases || [])].some(alias => normalized(alias) === value);
  });
}

function organizeDevices(devices, homeConfig) {
  const roomMap = new Map(homeConfig.rooms.map(room => [room.id, { ...room, builtIn: room.slot !== 'other', devices: [], on: 0, unavailable: 0 }]));
  const unassignedDevices = [];
  for (const source of devices) {
    const hasSavedAssignment = Object.hasOwn(homeConfig.assignments, source.entityId);
    const roomId = hasSavedAssignment ? homeConfig.assignments[source.entityId] : roomForArea(source.area, homeConfig.rooms)?.id || '';
    const device = { ...source, originalName: source.name, name: homeConfig.deviceNames[source.entityId] || source.name, roomId };
    const room = roomMap.get(roomId);
    if (!room) { unassignedDevices.push(device); continue; }
    room.devices.push(device);
    if (device.state === 'on') room.on++;
    if (['unavailable', 'unknown'].includes(device.state)) room.unavailable++;
  }
  return { rooms: [...roomMap.values()], unassignedDevices };
}

function textForAlexa(value) {
  return value.trim().replace(/^alexa\s*[,;:]?\s*/i, '');
}

export function createHomeMiddleware({ store = createConfigStore(), configStore = createHomeConfigStore(), request = fetch } = {}) {
  const executions = new Map();
  async function call(config, path, data) {
    let response;
    try {
      response = await request(`${config.url}/api/${path}`, {
        method: data ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(10000),
        headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' }, body: data ? JSON.stringify(data) : undefined,
      });
    } catch { throw new HomeError('Home Assistant no respondió.', 502, 'offline'); }
    if ([401, 403].includes(response.status)) throw new HomeError('Home Assistant rechazó la credencial.', 401, 'auth');
    if (!response.ok) throw new HomeError('Home Assistant no pudo completar la orden.', 502, 'upstream');
    try { return await response.json(); } catch { throw new HomeError('Home Assistant devolvió una respuesta no válida.', 502, 'invalid_response'); }
  }

  async function discoveredDevices(config) {
    const result = await call(config, 'template', { template: HOME_ENTITIES_TEMPLATE });
    if (!Array.isArray(result)) throw new HomeError('No se pudo leer el estado de los ambientes.', 502);
    return result.filter(item => isHouseControl(item) && typeof item.name === 'string' && typeof item.area === 'string' && ['on', 'off', 'unavailable', 'unknown'].includes(item.state)).map(item => ({
      entityId: item.entityId, name: item.name.slice(0, 100), area: item.area.slice(0, 100), domain: item.domain, state: item.state,
      brightness: Number.isFinite(Number(item.brightness)) ? Math.max(0, Math.min(255, Number(item.brightness))) : 0,
    }));
  }

  async function load(credentials, suppliedHomeConfig) {
    const homeConfig = suppliedHomeConfig || await configStore.load();
    if (!credentials.url || !credentials.token) {
      const organized = organizeDevices([], homeConfig);
      return { state: 'not_configured', message: 'Conecta Home Assistant desde Ajustes → Alexa.', ...organized, updatedAt: new Date().toISOString() };
    }
    const organized = organizeDevices(await discoveredDevices(credentials), homeConfig);
    const deviceCount = organized.rooms.reduce((sum, room) => sum + room.devices.length, 0) + organized.unassignedDevices.length;
    const commandCount = organized.rooms.filter(room => room.onCommand && room.offCommand).length;
    const commandReady = commandCount > 0 && Boolean(credentials.deviceId);
    const message = deviceCount ? 'Casa sincronizada con Home Assistant.' : commandReady ? 'Control por comandos de Alexa listo. El estado refleja la última orden enviada.' : commandCount ? 'Elige en Ajustes el Echo que enviará los comandos.' : 'Configura los comandos de cada ambiente desde Casa → Editar.';
    return { state: deviceCount || commandReady ? 'ready' : 'empty', message, ...organized, updatedAt: new Date().toISOString() };
  }

  async function saveAssumedState(homeConfig, roomIds, turnOn, changedAt) {
    const ids = new Set(roomIds);
    const updated = { ...homeConfig, rooms: homeConfig.rooms.map(room => ids.has(room.id) ? { ...room, assumedOn: turnOn, changedAt } : room) };
    await configStore.save(updated);
    return updated;
  }

  async function sendRoomCommand(credentials, room, turnOn) {
    if (!credentials.deviceId) throw new HomeError('Elige el Echo que enviará los comandos en Ajustes → Alexa.', 409, 'choose_device');
    const command = turnOn ? room.onCommand : room.offCommand;
    if (!command) throw new HomeError('Configura los comandos de encendido y apagado de este ambiente.', 409, 'missing_command');
    const textCommand = textForAlexa(command);
    if (!textCommand) throw new HomeError('Escribe una orden después de “Alexa”.', 409, 'missing_command');
    await call(credentials, 'services/alexa_devices/send_text_command', { device_id: credentials.deviceId, text_command: textCommand });
  }

  async function toggle(credentials, input) {
    let homeConfig = await configStore.load();
    const current = await load(credentials, homeConfig);
    const allDevices = [...current.rooms.flatMap(room => room.devices), ...current.unassignedDevices];
    const changedAt = new Date().toISOString();
    if (typeof input.entityId === 'string') {
      const device = allDevices.find(item => item.entityId === input.entityId);
      if (!device) throw new HomeError('Este dispositivo ya no está disponible.', 409, 'missing_device');
      await call(credentials, `services/homeassistant/turn_${input.turnOn ? 'on' : 'off'}`, { entity_id: [device.entityId] });
      return { message: `${device.name}: ${input.turnOn ? 'encendido' : 'apagado'}.`, control: 'device', entityId: device.entityId, turnOn: input.turnOn, updatedAt: changedAt };
    }
    if (typeof input.roomId !== 'string') throw new HomeError('Acción no válida.');
    if (input.roomId === 'all') {
      const commandRooms = current.rooms.filter(room => room.onCommand && room.offCommand && (input.turnOn || room.assumedOn));
      const commandRoomIds = new Set(current.rooms.filter(room => room.onCommand && room.offCommand).map(room => room.id));
      const directDevices = [...current.rooms.filter(room => !commandRoomIds.has(room.id)).flatMap(room => room.devices), ...current.unassignedDevices];
      if (!directDevices.length && !commandRooms.length) throw new HomeError('No hay ambientes activos que controlar.', 409, 'empty_room');
      if (directDevices.length) await call(credentials, `services/homeassistant/turn_${input.turnOn ? 'on' : 'off'}`, { entity_id: directDevices.map(device => device.entityId) });
      for (const room of commandRooms) {
        await sendRoomCommand(credentials, room, input.turnOn);
        homeConfig = await saveAssumedState(homeConfig, [room.id], input.turnOn, changedAt);
      }
      return { message: input.turnOn ? 'Orden de encendido enviada a toda la casa.' : 'Órdenes de apagado enviadas a la casa.', control: 'all', roomIds: commandRooms.map(room => room.id), turnOn: input.turnOn, updatedAt: changedAt };
    }
    const room = current.rooms.find(item => item.id === input.roomId);
    if (!room) throw new HomeError('Este ambiente ya no existe.', 409, 'missing_room');
    if (room.onCommand && room.offCommand) {
      await sendRoomCommand(credentials, room, input.turnOn);
      await saveAssumedState(homeConfig, [room.id], input.turnOn, changedAt);
      return { message: `Alexa recibió la orden para ${input.turnOn ? 'encender' : 'apagar'} ${room.name}.`, control: 'alexa', roomId: room.id, turnOn: input.turnOn, updatedAt: changedAt };
    }
    if (!room.devices.length) throw new HomeError('Configura los comandos de este ambiente desde Editar.', 409, 'missing_command');
    await call(credentials, `services/homeassistant/turn_${input.turnOn ? 'on' : 'off'}`, { entity_id: room.devices.map(device => device.entityId) });
    return { message: `${room.name}: ${input.turnOn ? 'encendido' : 'apagado'}.`, control: 'room', roomId: room.id, turnOn: input.turnOn, updatedAt: changedAt };
  }

  return async (req, res, next) => {
    const path = req.url?.split('?')[0];
    if (!path?.startsWith('/api/home/')) return next();
    if (!allowedRequest(req)) return reply(res, 403, { message: 'Abre Rasp en este equipo para controlar la casa.', code: 'origin' });
    try {
      const credentials = await store.load();
      if (path === '/api/home/state' && req.method === 'GET') return reply(res, 200, await load(credentials));
      if (req.method !== 'POST' || !req.headers['content-type']?.startsWith('application/json') || req.headers['x-rasp-request'] !== 'home') throw new HomeError('Acción no disponible.', 404);
      const input = await readBody(req);
      if (path === '/api/home/configuration') {
        const previous = await configStore.load();
        const saved = validateHomeConfig(input, previous);
        await configStore.save(saved);
        return reply(res, 200, { ...(await load(credentials, saved)), message: 'La organización y los comandos quedaron guardados.' });
      }
      if (path !== '/api/home/toggle' || typeof input.turnOn !== 'boolean' || !/^[a-zA-Z0-9-]{16,80}$/.test(input.requestId || '')) throw new HomeError('Acción no válida.');
      if (executions.has(input.requestId)) { const result = await executions.get(input.requestId); return reply(res, result.status, result.data); }
      const task = (async () => {
        try { return { status: 200, data: await toggle(credentials, input) }; }
        catch (error) { return { status: error.status || 500, data: { message: error instanceof HomeError ? error.message : 'No se pudo controlar la casa.', code: error.code || 'error' } }; }
      })();
      executions.set(input.requestId, task);
      if (executions.size > 50) executions.delete(executions.keys().next().value);
      const result = await task;
      return reply(res, result.status, result.data);
    } catch (error) {
      return reply(res, error.status || 500, { message: error instanceof HomeError ? error.message : 'No se pudo controlar la casa.', code: error.code || 'error' });
    }
  };
}

export function homeBridgePlugin() {
  return { name: 'rasp-home', configureServer(server) { server.middlewares.use(createHomeMiddleware()); }, configurePreviewServer(server) { server.middlewares.use(createHomeMiddleware()); } };
}
