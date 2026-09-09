import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createCompanionHandler } from './macCompanion.mjs';

describe('Mac companion', () => {
  it('requires the shared token and opens one validated Meet URL once', async () => {
    const token = 's'.repeat(64);
    let opened = 0;
    const handler = createCompanionHandler({ token, run: async (file, args) => {
      assert.equal(file, '/usr/bin/open');
      assert.deepEqual(args, ['https://meet.google.com/abc-defg-hij']);
      opened++;
      return { stdout: '' };
    } });
    const server = createServer((req, res) => void handler(req, res));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${server.address().port}/open-meet`;
    const body = JSON.stringify({ url: 'https://meet.google.com/abc-defg-hij', requestId: '12345678-1234-1234-1234-123456789012' });
    try {
      assert.equal((await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })).status, 401);
      for (let index = 0; index < 2; index++) {
        const response = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body });
        assert.equal(response.status, 200);
      }
      assert.equal(opened, 1);
    } finally { await new Promise(resolve => server.close(resolve)); }
  });
});
