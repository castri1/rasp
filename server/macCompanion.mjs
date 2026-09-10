import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SHORTCUT_NAME, STOP_SHORTCUT_NAME, validFocusRequest, validFocusStopRequest, validMeetRequest } from './macBridge.mjs';
import { runReminders, validReminderCompleteRequest, validReminderListsRequest } from './reminders.mjs';

const execute = promisify(execFile);

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

async function focusStatus(run, readyFile, shortcutsCli = '/usr/bin/shortcuts') {
  if (readyFile) {
    try { await access(readyFile); } catch { return { focusReady: false, focusStopReady: false }; }
  }
  try {
    const { stdout } = await run(shortcutsCli, ['list'], { timeout: 8000, maxBuffer: 256 * 1024 });
    const names = stdout.split(/\r?\n/).map(name => name.trim());
    return { focusReady: names.includes(SHORTCUT_NAME), focusStopReady: names.includes(STOP_SHORTCUT_NAME) };
  } catch { return { focusReady: false, focusStopReady: false }; }
}

function meetUrlForAccount(value, account) {
  const url = new URL(value);
  if (account) url.searchParams.set('authuser', account);
  return url.href;
}

export function createCompanionHandler({ token, run = execute, readyFile = '', remindersHelper = '', meetAccount = '', shortcutsCli = '/usr/bin/shortcuts' }) {
  const requests = new Map();
  return async (req, res) => {
    if (req.headers.authorization !== `Bearer ${token}`) return json(res, 401, { message: 'Acceso no autorizado.' });
    const path = req.url?.split('?')[0];
    if (path === '/status' && req.method === 'GET') {
      const shortcuts = await focusStatus(run, readyFile, shortcutsCli);
      const message = shortcuts.focusReady && shortcuts.focusStopReady ? 'Mac conectado. Meet y No molestar están listos.' : shortcuts.focusReady ? `Mac conectado. Crea «${STOP_SHORTCUT_NAME}» para apagar No molestar al terminar.` : `Mac conectado. Google Meet está listo; crea el atajo «${SHORTCUT_NAME}» para No molestar.`;
      return json(res, 200, { available: true, ready: true, ...shortcuts, meetAccount, shortcut: SHORTCUT_NAME, message });
    }
    if (path === '/reminders/lists' && req.method === 'GET') {
      if (!remindersHelper) return json(res, 503, { message: 'Actualiza el acompañante del Mac para usar Recordatorios.' });
      try { return json(res, 200, { lists: await runReminders(run, remindersHelper, 'lists') }); }
      catch (error) { return json(res, 503, { message: error.message }); }
    }
    if (!['/open-meet', '/focus', '/focus-off', '/reminders/tasks', '/reminders/complete'].includes(path) || req.method !== 'POST' || !req.headers['content-type']?.startsWith('application/json')) return json(res, 404, { message: 'Acción no disponible.' });
    let body;
    try { body = await readBody(req); } catch { return json(res, 400, { message: 'Solicitud no válida.' }); }
    if (path === '/open-meet' && !validMeetRequest(body)) return json(res, 400, { message: 'Enlace de Google Meet no válido.' });
    if (path === '/focus' && !validFocusRequest(body)) return json(res, 400, { message: 'Duración de enfoque no válida.' });
    if (path === '/focus-off' && !validFocusStopRequest(body)) return json(res, 400, { message: 'Solicitud no válida.' });
    if (path === '/reminders/tasks' && !validReminderListsRequest(body)) return json(res, 400, { message: 'Selección de listas no válida.' });
    if (path === '/reminders/complete' && !validReminderCompleteRequest(body)) return json(res, 400, { message: 'Pendiente no válido.' });
    if (path.startsWith('/reminders/') && !remindersHelper) return json(res, 503, { message: 'Actualiza el acompañante del Mac para usar Recordatorios.' });
    const deduplicate = typeof body.requestId === 'string';
    if (deduplicate && requests.has(body.requestId)) {
      const saved = await requests.get(body.requestId);
      return json(res, saved.code, saved.data);
    }
    const operation = (async () => {
      if (path === '/open-meet') {
        try {
          const targetUrl = meetUrlForAccount(body.url, meetAccount);
          await run('/usr/bin/open', [targetUrl], { timeout: 8000, maxBuffer: 64000 });
          if (!body.deadline) return { code: 200, data: { message: 'Google Meet se abrió en tu Mac.', meetOpened: true, focusActivated: false } };
          if (!(await focusStatus(run, readyFile, shortcutsCli)).focusReady) return { code: 200, data: { message: `Google Meet se abrió. Termina de configurar el atajo «${SHORTCUT_NAME}» para activar No molestar.`, meetOpened: true, focusActivated: false } };
          let directory;
          try {
            directory = await mkdtemp(join(tmpdir(), 'rasp-meeting-'));
            const input = join(directory, 'until.txt');
            await writeFile(input, new Date(body.deadline).toISOString(), { mode: 0o600 });
            await run(shortcutsCli, ['run', SHORTCUT_NAME, '--input-path', input], { timeout: 10000, maxBuffer: 64000 });
            return { code: 200, data: { message: `Google Meet abierto. No molestar activo hasta ${new Date(body.deadline).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}.`, meetOpened: true, focusActivated: true } };
          } catch { return { code: 200, data: { message: 'Google Meet se abrió, pero el Mac no pudo activar No molestar.', meetOpened: true, focusActivated: false } }; }
          finally { if (directory) await rm(directory, { recursive: true, force: true }); }
        } catch { return { code: 502, data: { message: 'No se pudo abrir Google Meet en el Mac.' } }; }
      }
      if (path === '/focus-off') {
        try {
          if (!(await focusStatus(run, readyFile, shortcutsCli)).focusStopReady) return { code: 409, data: { message: `Crea el atajo «${STOP_SHORTCUT_NAME}» para apagar No molestar al terminar.` } };
          await run(shortcutsCli, ['run', STOP_SHORTCUT_NAME], { timeout: 10000, maxBuffer: 64000 });
          return { code: 200, data: { message: 'No molestar se apagó en tu Mac.' } };
        } catch { return { code: 502, data: { message: 'El Mac no pudo apagar No molestar.' } }; }
      }
      if (path.startsWith('/reminders/')) {
        try {
          const action = path.endsWith('/tasks') ? 'tasks' : 'complete';
          const result = await runReminders(run, remindersHelper, action, body);
          if (action === 'tasks') return { code: 200, data: { tasks: result } };
          return result.completed ? { code: 200, data: { message: 'Pendiente completado en Recordatorios.' } } : { code: 404, data: { message: 'El pendiente ya no existe en Recordatorios.' } };
        } catch (error) { return { code: 503, data: { message: error.message } }; }
      }
      let directory;
      try {
        if (!(await focusStatus(run, readyFile, shortcutsCli)).focusReady) return { code: 409, data: { message: `Termina de configurar el atajo «${SHORTCUT_NAME}» en el Mac para activar No molestar.` } };
        directory = await mkdtemp(join(tmpdir(), 'rasp-focus-'));
        const input = join(directory, 'until.txt');
        await writeFile(input, new Date(body.deadline).toISOString(), { mode: 0o600 });
        await run(shortcutsCli, ['run', SHORTCUT_NAME, '--input-path', input], { timeout: 10000, maxBuffer: 64000 });
        return { code: 200, data: { message: 'No molestar fue solicitado en tu Mac.', deadline: body.deadline } };
      } catch { return { code: 502, data: { message: 'No se pudo activar No molestar en el Mac.' } }; }
      finally { if (directory) await rm(directory, { recursive: true, force: true }); }
    })();
    if (deduplicate) {
      requests.set(body.requestId, operation);
      if (requests.size > 50) requests.delete(requests.keys().next().value);
    }
    const result = await operation;
    json(res, result.code, result.data);
  };
}

export async function startMacCompanion({ configFile = process.env.RASP_MAC_CONFIG, port = Number(process.env.RASP_MAC_PORT || 4175) } = {}) {
  if (!configFile) throw new Error('RASP_MAC_CONFIG es obligatorio.');
  const config = JSON.parse(await readFile(configFile, 'utf8'));
  if (typeof config.token !== 'string' || config.token.length < 32) throw new Error('La configuración del acompañante no es válida.');
  const meetAccount = typeof config.meetAccount === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.meetAccount) ? config.meetAccount : '';
  const server = createServer(createCompanionHandler({ token: config.token, readyFile: process.env.RASP_FOCUS_READY_FILE || '', remindersHelper: process.env.RASP_REMINDERS_HELPER || '', meetAccount, shortcutsCli: process.env.RASP_SHORTCUTS_CLI || '/usr/bin/shortcuts' }));
  server.listen(port, '127.0.0.1', () => console.log(`Rasp Mac Companion disponible en 127.0.0.1:${port}`));
  return server;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  startMacCompanion().catch(error => { console.error(error.message); process.exitCode = 1; });
}
