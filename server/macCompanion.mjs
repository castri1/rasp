import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SHORTCUT_NAME, validFocusRequest, validMeetRequest } from './macBridge.mjs';

const execute = promisify(execFile);

function json(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(data));
}

async function readBody(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 4096) throw new Error('body too large');
  }
  return JSON.parse(body);
}

async function focusStatus(run) {
  try {
    const { stdout } = await run('/usr/bin/shortcuts', ['list'], { timeout: 8000, maxBuffer: 256 * 1024 });
    return stdout.split(/\r?\n/).some(name => name.trim() === SHORTCUT_NAME);
  } catch { return false; }
}

export function createCompanionHandler({ token, run = execute }) {
  const requests = new Map();
  return async (req, res) => {
    if (req.headers.authorization !== `Bearer ${token}`) return json(res, 401, { message: 'Acceso no autorizado.' });
    const path = req.url?.split('?')[0];
    if (path === '/status' && req.method === 'GET') {
      const focusReady = await focusStatus(run);
      return json(res, 200, { available: true, ready: true, focusReady, shortcut: SHORTCUT_NAME, message: focusReady ? 'Mac conectado. Google Meet y No molestar están listos.' : `Mac conectado. Google Meet está listo; crea el atajo «${SHORTCUT_NAME}» para No molestar.` });
    }
    if (!['/open-meet', '/focus'].includes(path) || req.method !== 'POST' || !req.headers['content-type']?.startsWith('application/json')) return json(res, 404, { message: 'Acción no disponible.' });
    let body;
    try { body = await readBody(req); } catch { return json(res, 400, { message: 'Solicitud no válida.' }); }
    if (path === '/open-meet' && !validMeetRequest(body)) return json(res, 400, { message: 'Enlace de Google Meet no válido.' });
    if (path === '/focus' && !validFocusRequest(body)) return json(res, 400, { message: 'Duración de enfoque no válida.' });
    if (requests.has(body.requestId)) {
      const saved = await requests.get(body.requestId);
      return json(res, saved.code, saved.data);
    }
    const operation = (async () => {
      if (path === '/open-meet') {
        try {
          await run('/usr/bin/open', [body.url], { timeout: 8000, maxBuffer: 64000 });
          return { code: 200, data: { message: 'Google Meet se abrió en tu Mac.' } };
        } catch { return { code: 502, data: { message: 'No se pudo abrir Google Meet en el Mac.' } }; }
      }
      let directory;
      try {
        if (!(await focusStatus(run))) return { code: 409, data: { message: `Crea el atajo «${SHORTCUT_NAME}» en el Mac para activar No molestar.` } };
        directory = await mkdtemp(join(tmpdir(), 'rasp-focus-'));
        const input = join(directory, 'until.txt');
        await writeFile(input, new Date(body.deadline).toISOString(), { mode: 0o600 });
        await run('/usr/bin/shortcuts', ['run', SHORTCUT_NAME, '--input-path', input], { timeout: 10000, maxBuffer: 64000 });
        return { code: 200, data: { message: 'No molestar fue solicitado en tu Mac.', deadline: body.deadline } };
      } catch { return { code: 502, data: { message: 'No se pudo activar No molestar en el Mac.' } }; }
      finally { if (directory) await rm(directory, { recursive: true, force: true }); }
    })();
    requests.set(body.requestId, operation);
    if (requests.size > 50) requests.delete(requests.keys().next().value);
    const result = await operation;
    json(res, result.code, result.data);
  };
}

export async function startMacCompanion({ configFile = process.env.RASP_MAC_CONFIG, port = Number(process.env.RASP_MAC_PORT || 4175) } = {}) {
  if (!configFile) throw new Error('RASP_MAC_CONFIG es obligatorio.');
  const config = JSON.parse(await readFile(configFile, 'utf8'));
  if (typeof config.token !== 'string' || config.token.length < 32) throw new Error('La configuración del acompañante no es válida.');
  const server = createServer(createCompanionHandler({ token: config.token }));
  server.listen(port, '127.0.0.1', () => console.log(`Rasp Mac Companion disponible en 127.0.0.1:${port}`));
  return server;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  startMacCompanion().catch(error => { console.error(error.message); process.exitCode = 1; });
}
