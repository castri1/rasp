import { createServer } from 'node:http';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { hostname, networkInterfaces } from 'node:os';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { allowedRequest } from './macBridge.mjs';

export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';
export const EMPTY_GOOGLE_CONFIG = {
  version: 1,
  clientId: '',
  clientSecret: '',
  refreshToken: '',
  account: '',
};

class CalendarError extends Error {
  constructor(message, status = 400, code = 'invalid') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Google explains the real cause in error_description; without it these failures are impossible to diagnose on the Raspberry. */
function googleDetail(source) {
  const description = typeof source?.error_description === 'string' ? source.error_description : '';
  return description.replace(/\s+/g, ' ').trim().slice(0, 240);
}

function logCalendar(stage, code, detail) {
  console.error(`[rasp] calendario · ${stage}: ${code}${detail ? ` — ${detail}` : ''}`);
}

function withDetail(message, detail) {
  return detail ? `${message} Google explicó: «${detail}»` : message;
}

function oauthDenial(error, detail = '') {
  const messages = {
    access_denied: 'Google rechazó el permiso. Si no pulsaste Cancelar, el administrador de Workspace debe autorizar esta aplicación.',
    org_internal: 'La cuenta elegida no pertenece a la misma organización de Google Workspace que el proyecto.',
    admin_policy_enforced: 'La política de Google Workspace bloqueó la aplicación. Un administrador debe permitir su ID de cliente OAuth.',
    invalid_client: 'Google no reconoce este ID de cliente. Comprueba que lo copiaste completo y que el cliente sigue existiendo.',
    invalid_request: 'Google rechazó la solicitud OAuth. Comprueba que el cliente sea de tipo Aplicación de escritorio.',
    redirect_uri_mismatch: 'El cliente OAuth no acepta el retorno local a 127.0.0.1. Debe ser de tipo Aplicación de escritorio.',
    disallowed_useragent: 'Google no acepta el navegador de la Raspberry para iniciar sesión. Actualiza Chromium.',
  };
  const safeCode = /^[a-z0-9_-]{1,80}$/i.test(error) ? error : 'oauth_denied';
  logCalendar('autorización denegada', safeCode, detail);
  return new CalendarError(withDetail(messages[safeCode] || `Google no autorizó el acceso (${safeCode}).`, detail), 400, safeCode);
}

function tokenFailure(data) {
  const error = typeof data?.error === 'string' && /^[a-z0-9_-]{1,80}$/i.test(data.error) ? data.error : 'token_error';
  const messages = {
    invalid_client: 'El ID y el secreto OAuth no coinciden, el cliente fue eliminado o las credenciales se copiaron incompletas.',
    unauthorized_client: 'Este cliente OAuth no permite el flujo de aplicación de escritorio. Crea un cliente nuevo de tipo Aplicación de escritorio.',
    invalid_grant: 'El código de autorización venció, ya fue usado o el reloj de la Raspberry está desfasado. Comprueba la hora e inicia otra vez la conexión.',
    access_denied: 'Google Workspace bloqueó el acceso. Un administrador debe permitir este ID de cliente OAuth.',
    invalid_request: 'Google rechazó el intercambio OAuth. Comprueba que utilizaste un cliente de tipo Aplicación de escritorio.',
    redirect_uri_mismatch: 'El cliente OAuth no acepta el retorno local a 127.0.0.1. Debe ser de tipo Aplicación de escritorio.',
    invalid_scope: 'El proyecto de Google Cloud no tiene autorizado el alcance de solo lectura del calendario.',
    token_error: 'Google respondió al intercambio OAuth sin entregar un token de acceso.',
  };
  const detail = googleDetail(data);
  logCalendar('intercambio de token rechazado', error, detail);
  return new CalendarError(withDetail(messages[error] || `Google rechazó la autorización (${error}).`, detail), error === 'invalid_grant' ? 401 : 502, error);
}

function json(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(data));
}

function loopbackRequest(req) {
  try {
    return ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(`http://${req.headers.host}`).hostname);
  } catch {
    return false;
  }
}

async function body(req) {
  let value = '';
  for await (const chunk of req) {
    value += chunk;
    if (value.length > 16_000) throw new CalendarError('Solicitud demasiado grande.');
  }
  try { return JSON.parse(value); }
  catch { throw new CalendarError('Solicitud no válida.'); }
}

