import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  CALENDAR_SCOPE,
  createGoogleCalendarMiddleware,
  createGoogleCalendarPairing,
  createGoogleConfigStore,
  normalizeGoogleEvents,
  publicGoogleConfig,
  validateGoogleConfig,
} from './googleCalendar.mjs';

const clientId = '123456789012345678901234567890.apps.googleusercontent.com';
const clientSecret = 'test-calendar-client-secret';
const connected = { version: 1, clientId, clientSecret, refreshToken: 'refresh-token-private', account: 'daniel@example.com' };

function memoryStore(initial = connected) {
  let saved = structuredClone(initial);
  return { load: async () => structuredClone(saved), save: async value => { saved = structuredClone(value); } };
}

function memoryCache(initial = null) {
  let saved = structuredClone(initial);
  return { load: async () => structuredClone(saved), save: async value => { saved = structuredClone({ version: 1, ...value }); } };
}

async function serve(options, test) {
  const middleware = createGoogleCalendarMiddleware(options);
  const server = createServer((req, res) => void middleware(req, res, () => { res.writeHead(404); res.end(); }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(path, { method = 'GET', data, headers = {} } = {}) {
    const response = await fetch(`${base}/api/calendar/${path}`, {
      method,
      headers: { ...(data ? { 'Content-Type': 'application/json', 'X-Rasp-Request': 'calendar' } : {}), ...headers },
      body: data ? JSON.stringify(data) : undefined,
      redirect: 'manual',
    });
    const type = response.headers.get('content-type') || '';
    return { status: response.status, data: type.includes('json') ? await response.json() : await response.text(), headers: response.headers };
  }
  try { await test(request); }
  finally { await new Promise(resolve => server.close(resolve)); }
}

describe('Google Calendar bridge', () => {
  it('validates desktop OAuth credentials and never exposes secrets', () => {
    const config = validateGoogleConfig({ clientId, clientSecret });
    assert.equal(config.clientId, clientId);
    assert.equal(publicGoogleConfig(connected).connected, true);
    assert.equal(publicGoogleConfig(connected).clientSecret, undefined);
    assert.equal(publicGoogleConfig(connected).refreshToken, undefined);
    assert.throws(() => validateGoogleConfig({ clientId: 'web-client', clientSecret }));
    assert.throws(() => validateGoogleConfig({ clientId, clientSecret: 'bad secret' }));
  });

  it('stores Google credentials with owner-only permissions', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'rasp-calendar-test-'));
    try {
      const file = join(directory, 'private', 'google.json');
      const store = createGoogleConfigStore(file);
      await store.save(connected);
      assert.equal((await stat(file)).mode & 0o777, 0o600);
      assert.equal((await store.load()).refreshToken, connected.refreshToken);
      assert.equal(JSON.parse(await readFile(file, 'utf8')).account, connected.account);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('accepts credentials through a short-lived, code-protected LAN setup page', async () => {
    const store = memoryStore({ version: 1, clientId: '', clientSecret: '', refreshToken: '', account: '' });
    const pairing = createGoogleCalendarPairing({
      store,
      port: 0,
      interfaces: () => ({ eth0: [{ address: '192.168.68.72', family: 'IPv4', internal: false }] }),
      deviceName: () => 'raspberrypi',
    });
    try {
      const session = await pairing.start();
      assert.equal(session.code.length, 8);
      assert.ok(session.addresses.includes(`http://raspberrypi.local:${session.port}`));
      assert.ok(session.addresses.includes(`http://192.168.68.72:${session.port}`));
      const base = `http://127.0.0.1:${session.port}`;
      const page = await fetch(base);
      assert.equal(page.status, 200);
      assert.match(await page.text(), /Configurar Google Calendar/);

      const rejected = await fetch(`${base}/configure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ code: 'BADCODE0', clientId, clientSecret }),
      });
      assert.equal(rejected.status, 401);

      const accepted = await fetch(`${base}/configure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ code: session.code.toLowerCase(), clientId, clientSecret }),
      });
      assert.equal(accepted.status, 200);
      assert.equal((await store.load()).clientId, clientId);
      assert.equal((await store.load()).clientSecret, clientSecret);
      assert.equal((await accepted.text()).includes(clientSecret), false);
    } finally {
      await pairing.stop();
    }
  });

  it('creates a short-lived PKCE authorization URL for the read-only scope', async () => {
    const disconnected = { ...connected, refreshToken: '', account: '' };
    await serve({ store: memoryStore(disconnected), cache: memoryCache(), now: () => Date.parse('2026-09-07T12:00:00Z') }, async request => {
      const result = await request('auth/start', { method: 'POST', data: {} });
      assert.equal(result.status, 200);
      const url = new URL(result.data.authUrl);
      assert.equal(url.origin, 'https://accounts.google.com');
      assert.equal(url.searchParams.get('scope'), CALENDAR_SCOPE);
      assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
      assert.match(url.searchParams.get('redirect_uri'), /^http:\/\/127\.0\.0\.1:\d+\/api\/calendar\/oauth\/callback$/);
      assert.equal(result.data.authUrl.includes(clientSecret), false);
    });
  });

  it('returns OAuth denials to the app with a useful diagnostic', async () => {
    const disconnected = { ...connected, refreshToken: '', account: '' };
    await serve({ store: memoryStore(disconnected), cache: memoryCache() }, async request => {
      const authorization = await request('auth/start', { method: 'POST', data: {} });
      const state = new URL(authorization.data.authUrl).searchParams.get('state');
      const result = await request(`oauth/callback?error=admin_policy_enforced&state=${state}`);
      assert.equal(result.status, 302);
      const location = new URL(result.headers.get('location'), 'http://127.0.0.1');
      assert.equal(location.pathname, '/app');
      assert.equal(location.searchParams.get('calendar_error'), 'admin_policy_enforced');
      assert.match(location.searchParams.get('calendar_message'), /administrador/);
    });
  });

  it('identifies mismatched OAuth client credentials during token exchange', async () => {
    const disconnected = { ...connected, refreshToken: '', account: '' };
    const upstream = async () => Response.json({ error: 'invalid_client' }, { status: 401 });
    await serve({ store: memoryStore(disconnected), cache: memoryCache(), request: upstream }, async request => {
      const authorization = await request('auth/start', { method: 'POST', data: {} });
      const state = new URL(authorization.data.authUrl).searchParams.get('state');
      const result = await request(`oauth/callback?code=google-code&state=${state}`);
      assert.equal(result.status, 302);
      const location = new URL(result.headers.get('location'), 'http://127.0.0.1');
      assert.equal(location.searchParams.get('calendar_error'), 'invalid_client');
      assert.match(location.searchParams.get('calendar_message'), /ID y el secreto OAuth no coinciden/);
    });
  });

  it('normalizes meetings, ignores declined and all-day events, and identifies Meet safely', () => {
    const events = normalizeGoogleEvents([
      { id: 'one', summary: '<b>Diseño &amp; producto</b>', description: 'Una <i>revisión</i>', start: { dateTime: '2026-09-07T14:00:00Z' }, end: { dateTime: '2026-09-07T14:45:00Z' }, hangoutLink: 'https://meet.google.com/abc-defg-hij', attendees: [{ displayName: 'Sofía' }] },
      { id: 'declined', summary: 'No asistiré', start: { dateTime: '2026-09-07T16:00:00Z' }, end: { dateTime: '2026-09-07T16:30:00Z' }, attendees: [{ self: true, responseStatus: 'declined' }] },
      { id: 'all-day', summary: 'Día especial', start: { date: '2026-09-07' }, end: { date: '2026-09-08' } },
    ], '2026-09-07T05:00:00Z', '2026-09-08T05:00:00Z');
    assert.equal(events.length, 1);
    assert.equal(events[0].title, 'Diseño & producto');
    assert.equal(events[0].start, 540);
    assert.equal(events[0].hasMeet, true);
    assert.equal(events[0].meetUrl, 'https://meet.google.com/abc-defg-hij');
  });

  it('loads today from Google and falls back to the matching private cache', async () => {
    const cache = memoryCache();
    let offline = false;
    const calls = [];
    const upstream = async (url, options) => {
      calls.push({ url: String(url), options });
      if (offline) throw new Error('network down');
      if (String(url).includes('/token')) return Response.json({ access_token: 'short-lived-access-token', expires_in: 3600 });
      if (String(url).includes('/events?')) return Response.json({ items: [{ id: 'event-1', summary: 'Planeación', start: { dateTime: '2026-09-07T15:00:00Z' }, end: { dateTime: '2026-09-07T15:30:00Z' }, conferenceData: { entryPoints: [{ entryPointType: 'video', uri: 'https://meet.google.com/aaa-bbbb-ccc' }] } }] });
      throw new Error(`Unexpected URL ${url}`);
    };
    const range = 'events?timeMin=2026-09-07T05%3A00%3A00.000Z&timeMax=2026-09-08T05%3A00%3A00.000Z';
    await serve({ store: memoryStore(), cache, request: upstream, now: () => Date.parse('2026-09-07T13:00:00Z') }, async request => {
      const fresh = await request(range);
      assert.equal(fresh.status, 200);
      assert.equal(fresh.data.source, 'google');
      assert.equal(fresh.data.events[0].title, 'Planeación');
      assert.ok(calls.find(call => call.url.includes('/events?')).options.headers.Authorization.startsWith('Bearer '));
      assert.equal(JSON.stringify(fresh).includes(connected.refreshToken), false);

      offline = true;
      const cached = await request(range);
      assert.equal(cached.status, 200);
      assert.equal(cached.data.source, 'cache');
      assert.equal(cached.data.events[0].id, 'event-1');
    });
  });

  it('rejects cross-origin management requests', async () => {
    await serve({ store: memoryStore(), cache: memoryCache() }, async request => {
      const result = await request('status', { headers: { Origin: 'https://unrelated.example' } });
      assert.equal(result.status, 403);
    });
  });
});
