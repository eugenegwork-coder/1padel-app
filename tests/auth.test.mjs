import assert from 'node:assert/strict';
import test from 'node:test';
import { createAuthClient, parseRegistrations, parseSessionFragment, parseProfile } from '../src/auth.ts';
// Контракт сервера LFPT-0637: AuthResponse (/api/auth/login|refresh), PlayerResponseDto (/api/auth/me).
const tokens = (name = 'one', expiresIn = 60000) => ({ accessToken: `access-${name}`, refreshToken: `refresh-${name}`, expiresIn, email: 'player@example.test', nombreCompleto: 'Test Player', playerId: 4 });
const player = { id: 4, email: 'player@example.test', nombre: 'Test', apellido: 'Player', nombreCompleto: 'Test Player', emailConfirmado: true, activo: true };
const profile = { id: 4, email: 'player@example.test', name: 'Test Player' };
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const plain = (value, status) => new Response(value, { status, headers: { 'Content-Type': 'text/plain;charset=UTF-8' } });
// fetch с redirect: 'manual' отдаёт редирект как opaqueredirect со статусом 0 — так сервер отвечает анонимному /api/**.
const loginRedirect = () => { const response = new Response(null, { status: 200 }); Object.defineProperty(response, 'type', { value: 'opaqueredirect' }); Object.defineProperty(response, 'status', { value: 0 }); return response; };
function storage() { let saved = null; return { get: async () => saved, set: async value => { saved = value; } }; }
const tournament = (id, extra = {}) => ({
  id, clubId: 1, clubNombre: 'Black Padel', clubDireccion: 'Luis Viale 3056, CABA', nombre: 'Masculino · C9', fechaInicio: '2026-10-21', horaInicio: '15:00:00',
  duracion: '3 horas', generoFormato: 'MASCULINO', categoriaNivel: 'C9_C8', tipo: 'PADEL_CLINIC', modalidad: 'INDIVIDUAL', cupoMax: 12, precio: 43000.00, moneda: 'ARS',
  estado: 'REGISTRO_ABIERTO', deadlineCancelacion: '2026-10-20T15:00:00', infoDetallada: null, mostrarNivel: true, inscritosActuales: 10, disponibles: 2, waitlistCount: 0, ...extra,
});

test('email uses HTTPS, omits website cookies, stores only refresh token and fetches own profile', async () => {
  const store = storage(); const calls = [];
  const client = createAuthClient({ store, fetchImpl: async (url, init) => { calls.push({ url, init }); return json(url.endsWith('/login') ? tokens() : player); } });
  assert.deepEqual(await client.login(' player@example.test ', 'test-only-password'), profile);
  assert.equal(calls[0].url, 'https://1-padel.com/api/auth/login');
  assert.deepEqual(JSON.parse(calls[0].init.body), { email: profile.email, password: 'test-only-password' });
  assert.equal(calls[0].init.credentials, 'omit'); assert.equal(calls[0].init.redirect, 'manual');
  assert.equal(calls[1].url, 'https://1-padel.com/api/auth/me');
  assert.equal(calls[1].init.headers.Authorization, 'Bearer access-one');
  assert.equal(await store.get(), 'refresh-one');
  assert.throws(() => createAuthClient({ store, baseUrl: 'http://192.168.0.1:8081' }), { code: 'INSECURE' });
});

test('wrong password (400 text) preserves no session and does not query personal data', async () => {
  const store = storage(); let count = 0;
  const client = createAuthClient({ store, fetchImpl: async () => { count++; return plain('Email o contraseña incorrectos', 400); } });
  await assert.rejects(client.login(profile.email, 'wrong-test-password'), { code: 'INVALID_CREDENTIALS' });
  assert.equal(await store.get(), null); assert.equal(count, 1);
  const unconfirmed = createAuthClient({ store, fetchImpl: async () => plain('Por favor, confirma tu email primero', 400) });
  await assert.rejects(unconfirmed.login(profile.email, 'test-password'), { code: 'ACCOUNT_UNAVAILABLE' });
});