export function validateGoogleConfig(input, previous = EMPTY_GOOGLE_CONFIG) {
  if (!input || typeof input !== 'object') throw new CalendarError('Configuración no válida.');
  const clientId = typeof input.clientId === 'string' ? input.clientId.trim() : '';
  const suppliedSecret = typeof input.clientSecret === 'string' ? input.clientSecret.trim() : '';
  if (!/^[a-zA-Z0-9._-]{20,260}\.apps\.googleusercontent\.com$/.test(clientId)) {
    throw new CalendarError('Introduce el ID de cliente de una aplicación OAuth para escritorio.');
  }
  if (suppliedSecret && (!/^[\x21-\x7e]{8,500}$/.test(suppliedSecret) || /\s/.test(suppliedSecret))) {
    throw new CalendarError('El secreto de cliente no tiene un formato válido.');
  }
  const sameClient = previous.clientId === clientId;
  const clientSecret = suppliedSecret || (sameClient ? previous.clientSecret : '');
  if (!clientSecret) throw new CalendarError('Introduce también el secreto de cliente de Google.');
  return {
    version: 1,
    clientId,
    clientSecret,
    refreshToken: sameClient ? previous.refreshToken : '',
    account: sameClient ? previous.account : '',
  };
}

export function publicGoogleConfig(config) {
  return {
    configured: Boolean(config.clientId && config.clientSecret),
    connected: Boolean(config.refreshToken),
    account: config.account,
    clientIdHint: config.clientId ? `${config.clientId.slice(0, 8)}…${config.clientId.slice(-27)}` : '',
  };
}

export function createGoogleConfigStore(file = resolve('.rasp/google-calendar.json')) {
  return {
    async load() {
      try {
        const raw = JSON.parse(await readFile(file, 'utf8'));
        if (raw.version !== 1 || typeof raw.refreshToken !== 'string' || typeof raw.account !== 'string') throw new Error();
        return { ...validateGoogleConfig(raw, raw), refreshToken: raw.refreshToken, account: raw.account };
      } catch (error) {
        if (error.code === 'ENOENT') return structuredClone(EMPTY_GOOGLE_CONFIG);
        throw new CalendarError('No se pudo leer la conexión guardada de Google Calendar.', 500, 'storage');
      }
    },
    async save(config) {
      await mkdir(dirname(file), { recursive: true, mode: 0o700 });
      const temp = `${file}.${randomUUID()}.tmp`;
      await writeFile(temp, JSON.stringify(config), { mode: 0o600 });
      await rename(temp, file);
    },
  };
}

export function createCalendarCache(file = resolve('.rasp/calendar-cache.json')) {
  return {
    async load() {
      try {
        const data = JSON.parse(await readFile(file, 'utf8'));
        return data.version === 1 && Array.isArray(data.events) ? data : null;
      } catch (error) {
        if (error.code === 'ENOENT') return null;
        throw error;
      }
    },
    async save(data) {
      await mkdir(dirname(file), { recursive: true, mode: 0o700 });
      const temp = `${file}.${randomUUID()}.tmp`;
      await writeFile(temp, JSON.stringify({ version: 1, ...data }), { mode: 0o600 });
      await rename(temp, file);
    },
  };
}

