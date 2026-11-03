import assert from 'node:assert/strict';
import test from 'node:test';
import { availabilityStatus } from '../src/availabilityStatus.ts';
import { messages } from '../src/copy.ts';
import { bookingCopy } from '../src/bookingCopy.ts';

const player = { status: 'REGISTRO_ABIERTO', registrationOpen: true, available: 5, occupied: 14, capacityUnit: 'PLAYERS' };

test('status follows the site thresholds for players and pairs only while registration is open', () => {
  assert.equal(availabilityStatus(player), 'available');
  assert.equal(availabilityStatus({ ...player, occupied: 15 }), 'limited');
  assert.equal(availabilityStatus({ ...player, capacityUnit: 'PAIRS', occupied: 9 }), 'available');
  assert.equal(availabilityStatus({ ...player, capacityUnit: 'PAIRS', occupied: 10 }), 'limited');
  assert.equal(availabilityStatus({ ...player, available: 0 }), 'reserve');
  assert.equal(availabilityStatus({ ...player, available: 0, registrationOpen: false }), 'closed');
  assert.equal(availabilityStatus({ ...player, status: 'PUBLICADO', registrationOpen: false }), 'published');
});

test('status and reserve action copy are distinct in all three languages', () => {
  for (const language of ['ru', 'es', 'en']) {
    const t = messages[language];
    assert.ok(t.spotsAvailable && t.lastSpots && t.waitlistShort);
    assert.notEqual(t.spotsAvailable, t.lastSpots);
    assert.notEqual(t.waitlistShort, t.waitlist);
    assert.equal(t.waitlist, bookingCopy[language].waitInline);
  }
  assert.equal(messages.ru.spotsAvailable, 'Есть места');
  assert.equal(messages.ru.lastSpots, 'Последние места');
  assert.equal(messages.ru.waitlistShort, 'Резерв');
  assert.equal(bookingCopy.ru.waitInline, 'Записаться в резерв');
});
