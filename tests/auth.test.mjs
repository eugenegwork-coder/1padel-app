import assert from 'node:assert/strict';
import test from 'node:test';
import { createAuthClient, parseRegistrations } from '../src/auth.ts';
const tokens = (name = 'one', expiresIn = 60000) => ({ accessToken: `access-${name}`, refreshToken: `refresh-${name}`, expiresIn });
const profile = { id: 4, email: 'player@example.test', name: 'Test Player' };
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
function storage() { let saved = null; return { get: async () => saved, set: async value => { saved = value; } }; }

test('email uses HTTPS, omits website cookies, stores only refresh token and fetches own profile', async () => {
  const store = storage(); const calls = [];
  const client = createAuthClient({ store, fetchImpl: async (url, init) => { calls.push({ url, init }); return json(url.endsWith('/login') ? tokens() : profile); } });
  assert.deepEqual(await client.login(' player@example.test ', 'test-only-password'), profile);
  assert.equal(calls[0].url, 'https://1-padel.com/api/mobile-auth/login');
  assert.deepEqual(JSON.parse(calls[0].init.body), { email: profile.email, password: 'test-only-password' });
  assert.equal(calls[0].init.credentials, 'omit'); assert.equal(calls[0].init.redirect, 'error');
  assert.equal(calls[1].init.headers.Authorization, 'Bearer access-one');
  assert.equal(await store.get(), 'refresh-one');
  assert.throws(() => createAuthClient({ store, baseUrl: 'http://192.168.0.1:8081' }), { code: 'INSECURE' });
});

test('wrong password preserves no session and does not query personal data', async () => {
  const store = storage(); let count = 0;
  const client = createAuthClient({ store, fetchImpl: async () => { count++; return json({ code: 'INVALID_CREDENTIALS' }, 401); } });
  await assert.rejects(client.login(profile.email, 'wrong-test-password'), { code: 'INVALID_CREDENTIALS' });
  assert.equal(await store.get(), null); assert.equal(count, 1);
});

test('concurrent private requests refresh once and retry with the new access token', async () => {
  const store = storage(); let refreshes = 0;
  const client = createAuthClient({ store, fetchImpl: async (url, init) => {
    if (url.endsWith('/login')) return json(tokens());
    if (url.endsWith('/refresh')) { refreshes++; await new Promise(resolve => setTimeout(resolve, 10)); return json(tokens('two')); }
    if (url.endsWith('/tournaments')) return init.headers.Authorization === 'Bearer access-one' ? json({}, 401) : json([]);
    return json(profile);
  } });
  await client.login(profile.email, 'test-password');
  assert.deepEqual(await Promise.all([client.registrations(), client.registrations()]), [[], []]);
  assert.equal(refreshes, 1); assert.equal(await store.get(), 'refresh-two');
});

test('logout wins over an in-flight login and clears persistent credentials', async () => {
  const store = storage(); let reply;
  const client = createAuthClient({ store, fetchImpl: () => new Promise(resolve => { reply = resolve; }) });
  const pending = client.login(profile.email, 'test-password');
  await client.logout(); reply(json(tokens()));
  await assert.rejects(pending, { code: 'CANCELLED' });
  assert.equal(await store.get(), null);
});

test('revoked refresh clears saved credentials and notifies the app', async () => {
  const store = storage(); await store.set('expired-test-token'); let expired = 0;
  const client = createAuthClient({ store, onExpired: () => expired++, fetchImpl: async () => json({ code: 'SESSION_EXPIRED' }, 401) });
  await assert.rejects(client.restore(), { code: 'SESSION_EXPIRED' });
  assert.equal(await store.get(), null); assert.equal(expired, 1);
});

test('temporary restore failure preserves refresh for retry and is not an empty personal calendar', async () => {
  const store = storage(); await store.set('existing-test-token');
  const client = createAuthClient({ store, fetchImpl: async () => { throw new TypeError('offline'); } });
  await assert.rejects(client.restore(), { code: 'NETWORK' });
  assert.equal(await store.get(), 'existing-test-token');
  assert.throws(() => parseRegistrations({ error: true }), { code: 'UNAVAILABLE' });
  assert.throws(() => parseRegistrations([{ registrationId: 1, status: 'CONFIRMED', active: true, waitlistPosition: null, event: {} }]), { code: 'UNAVAILABLE' });
});

test('Google accepts only the fixed server path, pending response does not create a session', async () => {
  const store = storage(); const requestId = 'r'.repeat(43); let unsafe = false;
  const client = createAuthClient({ store, fetchImpl: async url => json(url.endsWith('/start') ? { requestId, verificationPath: unsafe ? 'https://other.test/' : `/mobile-auth/google?request=${requestId}`, expiresIn: 300 } : { status: 'pending' }, url.endsWith('/start') ? 200 : 202) });
  assert.equal((await client.startGoogle('c'.repeat(43))).browserUrl, `https://1-padel.com/mobile-auth/google?request=${requestId}`);
  assert.equal(await client.exchangeGoogle(requestId, 'v'.repeat(43)), null);
  assert.equal(await store.get(), null);
  unsafe = true; await assert.rejects(client.startGoogle('c'.repeat(43)), { code: 'UNAVAILABLE' });
});

test('cancelled Google exchange cannot restore a session after the user leaves', async () => {
  const store = storage(); let reply;
  const client = createAuthClient({ store, fetchImpl: () => new Promise(resolve => { reply = resolve; }) });
  const pending = client.exchangeGoogle('r'.repeat(43), 'v'.repeat(43));
  client.cancelPending(); reply(json(tokens()));
  await assert.rejects(pending, { code: 'CANCELLED' }); assert.equal(await store.get(), null);
});
