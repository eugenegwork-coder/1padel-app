import assert from 'node:assert/strict';
import test from 'node:test';
import { AuthError, PlayerRequestError } from '../src/auth.ts';
import { createIndividualBooking, bookingQuote, cancellationQuote, cancellationDeadline, isIndividualEvent } from '../src/individualBooking.ts';
import { bookingCopy } from '../src/bookingCopy.ts';

function fixture() {
  const state = { event: { id: 42, name: 'Training', type: 'PADEL_CLINIC', modality: 'INDIVIDUAL', gender: 'MASCULINO', level: 'C9_C8', status: 'REGISTRO_ABIERTO', registrationOpen: true, startsAt: new Date(Date.now() + 4 * 86400000).toISOString(), timeZone: 'America/Argentina/Buenos_Aires', club: { id: 1, name: 'Test club' }, price: 43000, currency: 'ARS', available: 1, cancellationDeadline: null }, rows: [], hasContact: true, writes: 0, saves: 0, cancels: 0, result: { success: true, status: 'CONFIRMED', waitlistPosition: null }, cancelResult: { success: true, message: 'cancelled' } };
  const transport = {
    details: async () => ({ ...state.event }), registrations: async () => [...state.rows], contactStatus: async () => ({ hasContact: state.hasContact }),
    saveContact: async () => { state.saves++; state.hasContact = true; return { success: true }; },
    registerIndividual: async () => { state.writes++; return state.result; },
    cancelIndividual: async () => { state.cancels++; state.rows = []; return state.cancelResult; },
  };
  return { state, transport, client: createIndividualBooking(transport), row: (status = 'CONFIRMED', waitlistPosition = status === 'WAITLIST' ? 3 : null) => ({ event: state.event, active: true, status, waitlistPosition }) };
}
test('all four individual families can join; doubles Americano and incompatible modalities are excluded', () => {
  for (const type of ['KING_OF_COURT', 'AMERICANO', 'PADEL_CLINIC', 'CANCHA_ABIERTA']) assert.equal(isIndividualEvent({ type, modality: 'INDIVIDUAL' }), true);
  for (const event of [{ type: 'AMERICANO_TEAMS', modality: 'DOBLES' }, { type: 'AMERICANO', modality: 'DOBLES' }, { type: 'CANCHA_ABIERTA', modality: 'DOBLES' }]) assert.equal(isIndividualEvent(event), false);
});
test('no mutation while loading/reviewing; explicit join returns only server confirmation', async () => {
  const f = fixture(); const snapshot = await f.client.load(42);
  assert.equal(f.state.writes, 0);
  assert.deepEqual(await f.client.join(42, bookingQuote(snapshot.event)), { status: 'CONFIRMED', waitlistPosition: null, existing: false });
  assert.equal(f.state.writes, 1);
});
test('a last place lost between confirmation and commit returns WAITLIST, not an invented success', async () => {
  const f = fixture(); f.state.result = { success: true, status: 'WAITLIST', waitlistPosition: 5 };
  const result = await f.client.join(42, bookingQuote(f.state.event));
  assert.equal(result.status, 'WAITLIST'); assert.equal(result.waitlistPosition, 5); assert.equal(f.state.writes, 1);
});
test('existing own registration suppresses duplicate POST and another event does not block this one', async () => {
  const f = fixture(); f.state.rows = [f.row('WAITLIST')];
  assert.deepEqual(await f.client.join(42, bookingQuote(f.state.event)), { status: 'WAITLIST', waitlistPosition: 3, existing: true });
  assert.equal(f.state.writes, 0);
  f.state.rows = [{ ...f.row(), event: { ...f.state.event, id: 99 } }];
  await f.client.join(42, bookingQuote(f.state.event)); assert.equal(f.state.writes, 1);
});
test('price, currency, cutoff, audience and transition into waitlist all require new review', async () => {
  for (const change of [{ price: 44000 }, { currency: 'USD' }, { cancellationDeadline: new Date(Date.now() + 86400000).toISOString() }, { description: 'Changed terms' }, { available: 0 }, { level: 'C7' }, { club: { id: 2, name: 'Other club' } }]) {
    const f = fixture(); const quote = bookingQuote(f.state.event); Object.assign(f.state.event, change);
    await assert.rejects(f.client.join(42, quote), { code: 'CHANGED' }); assert.equal(f.state.writes, 0);
  }
});
test('closed, published, started, doubles and missing contact never send individual POST', async () => {
  for (const [change, expected] of [[{ registrationOpen: false }, 'CLOSED'], [{ status: 'PUBLICADO' }, 'CLOSED'], [{ startsAt: new Date(Date.now() - 1000).toISOString() }, 'CLOSED'], [{ modality: 'DOBLES' }, 'NOT_INDIVIDUAL']]) {
    const f = fixture(); Object.assign(f.state.event, change);
    await assert.rejects(f.client.join(42, bookingQuote(f.state.event)), { code: expected }); assert.equal(f.state.writes, 0);
  }
  const f = fixture(); f.state.hasContact = false;
  await assert.rejects(f.client.join(42, bookingQuote(f.state.event)), { code: 'NEED_CONTACT' }); assert.equal(f.state.writes, 0);
});
test('malformed read contract blocks mutation; own data never treated as empty on failure', async () => {
  const f = fixture(); f.transport.registrations = async () => { throw new AuthError('NETWORK'); };
  const client = createIndividualBooking(f.transport);
  await assert.rejects(client.join(42, bookingQuote(f.state.event)), { code: 'NETWORK' }); assert.equal(f.state.writes, 0);
  f.transport.registrations = async () => []; f.transport.contactStatus = async () => ({});
  await assert.rejects(client.load(42), { code: 'UNAVAILABLE' });
});
test('duplicate tap is blocked while a request is in flight', async () => {
  const f = fixture(); let respond;
  f.transport.registerIndividual = () => { f.state.writes++; return new Promise(resolve => { respond = resolve; }); };
  const client = createIndividualBooking(f.transport); const first = client.join(42, bookingQuote(f.state.event));
  await assert.rejects(client.join(42, bookingQuote(f.state.event)), { code: 'BUSY' });
  await new Promise(resolve => setImmediate(resolve)); respond(f.state.result); await first;
  assert.equal(f.state.writes, 1);
});
test('logout or account switch during preflight cannot register the new account using an old screen', async () => {
  const f = fixture(); let version = 1; let reply;
  f.transport.sessionVersion = () => version;
  f.transport.details = () => new Promise(resolve => { reply = resolve; });
  const client = createIndividualBooking(f.transport);
  const pending = client.join(42, bookingQuote(f.state.event));
  version++; reply(f.state.event);
  await assert.rejects(pending, { code: 'CANCELLED' }); assert.equal(f.state.writes, 0);
  await assert.rejects(client.load(42), { code: 'CANCELLED' });
});
test('network loss after the server commits: reconcile finds the record, never repeats POST', async () => {
  const f = fixture();
  f.transport.registerIndividual = async () => { f.state.writes++; f.state.rows = [f.row()]; throw new AuthError('NETWORK'); };
  const client = createIndividualBooking(f.transport);
  await assert.rejects(client.join(42, bookingQuote(f.state.event)), { code: 'UNCERTAIN' });
  await assert.rejects(client.join(42, bookingQuote(f.state.event)), { code: 'UNCERTAIN' });
  const restored = await client.reconcile(42);
  assert.equal(restored.receipt.status, 'CONFIRMED'); assert.equal(restored.uncertain, false); assert.equal(f.state.writes, 1);
});
test('an absent record after timeout still does not permit an automatic resend', async () => {
  const f = fixture(); f.transport.registerIndividual = async () => { f.state.writes++; throw new AuthError('NETWORK'); };
  const client = createIndividualBooking(f.transport);
  await assert.rejects(client.join(42, bookingQuote(f.state.event)), { code: 'UNCERTAIN' });
  assert.equal((await client.reconcile(42)).uncertain, true);
  await assert.rejects(client.join(42, bookingQuote(f.state.event)), { code: 'UNCERTAIN' }); assert.equal(f.state.writes, 1);
});
test('needLevel and needContact are server rejections, not confirmations or uncertain writes', async () => {
  for (const key of ['needLevel', 'needContact']) {
    const f = fixture(); f.transport.registerIndividual = async () => { throw new PlayerRequestError({ success: false, [key]: true, message: 'test rejection' }); };
    const client = createIndividualBooking(f.transport);
    await assert.rejects(client.join(42, bookingQuote(f.state.event)), error => error.code === 'REJECTED' && error[key]);
    assert.equal(client.isUncertain(42), false);
  }
});
test('HTML/malformed/unknown-success responses cannot create a confirmation', async () => {
  for (const reply of ['<html>login</html>', { success: true, status: 'PAIR_REGISTERED' }, { success: true, status: 'WAITLIST', waitlistPosition: -1 }, { status: 'CONFIRMED' }]) {
    const f = fixture(); f.state.result = reply;
    await assert.rejects(f.client.join(42, bookingQuote(f.state.event)), { code: 'UNCERTAIN' }); assert.equal(f.client.isUncertain(42), true);
  }
});
test('contact save accepts either channel, validates both, and does not register automatically', async () => {
  const f = fixture(); f.state.hasContact = false;
  await assert.rejects(f.client.saveContact({}), { code: 'NEED_CONTACT' });
  await assert.rejects(f.client.saveContact({ telefono: 'bad', telegramUsername: '@valid_name' }), { code: 'NEED_CONTACT' });
  await f.client.saveContact({ telegramUsername: '@valid_name' });
  assert.equal((await f.client.load(42)).hasContact, true); assert.equal(f.state.saves, 1); assert.equal(f.state.writes, 0);
});
test('cancel sends exactly one POST and clears the active registration', async () => {
  const f = fixture(); f.state.rows = [f.row('CONFIRMED')];
  await f.client.cancel(42, cancellationQuote({ event: f.state.event, registration: f.state.rows[0] }));
  assert.equal(f.state.cancels, 1); assert.equal(f.state.rows.length, 0);
});
test('cancel works for a waitlisted registration too', async () => {
  const f = fixture(); f.state.rows = [f.row('WAITLIST')];
  await f.client.cancel(42, cancellationQuote({ event: f.state.event, registration: f.state.rows[0] }));
  assert.equal(f.state.cancels, 1);
});
test('cancel without an existing active registration is rejected without a network call', async () => {
  const f = fixture();
  await assert.rejects(f.client.cancel(42, cancellationQuote({ event: f.state.event, registration: null })), { code: 'NO_REGISTRATION' });
  assert.equal(f.state.cancels, 0);
});
test('cancel after the deadline is rejected without a network call', async () => {
  const f = fixture(); f.state.rows = [f.row('CONFIRMED')];
  f.state.event.cancellationDeadline = new Date(Date.now() - 1000).toISOString();
  const quote = cancellationQuote({ event: f.state.event, registration: f.state.rows[0] });
  await assert.rejects(f.client.cancel(42, quote), { code: 'DEADLINE_PASSED' });
  assert.equal(f.state.cancels, 0);
});
test('a changed event between review and confirmation requires new review before cancelling', async () => {
  const f = fixture(); f.state.rows = [f.row('CONFIRMED')];
  const quote = cancellationQuote({ event: f.state.event, registration: f.state.rows[0] });
  f.state.event.price = 50000;
  await assert.rejects(f.client.cancel(42, quote), { code: 'CHANGED' });
  assert.equal(f.state.cancels, 0);
});
test('a status change between review and confirmation requires new review before cancelling', async () => {
  const f = fixture(); f.state.rows = [f.row('WAITLIST')];
  const quote = cancellationQuote({ event: f.state.event, registration: f.state.rows[0] });
  f.state.rows = [f.row('CONFIRMED')];
  await assert.rejects(f.client.cancel(42, quote), { code: 'CHANGED' });
  assert.equal(f.state.cancels, 0);
});
test('the reverse status change (confirmed back to waitlisted) also requires new review before cancelling', async () => {
  const f = fixture(); f.state.rows = [f.row('CONFIRMED')];
  const quote = cancellationQuote({ event: f.state.event, registration: f.state.rows[0] });
  f.state.rows = [f.row('WAITLIST')];
  await assert.rejects(f.client.cancel(42, quote), { code: 'CHANGED' });
  assert.equal(f.state.cancels, 0);
});
test('a waitlist position change between review and confirmation also requires new review', async () => {
  const f = fixture(); f.state.rows = [f.row('WAITLIST', 3)];
  const quote = cancellationQuote({ event: f.state.event, registration: f.state.rows[0] });
  f.state.rows = [f.row('WAITLIST', 1)];
  await assert.rejects(f.client.cancel(42, quote), { code: 'CHANGED' });
  assert.equal(f.state.cancels, 0);
});
test('a non-individual event cannot be cancelled through this flow', async () => {
  const f = fixture(); f.state.event.modality = 'DOBLES'; f.state.rows = [f.row('CONFIRMED')];
  await assert.rejects(f.client.cancel(42, cancellationQuote({ event: f.state.event, registration: f.state.rows[0] })), { code: 'NOT_INDIVIDUAL' });
  assert.equal(f.state.cancels, 0);
});
test('duplicate cancel tap is blocked while a request is in flight', async () => {
  const f = fixture(); f.state.rows = [f.row('CONFIRMED')]; let respond;
  f.transport.cancelIndividual = () => { f.state.cancels++; return new Promise(resolve => { respond = resolve; }); };
  const client = createIndividualBooking(f.transport); const quote = cancellationQuote({ event: f.state.event, registration: f.state.rows[0] });
  const first = client.cancel(42, quote);
  await assert.rejects(client.cancel(42, quote), { code: 'BUSY' });
  await new Promise(resolve => setImmediate(resolve)); respond(f.state.cancelResult); await first;
  assert.equal(f.state.cancels, 1);
});
test('network loss after the cancellation commits: reconcileCancellation finds it gone, never repeats the request', async () => {
  const f = fixture(); f.state.rows = [f.row('CONFIRMED')];
  const quote = cancellationQuote({ event: f.state.event, registration: f.state.rows[0] });
  f.transport.cancelIndividual = async () => { f.state.cancels++; f.state.rows = []; throw new AuthError('NETWORK'); };
  const client = createIndividualBooking(f.transport);
  await assert.rejects(client.cancel(42, quote), { code: 'UNCERTAIN' });
  await assert.rejects(client.cancel(42, quote), { code: 'UNCERTAIN' });
  const resolved = await client.reconcileCancellation(42);
  assert.equal(resolved.cancelled, true); assert.equal(resolved.uncertain, false); assert.equal(f.state.cancels, 1);
});
test('an active registration still present after a timeout does not permit an automatic resend', async () => {
  const f = fixture(); f.state.rows = [f.row('CONFIRMED')];
  const quote = cancellationQuote({ event: f.state.event, registration: f.state.rows[0] });
  f.transport.cancelIndividual = async () => { f.state.cancels++; throw new AuthError('NETWORK'); };
  const client = createIndividualBooking(f.transport);
  await assert.rejects(client.cancel(42, quote), { code: 'UNCERTAIN' });
  const resolved = await client.reconcileCancellation(42);
  assert.equal(resolved.cancelled, false); assert.equal(resolved.uncertain, true);
  await assert.rejects(client.cancel(42, quote), { code: 'UNCERTAIN' }); assert.equal(f.state.cancels, 1);
});
test('malformed/unsuccessful cancellation responses are never treated as success', async () => {
  for (const reply of [{ success: false, message: 'no' }, {}, '<html>login</html>']) {
    const f = fixture(); f.state.rows = [f.row('CONFIRMED')]; f.state.cancelResult = reply;
    const quote = cancellationQuote({ event: f.state.event, registration: f.state.rows[0] });
    await assert.rejects(f.client.cancel(42, quote), { code: 'UNCERTAIN' });
    assert.equal(f.client.isUncertain(42), true);
  }
});
test('custom cancellation deadline is kept; default is start minus 24 hours', () => {
  const f = fixture(); assert.equal(Date.parse(f.state.event.startsAt) - Date.parse(cancellationDeadline(f.state.event)), 86400000);
  f.state.event.cancellationDeadline = '2030-01-01T12:00:00-03:00'; assert.equal(cancellationDeadline(f.state.event), f.state.event.cancellationDeadline);
  assert.deepEqual(Object.keys(bookingCopy.ru).sort(), Object.keys(bookingCopy.es).sort());
  assert.deepEqual(Object.keys(bookingCopy.ru).sort(), Object.keys(bookingCopy.en).sort());
});