function pairingPage({ message = '', error = false, success = false } = {}) {
  const status = message
    ? `<p class="status ${error ? 'error' : success ? 'success' : ''}" role="status">${message}</p>`
    : '';
  const form = success ? '' : `<form method="post" action="/configure">
      <label>Código mostrado en la Raspberry<input name="code" autocomplete="one-time-code" autocapitalize="characters" maxlength="8" required placeholder="AB12CD34"></label>
      <label>ID de cliente<input name="clientId" autocomplete="off" spellcheck="false" required placeholder="…apps.googleusercontent.com"></label>
      <label>Secreto de cliente<input name="clientSecret" type="password" autocomplete="off" spellcheck="false" required placeholder="GOCSPX-…"></label>
      <button type="submit">Guardar en la Raspberry</button>
    </form>`;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Configurar Rasp</title><style>
    :root{color-scheme:dark;font-family:system-ui,-apple-system,sans-serif;background:#07111f;color:#edf7ff}*{box-sizing:border-box}body{min-height:100vh;margin:0;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at 20% 0,#123252 0,transparent 42%),#07111f}.card{width:min(100%,560px);padding:36px;border:1px solid #25445f;border-radius:20px;background:#0b1929;box-shadow:0 28px 80px #0008}span{display:block;color:#67d3ff;font-size:12px;font-weight:750;letter-spacing:.14em;text-transform:uppercase}h1{margin:10px 0 8px;font-size:32px;letter-spacing:-.04em}p{margin:0 0 24px;color:#a7bdcf;line-height:1.55}.status{padding:13px 15px;border-radius:10px;background:#102b41;color:#d8f4ff}.status.error{background:#3b2027;color:#ffbdc9}.status.success{background:#12352f;color:#9ff3d3}form{display:grid;gap:18px}label{display:grid;gap:8px;color:#a7bdcf;font-size:13px}input{width:100%;height:50px;border:1px solid #2a4962;border-radius:10px;padding:0 14px;background:#071421;color:#fff;font:inherit;outline:none}input:focus{border-color:#67d3ff;box-shadow:0 0 0 3px #67d3ff24}button{height:52px;border:0;border-radius:10px;background:#67d3ff;color:#062033;font-weight:800;font-size:15px;cursor:pointer}small{display:block;margin-top:20px;color:#678096;line-height:1.5}
  </style></head><body><main class="card"><span>Rasp · conexión local</span><h1>${success ? 'Credenciales guardadas' : 'Configurar Google Calendar'}</h1><p>${success ? 'Ya puedes cerrar esta pestaña y continuar en la pantalla de la Raspberry.' : 'Pega aquí las credenciales OAuth creadas en Google Cloud. Esta página desaparecerá automáticamente.'}</p>${status}${form}<small>La conexión solo está disponible durante 10 minutos dentro de tu red local.</small></main></body></html>`;
}

function html(res, status, content) {
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  });
  res.end(content);
}

function localAddresses(port, interfaces = networkInterfaces(), deviceName = hostname()) {
  const addresses = [];
  if (deviceName) addresses.push(`http://${deviceName.endsWith('.local') ? deviceName : `${deviceName}.local`}:${port}`);
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries || []) {
      if (!entry.internal && (entry.family === 'IPv4' || entry.family === 4)) addresses.push(`http://${entry.address}:${port}`);
    }
  }
  return [...new Set(addresses)];
}

function pairingCodeMatches(input, expected) {
  const supplied = Buffer.from(String(input || '').trim().toUpperCase());
  const saved = Buffer.from(expected);
  return supplied.length === saved.length && timingSafeEqual(supplied, saved);
}

/** Opens a short-lived, code-protected form on the LAN so long OAuth values can be pasted from another computer. */
export function createGoogleCalendarPairing({
  store = createGoogleConfigStore(),
  port = 4174,
  now = () => Date.now(),
  interfaces = networkInterfaces,
  deviceName = hostname,
} = {}) {
  let server;
  let session;
  let expiryTimer;

  async function stop() {
    if (expiryTimer) clearTimeout(expiryTimer);
    expiryTimer = undefined;
    session = undefined;
    if (!server) return;
    const active = server;
    server = undefined;
    await new Promise(resolveClose => active.close(() => resolveClose())).catch(() => undefined);
  }

  async function start() {
    await stop();
    const code = randomBytes(4).toString('hex').toUpperCase();
    session = { code, expiresAt: now() + 10 * 60_000, failures: 0 };
    server = createServer(async (req, res) => {
      if (!session || session.expiresAt <= now()) {
        html(res, 410, pairingPage({ message: 'El acceso temporal venció. Inícialo otra vez desde la Raspberry.', error: true }));
        void stop();
        return;
      }
      if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
        html(res, 200, pairingPage());
        return;
      }
      if (req.method !== 'POST' || req.url !== '/configure' || !req.headers['content-type']?.startsWith('application/x-www-form-urlencoded')) {
        html(res, 404, pairingPage({ message: 'Página no encontrada.', error: true }));
        return;
      }
      let raw = '';
      try {
        for await (const chunk of req) {
          raw += chunk;
          if (raw.length > 8_000) throw new Error('too large');
        }
        const input = new URLSearchParams(raw);
        if (!pairingCodeMatches(input.get('code'), session.code)) {
          session.failures += 1;
          html(res, 401, pairingPage({ message: 'El código no coincide con el mostrado en la Raspberry.', error: true }));
          if (session.failures >= 10) setTimeout(() => void stop(), 250);
          return;
        }
        const previous = await store.load();
        const config = validateGoogleConfig({ clientId: input.get('clientId'), clientSecret: input.get('clientSecret') }, previous);
        await store.save(config);
        html(res, 200, pairingPage({ message: 'Google Calendar quedó listo para autorizar.', success: true }));
        setTimeout(() => void stop(), 500);
      } catch (error) {
        const message = error instanceof CalendarError ? error.message : 'No se pudieron guardar las credenciales.';
        html(res, 400, pairingPage({ message, error: true }));
      }
    });
    await new Promise((resolveListen, reject) => {
      server.once('error', reject);
      server.listen(port, '0.0.0.0', resolveListen);
    });
    const activePort = server.address().port;
    expiryTimer = setTimeout(() => void stop(), Math.max(0, session.expiresAt - now()));
    expiryTimer.unref?.();
    return { code, addresses: localAddresses(activePort, interfaces(), deviceName()), expiresAt: new Date(session.expiresAt).toISOString(), port: activePort };
  }

  return { start, stop };
}

