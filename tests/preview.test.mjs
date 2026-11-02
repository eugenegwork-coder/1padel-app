import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createPreviewHandler } from '../scripts/preview-server.mjs';

async function request(handler, url, method = 'GET') {
  const res = { status: 200, headers: {}, body: undefined, setHeader(k, v) { this.headers[k] = v; }, writeHead(s, headers) { this.status = s; Object.assign(this.headers, headers); }, end(body) { this.body = body; } };
  await handler({ method, url, headers: { authorization: 'Bearer do-not-forward', cookie: 'session=do-not-forward' } }, res);
  return res;
}
test('preview only proxies public reads, strips credentials/query and never writes', async () => {
  const calls = [];
  const handler = createPreviewHandler({ root: '/unused', apiBaseUrl: 'https://example.test', fetchImpl: async (...args) => { calls.push(args); return Response.json([]); } });
  assert.equal((await request(handler, '/api/public/tournaments?token=private')).status, 200);
  assert.equal(calls[0][0], 'https://example.test/api/public/tournaments');
  assert.deepEqual(calls[0][1].headers, { Accept: 'application/json' });
  assert.equal(calls[0][1].redirect, 'manual');
  assert.equal((await request(handler, '/api/auth/login', 'POST')).status, 405);
  assert.equal((await request(handler, '/players/tournaments/1/register', 'POST')).status, 405);
  assert.equal((await request(handler, '/api/auth/me')).status, 404);
  assert.equal((await request(handler, '/api/public/tournaments/1/delete')).status, 404);
  assert.equal(calls.length, 1);
});
test('preview reports upstream errors instead of inventing events', async () => {
  for (const fetchImpl of [async () => { throw new Error('offline'); }, async () => new Response('login', { status: 302 })]) {
    const handler = createPreviewHandler({ root: '/unused', apiBaseUrl: 'https://example.test', fetchImpl });
    const response = await request(handler, '/api/public/tournaments');
    assert.equal(response.status, 503); assert.equal(JSON.parse(response.body).code, 'SCHEDULE_UNAVAILABLE');
  }
});
test('preview serves root/subpath assets and rejects encoded traversal', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'padel-preview-'));
  try {
    await writeFile(path.join(root, 'index.html'), 'app');
    for (const webBasePath of ['', '/app']) {
      const handler = createPreviewHandler({ root, apiBaseUrl: 'https://example.test', webBasePath });
      assert.equal((await request(handler, webBasePath + '/?event=12')).body.toString(), 'app');
      assert.equal((await request(handler, webBasePath + '/%2e%2e%2fsecret')).status, 400);
      assert.equal((await request(handler, webBasePath + '/missing.js')).status, 404);
      assert.equal((await request(handler, webBasePath + '/', 'HEAD')).body, undefined);
    }
  } finally { await rm(root, { recursive: true }); }
});
