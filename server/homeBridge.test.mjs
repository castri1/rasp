import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHomeMiddleware, HOME_ENTITIES_TEMPLATE } from './homeBridge.mjs';

const config = { url: 'http://homeassistant.local:8123', token: 'private-test-token' };
const store = { load: async () => config };
async function serve(upstream, test) {
  const middleware = createHomeMiddleware({ store, request: upstream });
  const server = createServer((req, res) => void middleware(req, res, () => { res.writeHead(404); res.end(); }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function call(path, body) {
    const response = await fetch(`${base}/api/home/${path}`, { method: body ? 'POST' : 'GET', headers: body ? { 'Content-Type': 'application/json', 'X-Rasp-Request': 'home' } : {}, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, data: await response.json() };
  }
  try { await test(call); } finally { await new Promise(resolve => server.close(resolve)); }
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
      ]);
    }
    if (url.endsWith('/services/homeassistant/turn_off')) return Response.json([]);
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
      assert.ok(!JSON.stringify(result.data).includes(config.token));
    });
  });
  it('only controls entities discovered for the selected room', async () => {
    const calls = [];
    await serve(upstream(calls), async call => {
      const result = await call('toggle', { roomId: 'sala', turnOn: false });
      assert.equal(result.status, 200);
      const action = calls.find(item => item.url.endsWith('/services/homeassistant/turn_off'));
      assert.deepEqual(JSON.parse(action.options.body), { entity_id: ['light.lampara_sala'] });
    });
  });
  it('does not pretend an empty room can be controlled', async () => {
    await serve(upstream([]), async call => {
      const result = await call('toggle', { roomId: 'cocina', turnOn: true });
      assert.equal(result.status, 409);
      assert.equal(result.data.code, 'empty_room');
    });
  });
});