function googleMeetUrl(item) {
  const candidates = [
    item.hangoutLink,
    ...(Array.isArray(item.conferenceData?.entryPoints)
      ? item.conferenceData.entryPoints.filter(entry => entry?.entryPointType === 'video').map(entry => entry.uri)
      : []),
  ];
  for (const value of candidates) {
    try {
      const url = new URL(value);
      if (url.protocol === 'https:' && url.hostname === 'meet.google.com') return url.href;
    } catch { /* Ignore malformed conference URLs. */ }
  }
  return '';
}

function plainText(value) {
  return String(value || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 600);
}

export function normalizeGoogleEvents(items, timeMin, timeMax) {
  const dayStart = Date.parse(timeMin);
  const dayEnd = Date.parse(timeMax);
  return items
    .filter(item => item?.status !== 'cancelled' && item?.start?.dateTime && item?.end?.dateTime)
    .filter(item => !item.attendees?.some(attendee => attendee?.self && attendee?.responseStatus === 'declined'))
    .map(item => {
      const startTime = Date.parse(item.start.dateTime);
      const endTime = Date.parse(item.end.dateTime);
      const meetUrl = googleMeetUrl(item);
      const people = (Array.isArray(item.attendees) ? item.attendees : [])
        .filter(attendee => attendee && !attendee.self && attendee.responseStatus !== 'declined')
        .map(attendee => plainText(attendee.displayName || String(attendee.email || '').split('@')[0]))
        .filter(Boolean)
        .slice(0, 12);
      return {
        id: String(item.id || item.iCalUID || randomUUID()).slice(0, 300),
        title: plainText(item.summary) || 'Reunión sin título',
        start: Math.max(0, Math.floor((startTime - dayStart) / 60_000)),
        end: Math.min(1440, Math.ceil((endTime - dayStart) / 60_000)),
        description: plainText(item.description) || 'Sin descripción.',
        people,
        location: meetUrl ? 'Google Meet' : plainText(item.location) || 'Sin ubicación',
        hasMeet: Boolean(meetUrl),
        meetUrl,
      };
    })
    .filter(event => Number.isFinite(event.start) && Number.isFinite(event.end) && event.end > event.start && event.start < (dayEnd - dayStart) / 60_000)
    .sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
}

function validateRange(url) {
  const timeMin = url.searchParams.get('timeMin') || '';
  const timeMax = url.searchParams.get('timeMax') || '';
  const from = Date.parse(timeMin);
  const to = Date.parse(timeMax);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from || to - from < 18 * 3_600_000 || to - from > 30 * 3_600_000) {
    throw new CalendarError('El intervalo solicitado para la agenda no es válido.');
  }
  return { timeMin: new Date(from).toISOString(), timeMax: new Date(to).toISOString() };
}

