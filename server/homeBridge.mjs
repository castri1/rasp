import { allowedRequest } from './macBridge.mjs';
import { createConfigStore } from './alexaBridge.mjs';

export const HOUSE_ROOMS = [
  { id: 'principal', name: 'Cuarto principal', aliases: ['habitacion principal'] },
  { id: 'juan-rafael', name: 'Cuarto Juan Rafael', aliases: ['habitacion juan rafael', 'juan rafael'] },
  { id: 'amalia', name: 'Oficina Amalia', aliases: ['estudio amalia'] },
  { id: 'oficina', name: 'Oficina', aliases: ['estudio'] },
  { id: 'comedor', name: 'Comedor', aliases: [] },
  { id: 'cocina', name: 'Cocina', aliases: [] },
  { id: 'sala', name: 'Sala', aliases: ['sala de estar'] },
  { id: 'balcon', name: 'Balcón', aliases: ['balcon'] },
];

// Area names come from Home Assistant. Only controllable light/switch entities are returned.
export const HOME_ENTITIES_TEMPLATE = `{% set ns = namespace(items=[]) %}{% for item in states.light %}{% set area = area_name(item.entity_id) %}{% if area %}{% set ns.items = ns.items + [{'entityId': item.entity_id, 'name': item.name, 'area': area, 'domain': 'light', 'state': item.state, 'brightness': item.attributes.brightness | default(0, true)}] %}{% endif %}{% endfor %}{% for item in states.switch %}{% set area = area_name(item.entity_id) %}{% if area %}{% set ns.items = ns.items + [{'entityId': item.entity_id, 'name': item.name, 'area': area, 'domain': 'switch', 'state': item.state, 'brightness': 0}] %}{% endif %}{% endfor %}{{ ns.items | to_json }}`;

class HomeError extends Error {
  constructor(message, status = 400, code = 'invalid') { super(message); this.status = status; this.code = code; }
}
function normalized(value) {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('es');
}
function reply(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(data));
}
async function readBody(req) {
  let value = '';
  for await (const part of req) { value += part; if (value.length > 4000) throw new HomeError('Solicitud demasiado grande.'); }
  try { return JSON.parse(value); } catch { throw new HomeError('Solicitud no válida.'); }
}
function roomForArea(area) {
  const value = normalized(area);
  return HOUSE_ROOMS.find(room => [room.name, ...room.aliases].some(alias => normalized(alias) === value));
}
function publicRooms(devices) {
  return HOUSE_ROOMS.map(room => {
    const items = devices.filter(device => roomForArea(device.area)?.id === room.id);
    const on = items.filter(device => device.state === 'on').length;
    const unavailable = items.filter(device => ['unavailable', 'unknown'].includes(device.state)).length;
    return { id: room.id, name: room.name, devices: items, on, unavailable };
  });
}

export function createHomeMiddleware({ store = createConfigStore(), request = fetch } = {}) {
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
  async function load(config) {
    if (!config.url || !config.token) return { state: 'not_configured', message: 'Conecta Home Assistant desde Ajustes → Alexa.', rooms: publicRooms([]), updatedAt: new Date().toISOString() };
    const result = await call(config, 'template', { template: HOME_ENTITIES_TEMPLATE });
    if (!Array.isArray(result)) throw new HomeError('No se pudo leer el estado de los ambientes.', 502);
    const devices = result.filter(item => /^(light|switch)\.[a-z0-9_]+$/.test(item?.entityId) && typeof item.name === 'string' && typeof item.area === 'string' && ['light', 'switch'].includes(item.domain) && ['on', 'off', 'unavailable', 'unknown'].includes(item.state)).map(item => ({
      entityId: item.entityId, name: item.name.slice(0, 100), area: item.area.slice(0, 100), domain: item.domain, state: item.state,
      brightness: Number.isFinite(Number(item.brightness)) ? Math.max(0, Math.min(255, Number(item.brightness))) : 0,
    }));
    const rooms = publicRooms(devices);
    const count = rooms.reduce((sum, room) => sum + room.devices.length, 0);
    return { state: count ? 'ready' : 'empty', message: count ? 'Casa sincronizada con Home Assistant.' : 'Conecta tus bombillos a Home Assistant y asígnalos a sus áreas.', rooms, updatedAt: new Date().toISOString() };
  }
  return async (req, res, next) => {
    const path = req.url?.split('?')[0];
    if (!path?.startsWith('/api/home/')) return next();
    if (!allowedRequest(req)) return reply(res, 403, { message: 'Abre Rasp en este equipo para controlar la casa.', code: 'origin' });
    try {
      const config = await store.load();
      if (path === '/api/home/state' && req.method === 'GET') return reply(res, 200, await load(config));
      if (path !== '/api/home/toggle' || req.method !== 'POST' || !req.headers['content-type']?.startsWith('application/json') || req.headers['x-rasp-request'] !== 'home') throw new HomeError('Acción no disponible.', 404);
      const input = await readBody(req);
      if (typeof input.turnOn !== 'boolean' || typeof input.roomId !== 'string') throw new HomeError('Acción no válida.');
      const current = await load(config);
      if (current.state !== 'ready') throw new HomeError(current.message, 409, current.state);
      const selected = input.roomId === 'all' ? current.rooms.flatMap(room => room.devices) : current.rooms.find(room => room.id === input.roomId)?.devices;
      if (!selected?.length) throw new HomeError('Este ambiente todavía no tiene dispositivos vinculados.', 409, 'empty_room');
      await call(config, `services/homeassistant/turn_${input.turnOn ? 'on' : 'off'}`, { entity_id: selected.map(device => device.entityId) });
      return reply(res, 200, { message: input.roomId === 'all' ? 'Toda la casa quedó apagada.' : `${current.rooms.find(room => room.id === input.roomId)?.name}: ${input.turnOn ? 'encendido' : 'apagado'}.`, updatedAt: new Date().toISOString() });
    } catch (error) {
      return reply(res, error.status || 500, { message: error instanceof HomeError ? error.message : 'No se pudo controlar la casa.', code: error.code || 'error' });
    }
  };
}

export function homeBridgePlugin() {
  return { name: 'rasp-home', configureServer(server) { server.middlewares.use(createHomeMiddleware()); }, configurePreviewServer(server) { server.middlewares.use(createHomeMiddleware()); } };
}
