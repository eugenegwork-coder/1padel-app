import assert from 'node:assert/strict';
import test from 'node:test';
import { AuthError, PlayerRequestError } from '../src/auth.ts';
import { createPairBooking, bookingQuote, isPairAmericanoEvent } from '../src/pairBooking.ts';
import { pairCopy } from '../src/pairCopy.ts';

function fixture() {
  const state = {
    event: { id: 77, name: 'Americano DOBLES', type: 'AMERICANO', modality: 'DOBLES', gender: 'MASCULINO', level: 'C9_C8', status: 'REGISTRO_ABIERTO', registrationOpen: true, startsAt: new Date(Date.now() + 4 * 86400000).toISOString(), timeZone: 'America/Argentina/Buenos_Aires', club: { id: 1, name: 'Test club' }, price: 43000, currency: 'ARS', available: 2, cancellationDeadline: null, websiteUrl: 'https://1-padel.com/torneo/77' },
    registration: { registered: false },
    hasContact: true, candidates: [], looking: [],
    registerWrites: 0, soloWrites: 0, addPartnerWrites: 0, proposeWrites: 0, saves: 0,
    registerResult: { success: true, status: 'CONFIRMED', waitlistPosition: null },
    soloResult: { success: true, status: 'SOLO_SEARCH', waitlistPosition: null },
    addPartnerResult: { success: true, status: 'CONFIRMED', waitlistPosition: null },
    proposeResult: { success: true },
  };
  const transport = {
    details: async () => ({ ...state.event }),
    myRegistration: async () => ({ ...state.registration }),
    contactStatus: async () => ({ hasContact: state.hasContact }),
    saveContact: async () => { state.saves++; state.hasContact = true; return { success: true }; },
    searchPartners: async () => [...state.candidates],
    registerPair: async () => { state.registerWrites++; return state.registerResult; },
    registerSoloPair: async () => { state.soloWrites++; return state.soloResult; },
    addPartner: async () => { state.addPartnerWrites++; return state.addPartnerResult; },
    lookingForPartner: async () => [...state.looking],
    proposePair: async () => { state.proposeWrites++; return state.proposeResult; },
  };
  return { state, transport, client: createPairBooking(transport) };
}
const existingPartner = { isExistingUser: true, existingUserId: 5, nombre: 'Ana', apellido: 'Gomez' };
const newPartner = { isExistingUser: false, nombre: 'Ana', apellido: 'Gomez', telefono: '+5491111111111' };