test('organizer account is not a player: no personal calendar, credentials cleared', async () => {
  const store = storage();
  const client = createAuthClient({ store, fetchImpl: async url => json(url.endsWith('/login') ? tokens() : { id: 4, email: 'owner@example.test', firstName: 'O', isSuperAdmin: true }) });
  await assert.rejects(client.login('owner@example.test', 'test-password'), { code: 'PLAYER_REQUIRED' });
  assert.equal(await store.get(), null);
  assert.throws(() => parseProfile({ id: 1, email: 'x@example.test', firstName: 'X' }), { code: 'PLAYER_REQUIRED' });
});

test('concurrent private requests refresh once and retry with the new access token', async () => {
  const store = storage(); let refreshes = 0;
  const client = createAuthClient({ store, fetchImpl: async (url, init) => {
    if (url.endsWith('/login')) return json(tokens());
    if (url.endsWith('/refresh')) { refreshes++; await new Promise(resolve => setTimeout(resolve, 10)); return json(tokens('two')); }
    if (url.endsWith('/tournaments')) return init.headers.Authorization === 'Bearer access-one' ? loginRedirect() : json({ upcoming: [], historical: [] });
    return json(player);
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

test('revoked refresh (400) clears saved credentials and notifies the app', async () => {
  const store = storage(); await store.set('expired-test-token'); let expired = 0;
  const client = createAuthClient({ store, onExpired: () => expired++, fetchImpl: async () => plain('Token de refresco expirado o inválido', 400) });
  await assert.rejects(client.restore(), { code: 'SESSION_EXPIRED' });
  assert.equal(await store.get(), null); assert.equal(expired, 1);
});

test('temporary restore failure preserves refresh for retry and is not an empty personal calendar', async () => {
  const store = storage(); await store.set('existing-test-token');
  const client = createAuthClient({ store, fetchImpl: async () => { throw new TypeError('offline'); } });
  await assert.rejects(client.restore(), { code: 'NETWORK' });
  assert.equal(await store.get(), 'existing-test-token');
  assert.throws(() => parseRegistrations({ error: true }), { code: 'UNAVAILABLE' });
  assert.throws(() => parseRegistrations({ upcoming: [{ tournament: {}, registrationStatus: 'CONFIRMED' }], historical: [] }), { code: 'UNAVAILABLE' });
});

test('my tournaments: upcoming keeps status and waitlist, history has no status, event matches public schedule shape', () => {
  const rows = parseRegistrations({
    upcoming: [{ tournament: tournament(131), registrationStatus: 'WAITLIST', waitlistPosition: 3, registrationDate: '2026-10-10T12:00:00' }],
    historical: [tournament(90, { estado: 'FINALIZADO', fechaInicio: '2026-09-01', horaInicio: null, deadlineCancelacion: null, mostrarNivel: false })],
  });
  assert.equal(rows.length, 2);
  assert.deepEqual([rows[0].status, rows[0].waitlistPosition, rows[0].active], ['WAITLIST', 3, true]);
  assert.equal(rows[0].event.startsAt, '2026-10-21T15:00:00-03:00');
  assert.equal(rows[0].event.cancellationDeadline, '2026-10-20T15:00:00-03:00');
  assert.equal(rows[0].event.websiteUrl, 'https://1-padel.com/torneo/131');
  assert.deepEqual([rows[0].event.capacityUnit, rows[0].event.registrationOpen, rows[0].event.available], ['PLAYERS', true, 2]);
  assert.deepEqual([rows[1].status, rows[1].event.status, rows[1].event.level, rows[1].event.startsAt], [null, 'FINALIZADO', null, '2026-09-01T00:00:00-03:00']);
});

test('Google: fixed server URL, tokens from fragment become a session', async () => {
  const store = storage(); const calls = [];
  const client = createAuthClient({ store, fetchImpl: async (url, init) => { calls.push({ url, init }); return json(player); } });
  assert.equal(client.googleUrl(), 'https://1-padel.com/oauth2/authorization/google?client=app');
  const session = parseSessionFragment('#accessToken=a.b.c&refreshToken=r.s.t&expiresIn=86400000');
  assert.deepEqual(await client.adopt(session), profile);
  assert.equal(calls[0].init.headers.Authorization, 'Bearer a.b.c');
  assert.equal(await store.get(), 'r.s.t');
  assert.equal(parseSessionFragment(''), null);
  assert.equal(parseSessionFragment('#section'), null);
  assert.throws(() => parseSessionFragment('#accessToken=a&expiresIn=1'), { code: 'UNAVAILABLE' });
});
