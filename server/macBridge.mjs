import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runReminders, validReminderCompleteRequest, validReminderListsRequest } from './reminders.mjs';

const execute = promisify(execFile);
export const SHORTCUT_NAME = 'Rasp Focus';
export const STOP_SHORTCUT_NAME = 'Rasp Focus Off';
const defaultConfigFile = resolve('.rasp/mac.json');
const loopback = new Set(['127.0.0.1', 'localhost', '[::1]']);

export function allowedRequest(req) {
  try {
    const host = new URL(`http://${req.headers.host}`);
    if (!loopback.has(host.hostname)) return false;
    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== host.host) return false;
    return !req.headers['sec-fetch-site'] || ['same-origin', 'none'].includes(req.headers['sec-fetch-site']);
  } catch { return false; }
}

export function validRequestId(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9-]{16,80}$/.test(value);
}

export function validFocusRequest(body, now = Date.now()) {
  return body && validRequestId(body.requestId) && Number.isSafeInteger(body.deadline) &&
    body.deadline > now && body.deadline <= now + 120 * 60000;
}

export function validFocusStopRequest(body) {
  return body && validRequestId(body.requestId);
}

export function validMeetUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'meet.google.com' && !url.username && !url.password;
  } catch { return false; }
}

export function validMeetRequest(body) {
  return body && validRequestId(body.requestId) && validMeetUrl(body.url) &&
    (body.deadline === undefined || validMeetingDeadline(body.deadline));
}

export function validMeetingDeadline(value, now = Date.now()) {
  return Number.isSafeInteger(value) && value > now && value <= now + 12 * 60 * 60000;
}

export function createMacConfigStore(file = defaultConfigFile) {
  return {
    async load() {
      try {
        const config = JSON.parse(await readFile(file, 'utf8'));
        if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(config.url) || typeof config.token !== 'string' || config.token.length < 32) return null;
        return { url: config.url.replace(/\/$/, ''), token: config.token };
      } catch { return null; }
    },
  };
}

async function localStatus(run) {
  try {
    const { stdout } = await run('/usr/bin/shortcuts', ['list'], { timeout: 8000, maxBuffer: 256 * 1024 });
    const focusReady = stdout.split(/\r?\n/).some(name => name.trim() === SHORTCUT_NAME);
    const focusStopReady = stdout.split(/\r?\n/).some(name => name.trim() === STOP_SHORTCUT_NAME);
    return {
      available: true,
      ready: true,
      focusReady,
      focusStopReady,
      shortcut: SHORTCUT_NAME,
      message: focusReady && focusStopReady ? 'Mac conectado. Meet y No molestar están listos.' : focusReady ? `Mac conectado. Crea «${STOP_SHORTCUT_NAME}» para apagar No molestar al terminar.` : `Mac conectado. Google Meet está listo; crea el atajo «${SHORTCUT_NAME}» para No molestar.`,
    };
  } catch {
    return { available: true, ready: true, focusReady: false, focusStopReady: false, shortcut: SHORTCUT_NAME, message: 'Mac conectado. Google Meet está listo; no se pudo consultar Atajos.' };
  }
}

function json(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(data));
}

async function readBody(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 16000) throw new Error('body too large');
  }
  return JSON.parse(body);
}

async function runLocalFocusOff(run) {
  try {
    const status = await localStatus(run);
    if (!status.focusStopReady) return { code: 409, data: { message: `Crea el atajo «${STOP_SHORTCUT_NAME}» para apagar No molestar al terminar.` } };
    await run('/usr/bin/shortcuts', ['run', STOP_SHORTCUT_NAME], { timeout: 10000, maxBuffer: 64000 });
    return { code: 200, data: { message: 'No molestar se apagó en tu Mac.' } };
  } catch { return { code: 502, data: { message: 'El Mac no pudo apagar No molestar.' } }; }
}

async function runLocalFocus(run, body) {
  let directory;
  try {
    const status = await localStatus(run);
    if (!status.focusReady) return { code: 409, data: { message: status.message } };
    directory = await mkdtemp(join(tmpdir(), 'rasp-focus-'));
    const input = join(directory, 'until.txt');
    await writeFile(input, new Date(body.deadline).toISOString(), { mode: 0o600 });
    await run('/usr/bin/shortcuts', ['run', SHORTCUT_NAME, '--input-path', input], { timeout: 10000, maxBuffer: 64000 });
    return { code: 200, data: { message: `No molestar solicitado hasta ${new Date(body.deadline).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}.`, deadline: body.deadline } };
  } catch {
    return { code: 502, data: { message: 'Atajos no confirmó la ejecución. El Pomodoro sigue en marcha.' } };
  } finally {
    if (directory) await rm(directory, { recursive: true, force: true });
  }
}

async function runLocalMeet(run, body) {
  try {
    await run('/usr/bin/open', [body.url], { timeout: 8000, maxBuffer: 64000 });
    if (body.deadline) {
      const focus = await runLocalFocus(run, body);
      if (focus.code === 200) return { code: 200, data: { message: `Google Meet abierto. No molestar activo hasta ${new Date(body.deadline).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}.`, meetOpened: true, focusActivated: true } };
      return { code: 200, data: { message: `Google Meet se abrió. ${focus.data.message}`, meetOpened: true, focusActivated: false } };
    }
    return { code: 200, data: { message: 'Google Meet se abrió en tu Mac.', meetOpened: true, focusActivated: false } };
  } catch {
    return { code: 502, data: { message: 'El Mac recibió la reunión, pero no pudo abrir el navegador.' } };
  }
}