test('only DOBLES Americano/Team Americano events are pair-bookable', () => {
  for (const event of [{ type: 'AMERICANO', modality: 'DOBLES' }, { type: 'AMERICANO_TEAMS', modality: 'DOBLES' }]) assert.equal(isPairAmericanoEvent(event), true);
  for (const event of [{ type: 'AMERICANO', modality: 'INDIVIDUAL' }, { type: 'KING_OF_COURT', modality: 'DOBLES' }, { type: 'CANCHA_ABIERTA', modality: 'DOBLES' }]) assert.equal(isPairAmericanoEvent(event), false);
});
test('registering with an existing partner sends exactly one register POST and returns the server receipt', async () => {
  const f = fixture(); const snapshot = await f.client.load(77);
  const result = await f.client.joinWithPartner(77, bookingQuote(snapshot.event), existingPartner);
  assert.deepEqual(result, { status: 'CONFIRMED', waitlistPosition: null, existing: false });
  assert.equal(f.state.registerWrites, 1); assert.equal(f.state.soloWrites, 0); assert.equal(f.state.addPartnerWrites, 0);
});
test('registering with a new partner (no email field at all) sends exactly one register POST', async () => {
  const f = fixture(); const snapshot = await f.client.load(77);
  await f.client.joinWithPartner(77, bookingQuote(snapshot.event), newPartner);
  assert.equal(f.state.registerWrites, 1);
});
test('a last place lost between confirmation and commit returns WAITLIST, not an invented success', async () => {
  const f = fixture(); f.state.registerResult = { success: true, status: 'WAITLIST', waitlistPosition: 2 };
  const result = await f.client.joinWithPartner(77, bookingQuote(f.state.event), existingPartner);
  assert.equal(result.status, 'WAITLIST'); assert.equal(result.waitlistPosition, 2);
});
test('solo SEARCH registration accepts SOLO_SEARCH as a valid success status, not a server error', async () => {
  const f = fixture();
  const result = await f.client.joinSolo(77, bookingQuote(f.state.event), 'SEARCH', false);
  assert.deepEqual(result, { status: 'SOLO_SEARCH', waitlistPosition: null, existing: false });
  assert.equal(f.state.soloWrites, 1); assert.equal(f.state.registerWrites, 0);
});
test('solo ADD_LATER registration accepts SOLO_ADD_LATER as a valid success status', async () => {
  const f = fixture(); f.state.soloResult = { success: true, status: 'SOLO_ADD_LATER', waitlistPosition: null };
  const result = await f.client.joinSolo(77, bookingQuote(f.state.event), 'ADD_LATER', false);
  assert.equal(result.status, 'SOLO_ADD_LATER');
});
test('a register-solo response claiming CONFIRMED is rejected as UNCERTAIN: that status never comes from this endpoint', async () => {
  const f = fixture(); f.state.soloResult = { success: true, status: 'CONFIRMED', waitlistPosition: null };
  await assert.rejects(f.client.joinSolo(77, bookingQuote(f.state.event), 'SEARCH', false), { code: 'UNCERTAIN' });
});
test('a register response claiming SOLO_SEARCH is rejected as UNCERTAIN: register always produces a complete pair', async () => {
  const f = fixture(); f.state.registerResult = { success: true, status: 'SOLO_SEARCH', waitlistPosition: null };
  await assert.rejects(f.client.joinWithPartner(77, bookingQuote(f.state.event), existingPartner), { code: 'UNCERTAIN' });
});
test('an existing CONFIRMED/WAITLIST registration suppresses any further mutation', async () => {
  const f = fixture(); f.state.registration = { registered: true, registrationId: 9, status: 'WAITLIST', waitlistPosition: 4, registrationDate: '2026-10-20T10:00:00', isDoubleRegistration: true, partnerId: 3, partnerFirstName: 'Ana', partnerLastName: 'Gomez', hasRegisteredPartner: true };
  const receipt = await f.client.joinWithPartner(77, bookingQuote(f.state.event), existingPartner);
  assert.deepEqual(receipt, { status: 'WAITLIST', waitlistPosition: 4, existing: true });
  assert.equal(f.state.registerWrites, 0);
});
test('an existing SOLO_SEARCH registration lets add-partner proceed instead of register', async () => {
  const f = fixture(); f.state.registration = { registered: true, registrationId: 9, status: 'SOLO_SEARCH', waitlistPosition: null, registrationDate: '2026-10-20T10:00:00', isDoubleRegistration: false, partnerId: null, partnerFirstName: null, partnerLastName: null, hasRegisteredPartner: false };
  const result = await f.client.addPartnerNow(77, bookingQuote(f.state.event), existingPartner);
  assert.equal(result.status, 'CONFIRMED'); assert.equal(f.state.addPartnerWrites, 1); assert.equal(f.state.registerWrites, 0);
});
test('a legacy registration status (e.g. PARTNER_INVITED) is never treated as one of the three flows', async () => {
  const f = fixture(); f.state.registration = { registered: true, registrationId: 9, status: 'PARTNER_INVITED', waitlistPosition: null, registrationDate: '2026-10-20T10:00:00', isDoubleRegistration: true, partnerId: null, partnerFirstName: null, partnerLastName: null, hasRegisteredPartner: false };
  await assert.rejects(f.client.joinWithPartner(77, bookingQuote(f.state.event), existingPartner), { code: 'EXISTING' });
  await assert.rejects(f.client.reconcile(77), { code: 'EXISTING' });
  assert.equal(f.state.registerWrites, 0);
});
test('price, modality and availability changes all require a fresh review before registering', async () => {
  for (const change of [{ price: 44000 }, { modality: 'INDIVIDUAL' }, { available: 0 }, { registrationOpen: false }]) {
    const f = fixture(); const quote = bookingQuote(f.state.event); Object.assign(f.state.event, change);
    await assert.rejects(f.client.joinWithPartner(77, quote, existingPartner), error => ['CHANGED', 'NOT_PAIR', 'CLOSED'].includes(error.code));
    assert.equal(f.state.registerWrites, 0);
  }
});
test('closed registration, non-pair modality and missing contact never send a register POST', async () => {
  for (const [change, expected] of [[{ registrationOpen: false }, 'CLOSED'], [{ startsAt: new Date(Date.now() - 1000).toISOString() }, 'CLOSED'], [{ modality: 'INDIVIDUAL' }, 'NOT_PAIR']]) {
    const f = fixture(); Object.assign(f.state.event, change);
    await assert.rejects(f.client.joinWithPartner(77, bookingQuote(f.state.event), existingPartner), { code: expected });
  }
  const f = fixture(); f.state.hasContact = false;
  await assert.rejects(f.client.joinWithPartner(77, bookingQuote(f.state.event), existingPartner), { code: 'NEED_CONTACT' });
  assert.equal(f.state.registerWrites, 0);
});
test('duplicate tap on register is blocked while a request is in flight', async () => {
  const f = fixture(); let respond;
  f.transport.registerPair = () => { f.state.registerWrites++; return new Promise(resolve => { respond = resolve; }); };
  const client = createPairBooking(f.transport); const first = client.joinWithPartner(77, bookingQuote(f.state.event), existingPartner);
  await assert.rejects(client.joinWithPartner(77, bookingQuote(f.state.event), existingPartner), { code: 'BUSY' });
  await new Promise(resolve => setImmediate(resolve)); respond(f.state.registerResult); await first;
  assert.equal(f.state.registerWrites, 1);
});
test('network loss after the server commits a pair: reconcile finds it, never repeats the POST', async () => {
  const f = fixture();
  f.transport.registerPair = async () => { f.state.registerWrites++; f.state.registration = { registered: true, registrationId: 9, status: 'CONFIRMED', waitlistPosition: null, registrationDate: '2026-10-20T10:00:00', isDoubleRegistration: true, partnerId: 5, partnerFirstName: 'Ana', partnerLastName: 'Gomez', hasRegisteredPartner: true }; throw new AuthError('NETWORK'); };
  const client = createPairBooking(f.transport);
  await assert.rejects(client.joinWithPartner(77, bookingQuote(f.state.event), existingPartner), { code: 'UNCERTAIN' });
  const restored = await client.reconcile(77);
  assert.equal(restored.receipt.status, 'CONFIRMED'); assert.equal(restored.uncertain, false); assert.equal(f.state.registerWrites, 1);
});
test('logout or account switch during preflight cannot register the new account using an old screen', async () => {
  const f = fixture(); let version = 1; let reply;
  f.transport.sessionVersion = () => version;
  f.transport.details = () => new Promise(resolve => { reply = resolve; });
  const client = createPairBooking(f.transport);
  const pending = client.joinWithPartner(77, bookingQuote(f.state.event), existingPartner);
  version++; reply(f.state.event);
  await assert.rejects(pending, { code: 'CANCELLED' }); assert.equal(f.state.registerWrites, 0);
});
test('needLevel and needContact are server rejections, not confirmations or uncertain writes', async () => {
  for (const key of ['needLevel', 'needContact']) {
    const f = fixture(); f.transport.registerPair = async () => { throw new PlayerRequestError({ success: false, [key]: true, message: 'test rejection' }); };
    const client = createPairBooking(f.transport);
    await assert.rejects(client.joinWithPartner(77, bookingQuote(f.state.event), existingPartner), error => error.code === 'REJECTED' && error[key]);
    assert.equal(client.isUncertain(77), false);
  }
});
test('search ignores short queries and filters out malformed candidates', async () => {
  const f = fixture(); f.state.candidates = [{ id: 1, nombre: 'Ana', apellido: 'Gomez', nombreCompleto: 'Ana Gomez' }];
  assert.deepEqual(await f.client.searchPartners(77, 'a'), []);
  assert.deepEqual(await f.client.searchPartners(77, 'an'), [{ id: 1, nombre: 'Ana', apellido: 'Gomez', nombreCompleto: 'Ana Gomez' }]);
  f.state.candidates = [{ id: 2, nombreCompleto: 'Missing Names' }];
  await assert.rejects(f.client.searchPartners(77, 'mi'), { code: 'UNAVAILABLE' });
});
test('looking-for-partner list excludes the current player and rejects a malformed row', async () => {
  const f = fixture(); f.state.looking = [{ registrationId: 1, playerId: 42, playerName: 'Self' }, { registrationId: 2, playerId: 8, playerName: 'Bruno', nivel: 'C8_C7' }];
  assert.deepEqual(await f.client.lookingForPartner(77, 42), [{ registrationId: 2, playerName: 'Bruno', nivel: 'C8_C7' }]);
  f.state.looking = [{ registrationId: 2, playerId: 8 }];
  await assert.rejects(f.client.lookingForPartner(77, 42), { code: 'UNAVAILABLE' });
});
test('proposing a pair sends exactly one POST and is blocked while one is already in flight', async () => {
  const f = fixture(); let respond;
  f.transport.proposePair = () => { f.state.proposeWrites++; return new Promise(resolve => { respond = resolve; }); };
  const client = createPairBooking(f.transport); const first = client.proposePair(77, 2);
  await assert.rejects(client.proposePair(77, 3), { code: 'BUSY' });
  respond({ success: true }); await first;
  assert.equal(f.state.proposeWrites, 1);
});
test('a malformed or unsuccessful propose response is never treated as success', async () => {
  const f = fixture(); f.state.proposeResult = { success: false };
  await assert.rejects(f.client.proposePair(77, 2), { code: 'UNAVAILABLE' });
});
test('contact save accepts either channel, validates both, and does not register automatically', async () => {
  const f = fixture(); f.state.hasContact = false;
  await assert.rejects(f.client.saveContact({}), { code: 'NEED_CONTACT' });
  await assert.rejects(f.client.saveContact({ telefono: 'bad', telegramUsername: '@valid_name' }), { code: 'NEED_CONTACT' });
  await f.client.saveContact({ telegramUsername: '@valid_name' });
  assert.equal((await f.client.load(77)).hasContact, true); assert.equal(f.state.saves, 1); assert.equal(f.state.registerWrites, 0);
});
test('all three pair-booking dictionaries have the same keys', () => {
  assert.deepEqual(Object.keys(pairCopy.ru).sort(), Object.keys(pairCopy.es).sort());
  assert.deepEqual(Object.keys(pairCopy.ru).sort(), Object.keys(pairCopy.en).sort());
});
