import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { createScheduleClient, eventDate, parseTournament } from '../src/schedule.ts';
import { messages, organizerMessages } from '../src/copy.ts';

const fixtures = JSON.parse(fs.readFileSync(new URL('./fixtures/schedule.json', import.meta.url)));
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });

test('public schedule uses the API without cookies and keeps server capacity units', async () => {
  let request;
  const client = createScheduleClient({ baseUrl: 'https://1-padel.com/', fetchImpl: async (url, options) => {
    request = { url, options }; return json(fixtures.toReversed());
  } });
  const list = await client.list('es');
  assert.equal(request.url, 'https://1-padel.com/api/public/tournaments');
  assert.equal(request.options.credentials, 'omit');
  assert.equal(request.options.headers['Accept-Language'], 'es');
  assert.deepEqual(list.map(item => item.id), fixtures.map(item => item.id));
  assert.equal(list[2].capacityUnit, 'PAIRS');
  assert.equal(list[2].available, 5);
});

test('HTML login page, malformed JSON, and a missing API never become sample events', async () => {
  for (const response of [new Response('<html>Login</html>', { headers: { 'Content-Type': 'text/html' } }),
    new Response('{bad', { headers: { 'Content-Type': 'application/json' } }), json({ code: 'NOT_FOUND' }, 404)]) {
    const client = createScheduleClient({ fetchImpl: async () => response });
    await assert.rejects(client.list('ru'), { kind: 'unavailable' });
  }
});

test('detail 404 is distinct from an empty schedule and server failure', async () => {
  assert.deepEqual(await createScheduleClient({ fetchImpl: async () => json([]) }).list('ru'), []);
  await assert.rejects(createScheduleClient({ fetchImpl: async () => json({}, 404) }).details(42, 'ru'), { kind: 'not_found' });
  await assert.rejects(createScheduleClient({ fetchImpl: async () => json({}, 503) }).list('ru'), { kind: 'unavailable' });
});

test('invalid contract cannot display misleading dates, links, or pair counts', () => {
  for (const override of [{ startsAt: '2026-10-24T15:00:00' }, { websiteUrl: 'javascript:alert(1)' },
    { capacityUnit: 'PLAYERS' }, { price: '80000' }, { timeZone: 'Not/AZone' }]) {
    assert.throws(() => parseTournament({ ...fixtures[2], ...override }), { kind: 'unavailable' });
  }
});

test('Argentina time stays 15:00 when the phone is in another time zone', () => {
  const previous = process.env.TZ;
  try {
    for (const zone of ['UTC', 'America/New_York', 'Asia/Tokyo']) {
      process.env.TZ = zone;
      assert.match(eventDate(fixtures[0].startsAt, fixtures[0].timeZone, 'ru'), /15:00/);
      assert.match(eventDate(fixtures[0].startsAt, fixtures[0].timeZone, 'es'), /15:00/);
    }
  } finally { if (previous) process.env.TZ = previous; else delete process.env.TZ; }
});

test('legacy event links open the current site while other environments keep their URLs', () => {
  const event = fixtures[0];
  for (const origin of ['https://epadel.org', 'http://epadel.org', 'https://www.epadel.org']) {
    const result = parseTournament({ ...event, websiteUrl: `${origin}/torneo/${event.id}` });
    assert.equal(result.websiteUrl, `https://1-padel.com/torneo/${event.id}`);
  }
  for (const url of [`https://1-padel.com/torneo/${event.id}`, `http://localhost:8080/torneo/${event.id}`,
    `https://epadel.org/torneo/${event.id + 1}`, `https://epadel.org.example.com/torneo/${event.id}`]) {
    assert.equal(parseTournament({ ...event, websiteUrl: url }).websiteUrl, url);
  }
});

test('a hung request times out and cancellation reaches fetch', async () => {
  const client = createScheduleClient({ timeoutMs: 10, fetchImpl: async (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  }) });
  await assert.rejects(client.list('en'), { kind: 'network' });
});

test('all three player interface dictionaries have the same keys', () => {
  const keys = Object.keys(messages.ru).sort();
  assert.deepEqual(Object.keys(messages.es).sort(), keys);
  assert.deepEqual(Object.keys(messages.en).sort(), keys);
  assert.deepEqual(Object.keys(organizerMessages.es).sort(), Object.keys(organizerMessages.ru).sort());
  assert.deepEqual(Object.keys(organizerMessages.en).sort(), Object.keys(organizerMessages.ru).sort());
});
