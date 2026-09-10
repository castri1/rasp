import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { allowedRequest, validFocusRequest, validFocusStopRequest, validMeetRequest, validMeetingDeadline, validMeetUrl, createMacMiddleware, SHORTCUT_NAME, STOP_SHORTCUT_NAME } from './macBridge.mjs';

describe('Mac focus bridge', () => {
  it('rejects remote hosts and cross-origin or cross-site requests', () => {
    assert.equal(allowedRequest({ headers: { host: '127.0.0.1:5173', origin: 'http://127.0.0.1:5173', 'sec-fetch-site': 'same-origin' } }), true);
    for (const headers of [{ host: 'attacker.example' }, { host: 'localhost:5173', origin: 'https://attacker.example' }, { host: 'localhost:5173', origin: 'http://localhost:9999' }, { host: 'localhost:5173', 'sec-fetch-site': 'cross-site' }]) assert.equal(allowedRequest({ headers }), false);
  });
  it('only accepts a bounded future end time and an idempotency identifier', () => {
    const now = 1800000000000;
    const request = { deadline: now + 60000, requestId: '12345678-1234-1234-1234-123456789012' };
    assert.equal(validFocusRequest(request, now), true);
    for (const deadline of [now, now - 1, now + 120 * 60000 + 1, Infinity, 'tomorrow']) assert.equal(validFocusRequest({ ...request, deadline }, now), false);
    assert.equal(validFocusRequest({ ...request, requestId: '$(whoami)' }, now), false);
    assert.equal(validFocusStopRequest({ requestId: request.requestId }), true);
    assert.equal(validFocusStopRequest({ requestId: 'short' }), false);
  });
  it('runs the fixed off shortcut once for duplicate requests', async () => {
    if (process.platform !== 'darwin') return;
    let executions = 0;
    const middleware = createMacMiddleware(async (file, args) => {
      assert.equal(file, '/usr/bin/shortcuts');
      if (args[0] === 'list') return { stdout: `${SHORTCUT_NAME}\n${STOP_SHORTCUT_NAME}\n` };
      assert.deepEqual(args, ['run', STOP_SHORTCUT_NAME]);
      executions++;
      return { stdout: '' };
    });
    const server = createServer((req, res) => void middleware(req, res, () => { res.writeHead(404); res.end(); }));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const url = `http://127.0.0.1:${server.address().port}/api/mac/focus-off`;
      const body = JSON.stringify({ requestId: 'focus-stop-1234567890123456' });
      for (let index = 0; index < 2; index++) {
        const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Rasp-Request': 'focus-off' }, body });
        assert.equal(response.status, 200);
      }
      assert.equal(executions, 1);
    } finally { await new Promise(resolve => server.close(resolve)); }
  });
  it('only accepts authenticated action data for meet.google.com', () => {
    const now = 1800000000000;
    assert.equal(validMeetUrl('https://meet.google.com/abc-defg-hij'), true);
    assert.equal(validMeetRequest({ url: 'https://meet.google.com/abc-defg-hij?authuser=1', requestId: '12345678-1234-1234-1234-123456789012' }), true);
    assert.equal(validMeetingDeadline(now + 60_000, now), true);
    assert.equal(validMeetingDeadline(now + 12 * 60 * 60_000 + 1, now), false);
    for (const url of ['http://meet.google.com/abc-defg-hij', 'https://evil.example/abc', 'https://meet.google.com.evil.example/abc', 'file:///etc/passwd']) assert.equal(validMeetUrl(url), false);
  });
  it('passes the exact expiry to the fixed shortcut once, with no real Focus change', async () => {
    if (process.platform !== 'darwin') return;
    let executions = 0;
    let sentDate;
    const middleware = createMacMiddleware(async (file, args) => {
      assert.equal(file, '/usr/bin/shortcuts');
      if (args[0] === 'list') return { stdout: `${SHORTCUT_NAME}\n` };
      assert.deepEqual(args.slice(0, 3), ['run', SHORTCUT_NAME, '--input-path']);
      sentDate = await readFile(args[3], 'utf8');
      executions++;
      return { stdout: '' };
    });
    const server = createServer((req, res) => void middleware(req, res, () => { res.writeHead(404); res.end(); }));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const url = `http://127.0.0.1:${server.address().port}/api/mac/focus`;
      const body = { deadline: Date.now() + 60000, requestId: '12345678-1234-1234-1234-123456789012' };
      for (let i = 0; i < 2; i++) {
        const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Rasp-Request': 'focus' }, body: JSON.stringify(body) });
        assert.equal(response.status, 200);
      }
      assert.equal(executions, 1);
      assert.equal(sentDate, new Date(body.deadline).toISOString());
    } finally { await new Promise(resolve => server.close(resolve)); }
  });
  it('reports a missing shortcut without attempting to run one', async () => {
    const middleware = createMacMiddleware(async (_file, args) => { assert.equal(args[0], 'list'); return { stdout: 'Other Shortcut\n' }; });
    const server = createServer((req, res) => void middleware(req, res, () => { res.writeHead(404); res.end(); }));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const base = `http://127.0.0.1:${server.address().port}`;
      const status = await (await fetch(`${base}/api/mac/status`)).json();
      assert.equal(status.ready, true);
      assert.equal(status.focusReady, false);
      const response = await fetch(`${base}/api/mac/focus`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Rasp-Request': 'focus' }, body: JSON.stringify({ deadline: Date.now() + 60000, requestId: '12345678-1234-1234-1234-123456789012' }) });
      assert.equal(response.status, 409);
    } finally { await new Promise(resolve => server.close(resolve)); }
  });
  it('forwards a valid Meet link from Linux to the configured companion', async () => {
    let forwarded;
    const middleware = createMacMiddleware({
      platform: 'linux',
      store: { load: async () => ({ url: 'http://127.0.0.1:4175', token: 'x'.repeat(64) }) },
      request: async (url, options) => {
        forwarded = { url, options };
        return new Response(JSON.stringify({ message: 'Google Meet se abrió en tu Mac.' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      },
    });
    const server = createServer((req, res) => void middleware(req, res, () => { res.writeHead(404); res.end(); }));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/mac/open-meet`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Rasp-Request': 'open-meet' },
        body: JSON.stringify({ url: 'https://meet.google.com/abc-defg-hij', requestId: '12345678-1234-1234-1234-123456789012' }),
      });
      assert.equal(response.status, 200);
      assert.equal(forwarded.url, 'http://127.0.0.1:4175/open-meet');
      assert.equal(forwarded.options.headers.Authorization, `Bearer ${'x'.repeat(64)}`);
    } finally { await new Promise(resolve => server.close(resolve)); }
  });
});
