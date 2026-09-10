import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
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
  it('opens Meet and passes its end time to the fixed Focus shortcut', async () => {
    const token = 'm'.repeat(64);
    const deadline = Date.now() + 60_000;
    let focusInput = '';
    const handler = createCompanionHandler({ token, run: async (file, args) => {
      if (file === '/usr/bin/open') return { stdout: '' };
      if (args[0] === 'list') return { stdout: 'Rasp Focus\n' };
      assert.deepEqual(args.slice(0, 3), ['run', 'Rasp Focus', '--input-path']);
      focusInput = await readFile(args[3], 'utf8');
      return { stdout: '' };
    } });
    const server = createServer((req, res) => void handler(req, res));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/open-meet`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://meet.google.com/abc-defg-hij', deadline, requestId: 'meeting-mode-1234567890123456' }),
      });
      const result = await response.json();
      assert.equal(response.status, 200);
      assert.equal(result.focusActivated, true);
      assert.equal(focusInput, new Date(deadline).toISOString());
    } finally { await new Promise(resolve => server.close(resolve)); }
  });
  it('opens Meet with the configured work account', async () => {
    const token = 'a'.repeat(64);
    let openedUrl = '';
    const handler = createCompanionHandler({ token, meetAccount: 'daniel@melonn.com', run: async (file, args) => {
      assert.equal(file, '/usr/bin/open');
      openedUrl = args[0];
      return { stdout: '' };
    } });
    const server = createServer((req, res) => void handler(req, res));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/open-meet`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://meet.google.com/abc-defg-hij', requestId: 'work-meeting-12345678901234' }),
      });
      assert.equal(response.status, 200);
      const target = new URL(openedUrl);
      assert.equal(target.hostname, 'meet.google.com');
      assert.equal(target.searchParams.get('authuser'), 'daniel@melonn.com');
    } finally { await new Promise(resolve => server.close(resolve)); }
  });
  it('turns Focus off and does not deduplicate list refreshes without an id', async () => {
    const token = 'o'.repeat(64);
    let offRuns = 0;
    let listRuns = 0;
    const handler = createCompanionHandler({ token, remindersHelper: '/tmp/reminders-bridge', run: async (file, args) => {
      if (file === '/usr/bin/shortcuts' && args[0] === 'list') return { stdout: 'Rasp Focus\nRasp Focus Off\n' };
      if (file === '/usr/bin/shortcuts') { offRuns++; return { stdout: '' }; }
      if (file === '/tmp/reminders-bridge') { listRuns++; return { stdout: JSON.stringify([{ id: 'list-id', name: 'Trabajo' }]) }; }
      throw new Error('unexpected command');
    } });
    const server = createServer((req, res) => void handler(req, res));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
      const stop = await fetch(`${base}/focus-off`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId: 'stop-focus-123456789012345' }) });
      assert.equal(stop.status, 200);
      assert.equal(offRuns, 1);
      for (let index = 0; index < 2; index++) {
        const lists = await fetch(`${base}/reminders/lists`, { headers: { Authorization: `Bearer ${token}` } });
        assert.equal(lists.status, 200);
      }
      assert.equal(listRuns, 2);
    } finally { await new Promise(resolve => server.close(resolve)); }
  });
});
