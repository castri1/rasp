import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { allowedRequest } from './macBridge.mjs';

export const SCENE_ICONS = ['lamp', 'focus', 'coffee', 'meeting', 'moon'];
export const DEFAULT_SCENES = [
  { id: 'focus', name: 'Enfoque', description: 'Un espacio para una sola cosa.', icon: 'focus', command: '' },
  { id: 'break', name: 'Descanso', description: 'Baja el ritmo. Toma aire.', icon: 'coffee', command: '' },
  { id: 'meeting', name: 'Reunión', description: 'Prepara tu espacio para conectar.', icon: 'meeting', command: '' },
  { id: 'evening', name: 'Fin del día', description: 'Todo a su tiempo. También parar.', icon: 'moon', command: '' },
];
export const EMPTY_CONFIG = { version: 2, url: '', token: '', deviceId: '', scenes: structuredClone(DEFAULT_SCENES), automatic: { focusSceneId: '', breakSceneId: '' } };
// Read only the devices belonging to Alexa Devices; never accept templates from the browser.
export const DEVICES_TEMPLATE = `{% set ns = namespace(items=[], ids=[]) %}{% for entity in integration_entities('alexa_devices') %}{% set id = device_id(entity) %}{% if id and id not in ns.ids %}{% set ns.ids = ns.ids + [id] %}{% set ns.items = ns.items + [{'id': id, 'name': device_attr(id, 'name_by_user') or device_attr(id, 'name') or 'Dispositivo Alexa'}] %}{% endif %}{% endfor %}{{ ns.items | to_json }}`;
export const ROUTINES_TEMPLATE = `{% set ns = namespace(items=[]) %}{% for entity in integration_entities('alexa_devices') %}{% if entity.startswith('button.') and not entity.endswith('_restart') %}{% set id = device_id(entity) %}{% set device_name = device_attr(id, 'name_by_user') or device_attr(id, 'name') or '' %}{% set friendly = state_attr(entity, 'friendly_name') or entity %}{% set prefix = device_name ~ ' ' %}{% set display = friendly[(prefix | length):] if device_name and friendly.startswith(prefix) else friendly %}{% set ns.items = ns.items + [{'entityId': entity, 'name': display}] %}{% endif %}{% endfor %}{{ ns.items | to_json }}`;
class BridgeError extends Error { constructor(message, status = 400, code = 'invalid') { super(message); this.status = status; this.code = code; } }
export function normalizeUrl(value) {
  try {
    const u = new URL(value);
    if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || u.search || u.hash || (u.pathname !== '/' && u.pathname !== '')) throw new Error();
    if (u.protocol === 'http:') {
      const host = u.hostname;
      const local = ['localhost', '127.0.0.1', '[::1]'].includes(host) || host.endsWith('.local') || /^10\.\d+\.\d+\.\d+$/.test(host) || /^192\.168\.\d+\.\d+$/.test(host) || /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(host);
      if (!local) throw new Error();
    }
    return u.origin;
  } catch { throw new BridgeError('Usa la dirección de Home Assistant: HTTPS, o HTTP en tu red local, sin rutas ni credenciales.'); }
}
export function validateConfig(input, previous = EMPTY_CONFIG) {
  if (!input || typeof input !== 'object') throw new BridgeError('Configuración no válida.');
  const url = input.url ? normalizeUrl(input.url) : '';
  const suppliedToken = typeof input.token === 'string' ? input.token.trim() : '';
  if (previous.url && url !== previous.url && !suppliedToken) throw new BridgeError('Al cambiar de servidor, introduce también su token de acceso.');
  const token = suppliedToken || previous.token;
  if ((url && !token) || (!url && token) || (token && (token.length < 16 || token.length > 8192 || /\s/.test(token)))) throw new BridgeError('Introduce un token de acceso válido de Home Assistant.');
  if (typeof input.deviceId !== 'string' || (input.deviceId && !/^[a-f0-9]{32}$/i.test(input.deviceId))) throw new BridgeError('Elige un dispositivo Alexa de la lista.');
  if (!Array.isArray(input.scenes) || input.scenes.length < 1 || input.scenes.length > 12) throw new BridgeError('Configura entre 1 y 12 escenas.');
  const seen = new Set();
  const scenes = input.scenes.map(item => {
    if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(item.id) || seen.has(item.id)) throw new BridgeError('Las escenas contienen un identificador no válido.');
    seen.add(item.id);
    const fields = ['name', 'description', 'command'];
    if (fields.some(field => typeof item[field] !== 'string' || /[\x00-\x1f\x7f]/.test(item[field]))) throw new BridgeError('Los textos de las escenas deben estar en una sola línea.');
    const name = item.name.trim();
    const description = item.description.trim();
    const command = item.command.trim();
    if (!name || name.length > 40 || description.length > 100 || command.length > 180 || !SCENE_ICONS.includes(item.icon)) throw new BridgeError('Revisa el nombre, la descripción, el icono y el comando de tus escenas.');
    return { id: item.id, name, description, icon: item.icon, command };
  });
  const automatic = { focusSceneId: input.automatic?.focusSceneId || '', breakSceneId: input.automatic?.breakSceneId || '' };
  if (Object.values(automatic).some(id => typeof id !== 'string' || id && !seen.has(id))) throw new BridgeError('La escena automática seleccionada ya no existe.');
  return { version: 2, url, token, deviceId: input.deviceId, scenes, automatic };
}
export function migrateConfig(input) {
  if (input?.version !== 1) return input;
  return {
    version: 2, url: input.url || '', token: input.token || '', deviceId: input.deviceId || '',
    scenes: DEFAULT_SCENES.map(scene => ({ ...scene, command: typeof input.commands?.[scene.id] === 'string' ? input.commands[scene.id] : '' })),
    automatic: { focusSceneId: input.automatic?.focus === true ? 'focus' : '', breakSceneId: input.automatic?.break === true ? 'break' : '' },
  };
}
export function publicConfig(config) {
  const { token, ...rest } = config;
  return { ...rest, hasToken: Boolean(token), configured: Boolean(config.url && token) };
}
export function createConfigStore(file = resolve('.rasp/alexa.json')) {
  return {
    async load() {
      try { const raw = JSON.parse(await readFile(file, 'utf8')); if (![1, 2].includes(raw.version)) throw new Error(); return validateConfig(migrateConfig(raw)); }
      catch (error) { if (error.code === 'ENOENT') return structuredClone(EMPTY_CONFIG); throw new BridgeError('No se pudo leer la configuración guardada. Revisa el archivo de conexión.', 500, 'storage'); }
    },
    async save(config) {
      await mkdir(dirname(file), { recursive: true, mode: 0o700 });
      const temp = `${file}.${randomUUID()}.tmp`;
      await writeFile(temp, JSON.stringify(config), { mode: 0o600 });
      await rename(temp, file);
    },
  };
}
function reply(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(data));
}
function normalizedCommand(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('es');
}
async function body(req) {
  let value = '';
  for await (const part of req) { value += part; if (value.length > 16000) throw new BridgeError('Solicitud demasiado grande.'); }
  try { return JSON.parse(value); } catch { throw new BridgeError('Solicitud no válida.'); }
}
export function createAlexaMiddleware({ store = createConfigStore(), request = fetch } = {}) {
  let check = null;
  let busy = false;
  const executions = new Map();
  async function call(config, path, data) {
    let response;
    try {
      response = await request(`${config.url}/api/${path}`, {
        method: data ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(10000),
        headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' }, body: data ? JSON.stringify(data) : undefined,
      });
    } catch { throw new BridgeError('Home Assistant no respondió. Comprueba que esté encendido y conectado a tu red.', 502, 'offline'); }
    if ([401, 403].includes(response.status)) throw new BridgeError('Home Assistant rechazó el token. Revisa sus permisos o crea uno nuevo.', 401, 'auth');
    if (!response.ok) throw new BridgeError('Home Assistant no pudo completar la solicitud. Revisa la integración Alexa Devices.', 502, 'upstream');
    try { return await response.json(); } catch { throw new BridgeError('La dirección no devuelve una respuesta válida de Home Assistant.', 502, 'invalid_response'); }
  }
  async function probe(config) {
    if (!config.url || !config.token) return { state: 'not_configured', devices: [], routines: [], message: 'Conecta Home Assistant para usar tus rutinas de Alexa.' };
    const services = await call(config, 'services');
    if (!Array.isArray(services)) throw new BridgeError('La respuesta de Home Assistant no es válida.', 502);
    if (!services.some(item => item.domain === 'alexa_devices' && item.services && Object.hasOwn(item.services, 'send_text_command'))) return { state: 'alexa_missing', devices: [], routines: [], message: 'Home Assistant conectado. Añade la integración Alexa Devices para continuar.' };
    const [deviceResult, routineResult] = await Promise.all([
      call(config, 'template', { template: DEVICES_TEMPLATE }),
      call(config, 'template', { template: ROUTINES_TEMPLATE }),
    ]);
    if (!Array.isArray(deviceResult) || !Array.isArray(routineResult)) throw new BridgeError('No se pudo obtener la lista de dispositivos y rutinas de Alexa.', 502);
    const devices = deviceResult.filter(item => /^[a-f0-9]{32}$/i.test(item?.id) && typeof item.name === 'string').map(item => ({ id: item.id, name: item.name.slice(0, 120) }));
    const routines = routineResult.filter(item => /^button\.[a-z0-9_]+$/.test(item?.entityId) && typeof item.name === 'string').map(item => ({ entityId: item.entityId, name: item.name.slice(0, 120) }));
    if (!devices.length) return { state: 'no_devices', devices, routines, message: 'Alexa está vinculada, pero aún no aparecen dispositivos. Revisa Alexa Devices.' };
    if (!devices.some(item => item.id === config.deviceId)) return { state: 'choose_device', devices, routines, message: 'Selecciona el Echo que ejecutará tus rutinas.' };
    return { state: 'ready', devices, routines, message: 'Conexión lista. Puedes enviar tus escenas a Alexa.' };
  }
  return async (req, res, next) => {
    const path = req.url?.split('?')[0];
    if (!path?.startsWith('/api/alexa/')) return next();
    if (!allowedRequest(req)) return reply(res, 403, { message: 'Abre Rasp en este equipo para gestionar la conexión.', code: 'origin' });
    try {
      if (path === '/api/alexa/config' && req.method === 'GET') {
        const config = await store.load();
        return reply(res, 200, { config: publicConfig(config), connection: check || { state: config.url ? 'unchecked' : 'not_configured', devices: [], routines: [], message: config.url ? 'Comprueba la conexión para actualizar sus dispositivos.' : 'Conecta Home Assistant para usar tus rutinas de Alexa.' } });
      }
      if (req.method !== 'POST' || !['/api/alexa/config', '/api/alexa/check', '/api/alexa/run'].includes(path)) return reply(res, 404, { message: 'Acción no disponible.' });
      if (!req.headers['content-type']?.startsWith('application/json') || req.headers['x-rasp-request'] !== 'alexa') throw new BridgeError('Solicitud no válida.');
      const input = await body(req);
      if (path === '/api/alexa/run') {
        if (typeof input.scene !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(input.scene) || !/^[a-zA-Z0-9-]{16,80}$/.test(input.requestId || '') || !['manual', 'focus', 'break', 'automatic'].includes(input.source)) throw new BridgeError('Escena no válida.');
        if (executions.has(input.requestId)) { const result = await executions.get(input.requestId); return reply(res, result.status, result.data); }
        if (busy) throw new BridgeError('Hay otra operación en curso. Espera a que termine.', 409, 'busy');
        busy = true;
        const task = (async () => {
          try {
            const config = await store.load();
            const scene = config.scenes.find(item => item.id === input.scene);
            if (!scene) throw new BridgeError('Esta escena ya no existe.', 409);
            if (!scene.command) throw new BridgeError('Asigna una rutina o comando a esta escena en Ajustes → Alexa.', 409);
            const automaticSource = input.source === 'automatic' ? (config.automatic.focusSceneId === scene.id ? 'focus' : config.automatic.breakSceneId === scene.id ? 'break' : '') : input.source;
            if (automaticSource !== 'manual' && config.automatic[`${automaticSource}SceneId`] !== scene.id) throw new BridgeError('Esta acción automática está desactivada.', 409);
            check = await probe(config);
            if (check.state !== 'ready') throw new BridgeError(check.message, 409, check.state);
            const routine = check.routines.find(item => normalizedCommand(item.name) === normalizedCommand(scene.command));
            if (routine) {
              await call(config, 'services/button/press', { entity_id: routine.entityId });
              return { status: 200, data: { message: `Rutina «${routine.name}» ejecutada.`, scene: input.scene, sentAt: new Date().toISOString() } };
            }
            await call(config, 'services/alexa_devices/send_text_command', { device_id: config.deviceId, text_command: scene.command });
            return { status: 200, data: { message: 'Comando enviado a Alexa. Comprueba el resultado en tus dispositivos.', scene: input.scene, sentAt: new Date().toISOString() } };
          } catch (error) { return { status: error.status || 500, data: { message: error instanceof BridgeError ? error.message : 'No se pudo enviar la orden a Alexa.', code: error.code || 'error' } }; }
          finally { busy = false; }
        })();
        executions.set(input.requestId, task);
        if (executions.size > 50) executions.delete(executions.keys().next().value);
        const result = await task;
        return reply(res, result.status, result.data);
      }
      if (busy) throw new BridgeError('Hay otra operación en curso. Espera a que termine.', 409, 'busy');
      busy = true;
      try {
        if (path === '/api/alexa/config') {
          const previous = await store.load();
          const config = validateConfig(input, previous);
          await store.save(config);
          check = null;
          return reply(res, 200, { config: publicConfig(config), message: config.url ? 'Conexión guardada en este equipo.' : 'Escenas guardadas. La conexión sigue pendiente.' });
        }
        const config = await store.load();
        check = await probe(config);
        return reply(res, 200, { connection: check });
      } finally { busy = false; }
    } catch (error) {
      if (path === '/api/alexa/check') check = { state: error.code || 'error', devices: [], routines: [], message: error instanceof BridgeError ? error.message : 'No se pudo comprobar la conexión.' };
      return reply(res, error.status || 500, { message: error instanceof BridgeError ? error.message : 'No se pudo guardar o leer la configuración de Alexa.', code: error.code || 'error' });
    }
  };
}
export function alexaBridgePlugin() {
  return { name: 'rasp-alexa', configureServer(server) { server.middlewares.use(createAlexaMiddleware()); }, configurePreviewServer(server) { server.middlewares.use(createAlexaMiddleware()); } };
}
