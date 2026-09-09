import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm, stat, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createAlexaMiddleware, createConfigStore, EMPTY_CONFIG, migrateConfig, normalizeUrl, publicConfig, validateConfig, DEVICES_TEMPLATE, ROUTINES_TEMPLATE } from './alexaBridge.mjs';
const deviceId = 'a'.repeat(32);
const token = 'test-token-with-no-real-permissions';
const configured = { ...structuredClone(EMPTY_CONFIG), url: 'http://homeassistant.local:8123', token, deviceId, scenes: EMPTY_CONFIG.scenes.map(scene => ({ ...scene, command: scene.id === 'focus' ? 'activa enfoque rasp' : scene.id === 'break' ? 'activa descanso rasp' : '' })) };
function memoryStore(config = EMPTY_CONFIG) {
  let saved = structuredClone(config);
  return { load: async () => structuredClone(saved), save: async value => { saved = structuredClone(value); } };
}
async function serve(options, test) {
  const middleware = createAlexaMiddleware(options);
  const server = createServer((req, res) => void middleware(req, res, () => { res.writeHead(404); res.end(); }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(path, data, headers = {}) {
    const response = await fetch(`${base}/api/alexa/${path}`, { method: data ? 'POST' : 'GET', headers: { ...(data ? { 'Content-Type': 'application/json', 'X-Rasp-Request': 'alexa' } : {}), ...headers }, body: data ? JSON.stringify(data) : undefined });
    return { status: response.status, data: await response.json() };
  }
  try { await test(request); } finally { await new Promise(resolve => server.close(resolve)); }
}
function upstream(log) {
  return async (url, options) => {
    log.push({ url, options });
    assert.equal(options.headers.Authorization, `Bearer ${token}`);
    assert.equal(options.redirect, 'error');
    if (url.endsWith('/services')) return Response.json([{ domain: 'alexa_devices', services: { send_text_command: {} } }]);
    if (url.endsWith('/template')) {
      const { template } = JSON.parse(options.body);
      if (template === DEVICES_TEMPLATE) return Response.json([{ id: deviceId, name: 'Echo de prueba' }]);
      assert.equal(template, ROUTINES_TEMPLATE);
      return Response.json([{ entityId: 'button.cuenta_relax', name: 'relax' }]);
    }
    if (url.endsWith('/services/alexa_devices/send_text_command')) return Response.json([]);
    if (url.endsWith('/services/button/press')) return Response.json([]);
    throw new Error('Unexpected endpoint');
  };
}

describe('Alexa through Home Assistant', () => {
  it('validates destinations and never reuses a token for a different server', () => {
    assert.equal(normalizeUrl('http://192.168.1.20:8123/'), 'http://192.168.1.20:8123');
    assert.equal(normalizeUrl('https://my-ha.example.com'), 'https://my-ha.example.com');
    for (const url of ['file:///etc/passwd', 'http://public.example.com', 'https://name:secret@example.com', 'https://example.com/?token=secret']) assert.throws(() => normalizeUrl(url));
    assert.throws(() => validateConfig({ ...configured, token: '', url: 'https://another.example.com' }, configured));
    assert.equal(validateConfig({ ...configured, token: '' }, configured).token, token);
    assert.equal(publicConfig(configured).token, undefined);
  });
  it('can save routine phrases before Home Assistant is installed, without claiming a connection', async () => {
    await serve({ store: memoryStore(), request: async () => { throw new Error('Must not contact a device'); } }, async request => {
      const saved = await request('config', { ...EMPTY_CONFIG, scenes: EMPTY_CONFIG.scenes.map(scene => ({ ...scene, command: scene.id === 'focus' ? 'activa mi enfoque' : '' })) });
      assert.equal(saved.status, 200);
      assert.equal(saved.data.config.configured, false);
      const loaded = await request('config');
      assert.equal(loaded.data.config.scenes.find(scene => scene.id === 'focus').command, 'activa mi enfoque');
      const checked = await request('check', {});
      assert.equal(checked.data.connection.state, 'not_configured');
    });
  });
  it('discovers Alexa devices, sends exactly the stored phrase once, and redacts credentials', async () => {
    const calls = [];
    await serve({ store: memoryStore(configured), request: upstream(calls) }, async request => {
      const config = await request('config');
      assert.ok(!JSON.stringify(config).includes(token));
      const check = await request('check', {});
      assert.equal(check.data.connection.state, 'ready');
      assert.deepEqual(check.data.connection.routines, [{ entityId: 'button.cuenta_relax', name: 'relax' }]);
      const input = { scene: 'focus', source: 'manual', requestId: 'request-1234567890', command: 'injected command' };
      assert.equal((await request('run', input)).status, 200);
      assert.equal((await request('run', input)).status, 200);
      const commands = calls.filter(call => call.url.endsWith('send_text_command'));
      assert.equal(commands.length, 1);
      assert.deepEqual(JSON.parse(commands[0].options.body), { device_id: deviceId, text_command: 'activa enfoque rasp' });
    });
  });
  it('presses a matching Alexa routine directly instead of sending its name as text', async () => {
    const calls = [];
    const routineConfig = { ...configured, scenes: configured.scenes.map(scene => scene.id === 'focus' ? { ...scene, command: '  RELÁX  ' } : scene) };
    await serve({ store: memoryStore(routineConfig), request: upstream(calls) }, async request => {
      const result = await request('run', { scene: 'focus', source: 'manual', requestId: 'request-1234567894' });
      assert.equal(result.status, 200);
      assert.equal(result.data.message, 'Rutina «relax» enviada a Alexa.');
      const presses = calls.filter(call => call.url.endsWith('/services/button/press'));
      assert.equal(presses.length, 1);
      assert.deepEqual(JSON.parse(presses[0].options.body), { entity_id: 'button.cuenta_relax' });
      assert.equal(calls.some(call => call.url.endsWith('send_text_command')), false);
    });
  });
  it('blocks cross-origin requests and disabled automatic actions without sending commands', async () => {
    const calls = [];
    await serve({ store: memoryStore(configured), request: upstream(calls) }, async request => {
      assert.equal((await request('check', {}, { Origin: 'https://unrelated.example' })).status, 403);
      assert.equal((await request('run', { scene: 'focus', source: 'automatic', requestId: 'request-1234567891' })).status, 409);
      assert.equal((await request('run', { scene: 'arbitrary', source: 'manual', requestId: 'request-1234567892' })).status, 409);
      assert.equal(calls.length, 0);
    });
  });
  it('does not send an action to an unknown device', async () => {
    const calls = [];
    await serve({ store: memoryStore({ ...configured, deviceId: 'b'.repeat(32) }), request: upstream(calls) }, async request => {
      const result = await request('run', { scene: 'focus', source: 'manual', requestId: 'request-1234567893' });
      assert.equal(result.status, 409);
      assert.equal(result.data.code, 'choose_device');
      assert.equal(calls.some(call => call.url.endsWith('send_text_command')), false);
    });
  });
  it('reports missing Alexa integration, authentication failures and timeouts honestly', async () => {
    for (const [handler, expected, status] of [
      [async () => Response.json([]), 'alexa_missing', 200],
      [async () => new Response('private detail', { status: 401 }), 'auth', 401],
      [async () => { throw new Error(token); }, 'offline', 502],
    ]) {
      await serve({ store: memoryStore(configured), request: handler }, async request => {
        const result = await request('check', {});
        assert.equal(result.status, status);
        assert.equal(result.data.connection?.state || result.data.code, expected);
        assert.ok(!JSON.stringify(result).includes(token));
      });
    }
  });
  it('stores the token on disk with owner-only permissions and can reload it', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'rasp-alexa-test-'));
    try {
      const file = join(directory, 'private', 'alexa.json');
      const store = createConfigStore(file);
      assert.equal((await store.load()).url, '');
      await store.save(configured);
      assert.equal((await stat(file)).mode & 0o777, 0o600);
      assert.equal((await createConfigStore(file).load()).token, token);
      assert.equal(JSON.parse(await readFile(file, 'utf8')).version, 2);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
  it('migrates the four original scenes without losing phrases or Pomodoro choices', () => {
    const migrated = validateConfig(migrateConfig({ version: 1, url: configured.url, token, deviceId, commands: { focus: 'apaga la zona social', break: '', meeting: 'reunión', evening: '' }, automatic: { focus: true, break: false } }));
    assert.equal(migrated.version, 2);
    assert.equal(migrated.scenes.find(scene => scene.id === 'focus').command, 'apaga la zona social');
    assert.equal(migrated.automatic.focusSceneId, 'focus');
    assert.equal(migrated.automatic.breakSceneId, '');
  });
  it('accepts custom scenes and rejects duplicate identifiers', () => {
    const custom = { ...configured, scenes: [...configured.scenes, { id: 'movie-night', name: 'Cine', description: 'Luz suave', icon: 'lamp', command: 'activa cine' }] };
    assert.equal(validateConfig(custom).scenes.at(-1).name, 'Cine');
    assert.throws(() => validateConfig({ ...custom, scenes: [...custom.scenes, { ...custom.scenes[0] }] }));
  });
});
