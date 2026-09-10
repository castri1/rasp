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
  version: 1,
  rooms: HOUSE_ROOMS.map(room => ({ id: room.id, name: room.name, slot: room.slot })),
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

function validSingleLine(value, limit) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= limit && !/[\x00-\x1f\x7f]/.test(value);
}

function validEntityId(value) {
  return typeof value === 'string' && /^(light|switch)\.[a-z0-9_]+$/.test(value);
}

export function validateHomeConfig(input) {
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
    return { id: room.id, name: room.name.trim(), slot: room.slot };
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
  return { version: 1, rooms, assignments, deviceNames };
}

function normalizeStoredConfig(input) {
  if (input?.version !== 1 || !Array.isArray(input.rooms)) return structuredClone(EMPTY_HOME_CONFIG);
  try {
    return validateHomeConfig({ rooms: input.rooms, devices: Object.keys(input.assignments || {}).map(entityId => ({ entityId, roomId: input.assignments[entityId], name: input.deviceNames?.[entityId] || '' })) });
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

export function createHomeMiddleware({ store = createConfigStore(), configStore = createHomeConfigStore(), request = fetch } = {}) {
  async function call(config, path, data) {
    let response;
    try {
      response = await request(`${config.url}/api/${path}`, {
        method: data ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(10000),
        headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' }, body: data ? JSON.stringify(data) : undefined,
      });
    } catch { throw new HomeError('Home Assistant no respondió.', 502, 'offline'); }
    if ([401, 403].includes(response.status)) throw new HomeError('Home Assistant rechazó la credencial.', 401, 'auth');
    if (!response.ok) throw new HomeError('Home Assistant no pudo consultar la casa.', 502, 'upstream');
    try { return await response.json(); } catch { throw new HomeError('Home Assistant devolvió una respuesta no válida.', 502, 'invalid_response'); }
  }

  async function discoveredDevices(config) {
    const result = await call(config, 'template', { template: HOME_ENTITIES_TEMPLATE });
    if (!Array.isArray(result)) throw new HomeError('No se pudo leer el estado de los ambientes.', 502);
    return result.filter(item => validEntityId(item?.entityId) && typeof item.name === 'string' && typeof item.area === 'string' && ['light', 'switch'].includes(item.domain) && ['on', 'off', 'unavailable', 'unknown'].includes(item.state)).map(item => ({
      entityId: item.entityId, name: item.name.slice(0, 100), area: item.area.slice(0, 100), domain: item.domain, state: item.state,
      brightness: Number.isFinite(Number(item.brightness)) ? Math.max(0, Math.min(255, Number(item.brightness))) : 0,
    }));
  }

  async function load(credentials) {
    const homeConfig = await configStore.load();
    if (!credentials.url || !credentials.token) {
      const organized = organizeDevices([], homeConfig);
      return { state: 'not_configured', message: 'Conecta Home Assistant desde Ajustes → Alexa.', ...organized, updatedAt: new Date().toISOString() };
    }
    const organized = organizeDevices(await discoveredDevices(credentials), homeConfig);
    const count = organized.rooms.reduce((sum, room) => sum + room.devices.length, 0) + organized.unassignedDevices.length;
    return { state: count ? 'ready' : 'empty', message: count ? 'Casa sincronizada con Home Assistant.' : 'Tus dispositivos aparecerán aquí cuando los conectes a Home Assistant.', ...organized, updatedAt: new Date().toISOString() };
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
        const saved = validateHomeConfig(input);
        await configStore.save(saved);
        return reply(res, 200, { ...(await load(credentials)), message: 'La organización de la casa quedó guardada.' });
      }
      if (path !== '/api/home/toggle' || typeof input.turnOn !== 'boolean') throw new HomeError('Acción no válida.');
      const current = await load(credentials);
      if (current.state !== 'ready') throw new HomeError(current.message, 409, current.state);
      const allDevices = [...current.rooms.flatMap(room => room.devices), ...current.unassignedDevices];
      let selected;
      let label;
      if (typeof input.entityId === 'string') {
        const device = allDevices.find(item => item.entityId === input.entityId);
        if (!device) throw new HomeError('Este dispositivo ya no está disponible.', 409, 'missing_device');
        selected = [device]; label = device.name;
      } else if (typeof input.roomId === 'string') {
        selected = input.roomId === 'all' ? allDevices : current.rooms.find(room => room.id === input.roomId)?.devices;
        label = input.roomId === 'all' ? 'Toda la casa' : current.rooms.find(room => room.id === input.roomId)?.name;
      }
      if (!selected?.length) throw new HomeError('Este ambiente todavía no tiene dispositivos vinculados.', 409, 'empty_room');
      await call(credentials, `services/homeassistant/turn_${input.turnOn ? 'on' : 'off'}`, { entity_id: selected.map(device => device.entityId) });
      return reply(res, 200, { message: `${label}: ${input.turnOn ? 'encendido' : 'apagado'}.`, updatedAt: new Date().toISOString() });
    } catch (error) {
      return reply(res, error.status || 500, { message: error instanceof HomeError ? error.message : 'No se pudo controlar la casa.', code: error.code || 'error' });
    }
  };
}

export function homeBridgePlugin() {
  return { name: 'rasp-home', configureServer(server) { server.middlewares.use(createHomeMiddleware()); }, configurePreviewServer(server) { server.middlewares.use(createHomeMiddleware()); } };
}
