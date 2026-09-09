import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const execute = promisify(execFile);
export const SHORTCUT_NAME = 'Rasp Focus';
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
export function validFocusRequest(body, now = Date.now()) {
  return body && typeof body.requestId === 'string' && /^[a-zA-Z0-9-]{16,80}$/.test(body.requestId) &&
    Number.isSafeInteger(body.deadline) && body.deadline > now && body.deadline <= now + 120 * 60000;
}
async function macStatus(run) {
  if (process.platform !== 'darwin') return { available: false, ready: false, shortcut: SHORTCUT_NAME, message: 'No molestar requiere ejecutar el acompañante en macOS.' };
  try {
    const { stdout } = await run('/usr/bin/shortcuts', ['list'], { timeout: 8000, maxBuffer: 256 * 1024 });
    const ready = stdout.split(/\r?\n/).some(name => name.trim() === SHORTCUT_NAME);
    return { available: true, ready, shortcut: SHORTCUT_NAME, message: ready ? 'Atajo encontrado en este Mac.' : `Crea el atajo «${SHORTCUT_NAME}» para activar No molestar.` };
  } catch { return { available: true, ready: false, shortcut: SHORTCUT_NAME, message: 'No se pudo consultar Atajos. Abre Atajos en el Mac y vuelve a comprobar.' }; }
}
function json(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(data));
}
async function readBody(req) {
  let body = '';
  for await (const chunk of req) { body += chunk; if (body.length > 1024) throw new Error('body too large'); }
  return JSON.parse(body);
}
// Only this named shortcut can run. No arbitrary command, shortcut name, or network URL is accepted.
export function createMacMiddleware(run = execute) {
  const requests = new Map();
  let busy = false;
  return async (req, res, next) => {
    const path = req.url?.split('?')[0];
    if (!path?.startsWith('/api/mac/')) return next();
    if (!allowedRequest(req)) return json(res, 403, { message: 'Esta conexión solo está disponible desde Rasp en este Mac.' });
    if (path === '/api/mac/status' && req.method === 'GET') return json(res, 200, await macStatus(run));
    if (path !== '/api/mac/focus' || req.method !== 'POST') return json(res, 404, { message: 'Acción no disponible.' });
    if (!req.headers['content-type']?.startsWith('application/json') || req.headers['x-rasp-request'] !== 'focus') return json(res, 400, { message: 'Solicitud no válida.' });
    let body;
    try { body = await readBody(req); } catch { return json(res, 400, { message: 'Solicitud no válida.' }); }
    if (!validFocusRequest(body)) return json(res, 400, { message: 'La duración debe ser de hasta 120 minutos y terminar en el futuro.' });
    if (requests.has(body.requestId)) { const saved = await requests.get(body.requestId); return json(res, saved.code, saved.data); }
    if (busy) return json(res, 409, { message: 'El Mac está procesando otro atajo. El temporizador continúa.' });
    busy = true;
    const operation = (async () => {
      let directory;
      try {
        const status = await macStatus(run);
        if (!status.ready) return { code: 409, data: { message: status.message } };
        directory = await mkdtemp(join(tmpdir(), 'rasp-focus-'));
        const input = join(directory, 'until.txt');
        await writeFile(input, new Date(body.deadline).toISOString(), { mode: 0o600 });
        await run('/usr/bin/shortcuts', ['run', SHORTCUT_NAME, '--input-path', input], { timeout: 10000, maxBuffer: 64000 });
        return { code: 200, data: { message: `Atajo ejecutado · No molestar solicitado hasta ${new Date(body.deadline).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}.`, deadline: body.deadline } };
      } catch { return { code: 502, data: { message: 'Atajos no confirmó la ejecución. Revisa el atajo en tu Mac; el Pomodoro sigue en marcha.' } }; }
      finally { if (directory) await rm(directory, { recursive: true, force: true }); busy = false; }
    })();
    requests.set(body.requestId, operation);
    if (requests.size > 50) requests.delete(requests.keys().next().value);
    const result = await operation;
    json(res, result.code, result.data);
  };
}
export function macBridgePlugin() {
  return { name: 'rasp-mac-focus', configureServer(server) { server.middlewares.use(createMacMiddleware()); }, configurePreviewServer(server) { server.middlewares.use(createMacMiddleware()); } };
}