async function companionRequest(store, request, path, body) {
  const config = await store.load();
  if (!config) return { code: 503, data: { available: false, ready: false, focusReady: false, shortcut: SHORTCUT_NAME, message: 'El acompañante del Mac aún no está configurado.' } };
  try {
    const response = await request(`${config.url}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${config.token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10000),
    });
    const data = await response.json();
    return { code: response.status, data };
  } catch {
    return { code: 503, data: { available: false, ready: false, focusReady: false, shortcut: SHORTCUT_NAME, message: 'El Mac no está disponible. Comprueba que esté encendido y conectado a la red.' } };
  }
}

// Browser requests are same-origin. The Pi forwards only fixed, validated actions to an authenticated loopback companion.
export function createMacMiddleware(options = {}) {
  const legacy = typeof options === 'function';
  const run = legacy ? options : options.run ?? execute;
  const store = legacy ? createMacConfigStore() : options.store ?? createMacConfigStore();
  const request = legacy ? fetch : options.request ?? fetch;
  const platform = legacy ? process.platform : options.platform ?? process.platform;
  const remindersHelper = legacy ? process.env.RASP_REMINDERS_HELPER : options.remindersHelper ?? process.env.RASP_REMINDERS_HELPER;
  const requests = new Map();
  let busy = false;

  async function perform(path, body) {
    if (platform === 'darwin') return path === '/focus' ? runLocalFocus(run, body) : path === '/focus-off' ? runLocalFocusOff(run) : runLocalMeet(run, body);
    return companionRequest(store, request, path, body);
  }

  async function performReminders(action, body) {
    if (platform !== 'darwin') return companionRequest(store, request, `/reminders/${action}`, body);
    if (!remindersHelper) return { code: 503, data: { message: 'Instala de nuevo el acompañante del Mac para usar Recordatorios.' } };
    try {
      const result = await runReminders(run, remindersHelper, action, body);
      if (action === 'lists') return { code: 200, data: { lists: result } };
      if (action === 'tasks') return { code: 200, data: { tasks: result } };
      return result.completed ? { code: 200, data: { message: 'Pendiente completado en Recordatorios.' } } : { code: 404, data: { message: 'El pendiente ya no existe en Recordatorios.' } };
    } catch (error) { return { code: 503, data: { message: error.message } }; }
  }

  return async (req, res, next) => {
    const path = req.url?.split('?')[0];
    if (path?.startsWith('/api/reminders/')) {
      if (!allowedRequest(req)) return json(res, 403, { message: 'Esta conexión sólo está disponible desde Rasp.' });
      const action = path.slice('/api/reminders/'.length);
      if (action === 'lists' && req.method === 'GET') {
        const result = await performReminders('lists');
        return json(res, result.code, result.data);
      }
      if (!['tasks', 'complete'].includes(action) || req.method !== 'POST' || !req.headers['content-type']?.startsWith('application/json') || req.headers['x-rasp-request'] !== 'reminders') return json(res, 404, { message: 'Acción no disponible.' });
      let reminderBody;
      try { reminderBody = await readBody(req); } catch { return json(res, 400, { message: 'Solicitud no válida.' }); }
      if (action === 'tasks' && !validReminderListsRequest(reminderBody)) return json(res, 400, { message: 'Selección de listas no válida.' });
      if (action === 'complete' && !validReminderCompleteRequest(reminderBody)) return json(res, 400, { message: 'Pendiente no válido.' });
      const result = await performReminders(action, reminderBody);
      return json(res, result.code, result.data);
    }
    if (!path?.startsWith('/api/mac/')) return next();
    if (!allowedRequest(req)) return json(res, 403, { message: 'Esta conexión sólo está disponible desde Rasp.' });
    if (path === '/api/mac/status' && req.method === 'GET') {
      const result = platform === 'darwin' ? { code: 200, data: await localStatus(run) } : await companionRequest(store, request, '/status');
      return json(res, result.code, result.data);
    }

    const action = path === '/api/mac/focus' ? 'focus' : path === '/api/mac/focus-off' ? 'focus-off' : path === '/api/mac/open-meet' ? 'open-meet' : '';
    if (!action || req.method !== 'POST') return json(res, 404, { message: 'Acción no disponible.' });
    if (!req.headers['content-type']?.startsWith('application/json') || req.headers['x-rasp-request'] !== action) return json(res, 400, { message: 'Solicitud no válida.' });
    let body;
    try { body = await readBody(req); } catch { return json(res, 400, { message: 'Solicitud no válida.' }); }
    if (action === 'focus' && !validFocusRequest(body)) return json(res, 400, { message: 'La duración debe ser de hasta 120 minutos y terminar en el futuro.' });
    if (action === 'focus-off' && !validFocusStopRequest(body)) return json(res, 400, { message: 'Solicitud no válida.' });
    if (action === 'open-meet' && !validMeetRequest(body)) return json(res, 400, { message: 'La reunión no tiene un enlace válido de Google Meet.' });
    if (requests.has(body.requestId)) {
      const saved = await requests.get(body.requestId);
      return json(res, saved.code, saved.data);
    }
    if (busy) return json(res, 409, { message: 'El Mac está procesando otra acción. Intenta de nuevo en un momento.' });
    busy = true;
    const operation = perform(`/${action}`, body).finally(() => { busy = false; });
    requests.set(body.requestId, operation);
    if (requests.size > 50) requests.delete(requests.keys().next().value);
    const result = await operation;
    json(res, result.code, result.data);
  };
}

export function macBridgePlugin() {
  return { name: 'rasp-mac-bridge', configureServer(server) { server.middlewares.use(createMacMiddleware()); }, configurePreviewServer(server) { server.middlewares.use(createMacMiddleware()); } };
}
