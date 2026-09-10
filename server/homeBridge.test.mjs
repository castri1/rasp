import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHomeMiddleware, EMPTY_HOME_CONFIG, HOME_ENTITIES_TEMPLATE, validateHomeConfig } from './homeBridge.mjs';

const deviceId = 'a'.repeat(32);
const config = { url: 'http://homeassistant.local:8123', token: 'private-test-token', deviceId };
const store = { load: async () => config };
async function serve(upstream, test, initialConfig = structuredClone(EMPTY_HOME_CONFIG)) {
  let savedConfig = initialConfig;
  const configStore = { load: async () => structuredClone(savedConfig), save: async value => { savedConfig = structuredClone(value); } };
  const middleware = createHomeMiddleware({ store, configStore, request: upstream });
  const server = createServer((req, res) => void middleware(req, res, () => { res.writeHead(404); res.end(); }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function call(path, body) {
    const response = await fetch(`${base}/api/home/${path}`, { method: body ? 'POST' : 'GET', headers: body ? { 'Content-Type': 'application/json', 'X-Rasp-Request': 'home' } : {}, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, data: await response.json() };
  }
  try { await test(call, () => savedConfig); } finally { await new Promise(resolve => server.close(resolve)); }
}
function upstream(calls) {
  return async (url, options) => {
    calls.push({ url, options });
    assert.equal(options.headers.Authorization, `Bearer ${config.token}`);
    if (url.endsWith('/template')) {
      assert.deepEqual(JSON.parse(options.body), { template: HOME_ENTITIES_TEMPLATE });
      return Response.json([
        { entityId: 'light.lampara_sala', name: 'Lámpara', area: 'Sala', domain: 'light', state: 'on', brightness: 128 },
        { entityId: 'switch.balcon', name: 'Guirnalda', area: 'Balcon', domain: 'switch', state: 'off', brightness: 0 },
        { entityId: 'light.sin_area_conocida', name: 'Otra', area: 'Garaje', domain: 'light', state: 'on', brightness: 255 },
        { entityId: 'switch.echo_dot_sala_do_not_disturb', name: 'Echo Dot Sala Do not disturb', area: '', domain: 'switch', state: 'on', brightness: 0 },
      ]);
    }
    if (url.endsWith('/services/homeassistant/turn_off')) return Response.json([]);
    if (url.endsWith('/services/alexa_devices/send_text_command')) return Response.json([]);
    throw new Error(`Unexpected endpoint ${url}`);
  };
}

describe('Home Assistant house bridge', () => {
  it('maps controllable entities to the fixed floor plan and reports real states', async () => {
    const calls = [];
    await serve(upstream(calls), async call => {
      const result = await call('state');
      assert.equal(result.status, 200);
      assert.equal(result.data.state, 'ready');
      assert.equal(result.data.rooms.find(room => room.id === 'sala').on, 1);
      assert.equal(result.data.rooms.find(room => room.id === 'balcon').devices[0].entityId, 'switch.balcon');
      assert.equal(result.data.rooms.find(room => room.id === 'cocina').devices.length, 0);
      assert.equal(result.data.unassignedDevices.length, 1);
      assert.ok(!JSON.stringify(result.data).includes('do_not_disturb'));
      assert.ok(!JSON.stringify(result.data).includes(config.token));
    });
  });
  it('only controls entities discovered for the selected room', async () => {
    const calls = [];
    await serve(upstream(calls), async call => {
      const result = await call('toggle', { roomId: 'sala', turnOn: false, requestId: 'home-room-toggle-001' });
      assert.equal(result.status, 200);
      const action = calls.find(item => item.url.endsWith('/services/homeassistant/turn_off'));
      assert.deepEqual(JSON.parse(action.options.body), { entity_id: ['light.lampara_sala'] });
    });
  });
  it('does not pretend an empty room can be controlled', async () => {
    await serve(upstream([]), async call => {
      const result = await call('toggle', { roomId: 'cocina', turnOn: true, requestId: 'home-room-toggle-002' });
      assert.equal(result.status, 409);
      assert.equal(result.data.code, 'missing_command');
    });
  });
  it('stores room names, manual assignments and private display names', async () => {
    const calls = [];
    await serve(upstream(calls), async (call, saved) => {
      const rooms = structuredClone(EMPTY_HOME_CONFIG.rooms);
      rooms.find(room => room.id === 'juan-rafael').name = 'Cuarto Juan Rafael';
      rooms.push({ id: 'custom-biblioteca', name: 'Biblioteca', slot: 'other', onCommand: '', offCommand: '', assumedOn: false, changedAt: '' });
      const result = await call('configuration', {
        rooms,
        devices: [
          { entityId: 'light.lampara_sala', name: 'Luz del sofá', roomId: 'sala' },
          { entityId: 'switch.balcon', name: 'Guirnalda balcón', roomId: 'balcon' },
          { entityId: 'light.sin_area_conocida', name: 'Luz de lectura', roomId: 'custom-biblioteca' },
        ],
      });
      assert.equal(result.status, 200);
      assert.equal(result.data.rooms.find(room => room.id === 'juan-rafael').name, 'Cuarto Juan Rafael');
      assert.equal(result.data.rooms.find(room => room.id === 'custom-biblioteca').devices[0].name, 'Luz de lectura');
      assert.equal(saved().deviceNames['light.lampara_sala'], 'Luz del sofá');
      assert.equal(saved().assignments['light.sin_area_conocida'], 'custom-biblioteca');
    });
  });
  it('rejects changing the fixed geometry or assigning a device to a missing room', async () => {
    await serve(upstream([]), async call => {
      const rooms = structuredClone(EMPTY_HOME_CONFIG.rooms);
      rooms[0].slot = 'sala';
      const invalidGeometry = await call('configuration', { rooms, devices: [] });
      assert.equal(invalidGeometry.status, 400);

      const invalidAssignment = await call('configuration', {
        rooms: EMPTY_HOME_CONFIG.rooms,
        devices: [{ entityId: 'light.lampara_sala', name: 'Lámpara', roomId: 'no-existe' }],
      });
      assert.equal(invalidAssignment.status, 400);
    });
  });
  it('controls one manually named device without affecting its room peers', async () => {
    const calls = [];
    await serve(upstream(calls), async call => {
      const result = await call('toggle', { entityId: 'light.lampara_sala', turnOn: false, requestId: 'home-device-toggle-01' });
      assert.equal(result.status, 200);
      const action = calls.find(item => item.url.endsWith('/services/homeassistant/turn_off'));
      assert.deepEqual(JSON.parse(action.options.body), { entity_id: ['light.lampara_sala'] });
    });
  });
  it('sends configurable room phrases once and remembers the last accepted order', async () => {
    const calls = [];
    const initial = structuredClone(EMPTY_HOME_CONFIG);
    Object.assign(initial.rooms.find(room => room.id === 'sala'), { onCommand: 'Alexa, prende la sala', offCommand: 'Alexa, apaga la sala' });
    await serve(upstream(calls), async (call, saved) => {
      const onInput = { roomId: 'sala', turnOn: true, requestId: 'home-alexa-toggle-001' };
      const first = await call('toggle', onInput);
      const duplicate = await call('toggle', onInput);
      assert.equal(first.status, 200);
      assert.equal(duplicate.status, 200);
      assert.equal(first.data.control, 'alexa');
      assert.equal(saved().rooms.find(room => room.id === 'sala').assumedOn, true);
      const off = await call('toggle', { roomId: 'sala', turnOn: false, requestId: 'home-alexa-toggle-002' });
      assert.equal(off.status, 200);
      assert.equal(saved().rooms.find(room => room.id === 'sala').assumedOn, false);
      const commands = calls.filter(item => item.url.endsWith('/services/alexa_devices/send_text_command'));
      assert.deepEqual(commands.map(item => JSON.parse(item.options.body)), [
        { device_id: deviceId, text_command: 'prende la sala' },
        { device_id: deviceId, text_command: 'apaga la sala' },
      ]);
      assert.equal(calls.some(item => item.url.endsWith('/services/homeassistant/turn_on')), false);
    }, initial);
  });
  it('requires command pairs and preserves the estimated state while phrases remain unchanged', () => {
    const previous = structuredClone(EMPTY_HOME_CONFIG);
    Object.assign(previous.rooms.find(room => room.id === 'sala'), { onCommand: 'prende sala', offCommand: 'apaga sala', assumedOn: true, changedAt: '2026-09-10T10:00:00.000Z' });
    const unchanged = validateHomeConfig({ rooms: previous.rooms, devices: [] }, previous);
    assert.equal(unchanged.rooms.find(room => room.id === 'sala').assumedOn, true);
    const incomplete = structuredClone(previous.rooms);
    incomplete.find(room => room.id === 'sala').offCommand = '';
    assert.throws(() => validateHomeConfig({ rooms: incomplete, devices: [] }, previous));
  });
});
