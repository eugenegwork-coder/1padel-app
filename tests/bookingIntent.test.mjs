import assert from 'node:assert/strict';
import test from 'node:test';
import { saveBookingIntent, readBookingIntent } from '../src/bookingIntent.ts';
test('Google return keeps the event ID and screen kind, survives repeated initialization and clears on cancel/completion', () => {
  const values = new Map();
  globalThis.window = { sessionStorage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) } };
  try {
    saveBookingIntent(42); assert.deepEqual(readBookingIntent(), { id: 42, kind: 'individual' }); assert.deepEqual(readBookingIntent(), { id: 42, kind: 'individual' });
    assert.deepEqual(Object.keys(JSON.parse([...values.values()][0])).sort(), ['at', 'id', 'kind']);
    saveBookingIntent(43, 'pair'); assert.deepEqual(readBookingIntent(), { id: 43, kind: 'pair' });
    values.set('onepadel.pendingIndividual.v1', JSON.stringify({ id: 42, at: Date.now() - 31 * 60000 })); assert.equal(readBookingIntent(), null);
    saveBookingIntent(null); assert.equal(readBookingIntent(), null);
  } finally { delete globalThis.window; }
});
test('blocked or damaged storage does not break login and never triggers a registration', () => {
  globalThis.window = { get sessionStorage() { throw new Error('blocked'); } };
  try { assert.doesNotThrow(() => saveBookingIntent(42)); assert.equal(readBookingIntent(), null); } finally { delete globalThis.window; }
});
