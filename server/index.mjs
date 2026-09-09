import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMacMiddleware } from './macBridge.mjs';
import { createAlexaMiddleware, createConfigStore as createHomeAssistantConfigStore } from './alexaBridge.mjs';
import { createHomeMiddleware } from './homeBridge.mjs';
import { createGoogleCalendarMiddleware, createGoogleCalendarPairing, createGoogleConfigStore } from './googleCalendar.mjs';
const root = resolve(fileURLToPath(new URL('../dist', import.meta.url)));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png' };
const bridge = createMacMiddleware();
const homeAssistantStore = createHomeAssistantConfigStore();
const alexa = createAlexaMiddleware({ store: homeAssistantStore });
const home = createHomeMiddleware({ store: homeAssistantStore });
const googleStore = createGoogleConfigStore();
const calendarPairing = createGoogleCalendarPairing({ store: googleStore });
const calendar = createGoogleCalendarMiddleware({ store: googleStore, pairing: calendarPairing });
const server = createServer(async (req, res) => {
  await bridge(req, res, async () => alexa(req, res, async () => home(req, res, async () => calendar(req, res, async () => {
    if (!['GET', 'HEAD'].includes(req.method ?? '')) { res.writeHead(405); res.end(); return; }
    try {
      const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const file = resolve(root, `.${path === '/' || path === '/app' || path === '/app/' ? '/index.html' : path}`);
      if (!file.startsWith(root + sep) || !(await stat(file)).isFile()) throw new Error('Not found');
      res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      res.end(req.method === 'HEAD' ? undefined : await readFile(file));
    } catch { res.writeHead(404); res.end('No encontrado. Ejecuta npm run build antes de iniciar.'); }
  }))));
});
server.listen(4173, '127.0.0.1', () => console.log('Rasp disponible en http://127.0.0.1:4173/app'));