async function responseJson(response) {
  try { return await response.json(); }
  catch { return {}; }
}

export function createGoogleCalendarMiddleware({
  store = createGoogleConfigStore(),
  cache = createCalendarCache(),
  request = fetch,
  now = () => Date.now(),
  pairing = createGoogleCalendarPairing({ store, now }),
} = {}) {
  const states = new Map();

  async function tokenRequest(config, parameters) {
    let response;
    try {
      response = await request('https://oauth2.googleapis.com/token', {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(12_000),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, ...parameters }),
      });
    } catch {
      throw new CalendarError('Google no respondió. Revisa la conexión a internet.', 502, 'offline');
    }
    const data = await responseJson(response);
    if (!response.ok || typeof data.access_token !== 'string') throw tokenFailure(data);
    return data;
  }

  async function accessToken(config) {
    if (!config.refreshToken) throw new CalendarError('Conecta tu cuenta de Google Calendar.', 401, 'needs_auth');
    const result = await tokenRequest(config, { grant_type: 'refresh_token', refresh_token: config.refreshToken });
    return result.access_token;
  }

  async function googleGet(path, token) {
    let response;
    try {
      response = await request(`https://www.googleapis.com/calendar/v3/${path}`, {
        redirect: 'error',
        signal: AbortSignal.timeout(15_000),
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      });
    } catch {
      throw new CalendarError('Google Calendar no respondió.', 502, 'offline');
    }
    const data = await responseJson(response);
    if ([401, 403].includes(response.status)) throw new CalendarError('Google Calendar solicita una nueva autorización.', 401, 'needs_auth');
    if (!response.ok) throw new CalendarError('Google Calendar no pudo entregar la agenda.', 502, 'google');
    return data;
  }

  async function accountFor(token) {
    try {
      const data = await googleGet('users/me/calendarList?maxResults=100', token);
      const primary = Array.isArray(data.items) ? data.items.find(item => item?.primary) : null;
      return typeof primary?.id === 'string' ? primary.id.slice(0, 254) : '';
    } catch {
      return '';
    }
  }

  return async (req, res, next) => {
    const requestUrl = new URL(req.url || '/', 'http://localhost');
    const path = requestUrl.pathname;
    if (!path.startsWith('/api/calendar/')) return next();

    const callback = path === '/api/calendar/oauth/callback';
    if (callback ? !loopbackRequest(req) : !allowedRequest(req)) {
      return json(res, 403, { message: 'Gestiona Google Calendar desde Rasp en la Raspberry.', code: 'origin' });
    }

    try {
      if (callback && req.method === 'GET') {
        const state = requestUrl.searchParams.get('state') || '';
        const savedState = states.get(state);
        states.delete(state);
        if (!savedState || savedState.expiresAt < now()) throw new CalendarError('La autorización venció. Iníciala nuevamente.', 400, 'state');
        if (requestUrl.searchParams.get('error')) throw oauthDenial(requestUrl.searchParams.get('error'), googleDetail({ error_description: requestUrl.searchParams.get('error_description') }));
        const code = requestUrl.searchParams.get('code') || '';
        if (!code || code.length > 4096) throw new CalendarError('Google no devolvió un código de autorización.');
        const config = await store.load();
        const token = await tokenRequest(config, {
          code,
          code_verifier: savedState.verifier,
          grant_type: 'authorization_code',
          redirect_uri: savedState.redirectUri,
        });
        if (typeof token.refresh_token !== 'string') throw new CalendarError('Google no entregó acceso permanente. Revoca el acceso anterior y vuelve a conectarlo.', 409, 'no_refresh_token');
        const account = await accountFor(token.access_token);
        await store.save({ ...config, refreshToken: token.refresh_token, account });
        res.writeHead(302, { Location: '/app?calendar=connected', 'Cache-Control': 'no-store' });
        res.end();
        return;
      }

      if (path === '/api/calendar/status' && req.method === 'GET') {
        const config = await store.load();
        return json(res, 200, { config: publicGoogleConfig(config) });
      }

      if (path === '/api/calendar/events' && req.method === 'GET') {
        const range = validateRange(requestUrl);
        const config = await store.load();
        try {
          const token = await accessToken(config);
          const parameters = new URLSearchParams({
            timeMin: range.timeMin,
            timeMax: range.timeMax,
            singleEvents: 'true',
            orderBy: 'startTime',
            maxResults: '100',
          });
          const data = await googleGet(`calendars/primary/events?${parameters}`, token);
          const events = normalizeGoogleEvents(Array.isArray(data.items) ? data.items : [], range.timeMin, range.timeMax);
          const syncedAt = new Date(now()).toISOString();
          await cache.save({ ...range, account: config.account, syncedAt, events }).catch(() => undefined);
          return json(res, 200, { events, account: config.account, syncedAt, source: 'google' });
        } catch (error) {
          const saved = await cache.load().catch(() => null);
          if (saved?.timeMin === range.timeMin && saved?.timeMax === range.timeMax) {
            return json(res, 200, { events: saved.events, account: saved.account || config.account, syncedAt: saved.syncedAt, source: 'cache', warning: error.message, warningCode: error.code || 'offline' });
          }
          throw error;
        }
      }

      if (req.method !== 'POST' || !['/api/calendar/config', '/api/calendar/auth/start', '/api/calendar/disconnect', '/api/calendar/pair/start'].includes(path)) {
        return json(res, 404, { message: 'Acción no disponible.' });
      }
      if (!req.headers['content-type']?.startsWith('application/json') || req.headers['x-rasp-request'] !== 'calendar') {
        throw new CalendarError('Solicitud no válida.');
      }

      const input = await body(req);
      if (path === '/api/calendar/pair/start') {
        try {
          return json(res, 200, await pairing.start());
        } catch {
          throw new CalendarError('No se pudo abrir la configuración temporal en la red local.', 503, 'pairing');
        }
      }
      if (path === '/api/calendar/config') {
        const previous = await store.load();
        const config = validateGoogleConfig(input, previous);
        await store.save(config);
        return json(res, 200, { config: publicGoogleConfig(config), message: config.refreshToken ? 'Credenciales actualizadas.' : 'Credenciales guardadas. Ya puedes conectar Google.' });
      }

      const config = await store.load();
      if (path === '/api/calendar/disconnect') {
        const disconnected = { ...config, refreshToken: '', account: '' };
        await store.save(disconnected);
        return json(res, 200, { config: publicGoogleConfig(disconnected), message: 'Cuenta de Google desconectada de esta Raspberry.' });
      }

      if (!config.clientId || !config.clientSecret) throw new CalendarError('Guarda primero las credenciales OAuth de Google Workspace.', 409, 'not_configured');
      const verifier = randomBytes(48).toString('base64url');
      const codeChallenge = createHash('sha256').update(verifier).digest('base64url');
      const state = randomBytes(24).toString('base64url');
      const redirectUri = `http://${req.headers.host}/api/calendar/oauth/callback`;
      states.set(state, { verifier, redirectUri, expiresAt: now() + 10 * 60_000 });
      logCalendar('autorización iniciada', config.clientId.slice(0, 12), `retorno ${redirectUri}`);
      for (const [key, saved] of states) if (saved.expiresAt < now()) states.delete(key);
      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      authUrl.search = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: CALENDAR_SCOPE,
        access_type: 'offline',
        prompt: 'consent',
        include_granted_scopes: 'true',
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      });
      return json(res, 200, { authUrl: authUrl.href, expiresAt: new Date(now() + 10 * 60_000).toISOString() });
    } catch (error) {
      if (callback) {
        const parameters = new URLSearchParams({
          calendar: 'error',
          calendar_error: error.code || 'error',
          calendar_message: error instanceof CalendarError ? error.message : 'No se pudo completar la conexión con Google Calendar.',
        });
        res.writeHead(302, { Location: `/app?${parameters}`, 'Cache-Control': 'no-store' });
        res.end();
        return;
      }
      return json(res, error.status || 500, {
        message: error instanceof CalendarError ? error.message : 'No se pudo completar la conexión con Google Calendar.',
        code: error.code || 'error',
      });
    }
  };
}

export function googleCalendarPlugin() {
  return {
    name: 'rasp-google-calendar',
    configureServer(server) { server.middlewares.use(createGoogleCalendarMiddleware()); },
    configurePreviewServer(server) { server.middlewares.use(createGoogleCalendarMiddleware()); },
  };
}
