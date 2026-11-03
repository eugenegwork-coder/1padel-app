import test from 'node:test';
import assert from 'node:assert/strict';
import { parseParticipants } from '../src/participants.ts';
const entry = { id: 'a', names: [' Ana '], seekingPartner: true };
test('unavailable and malformed rosters are distinct from an empty roster', () => {
  for (const value of [undefined, null, {}, {confirmed: []}, {confirmed: [entry], waitlist: null}]) assert.equal(parseParticipants(value), null);
  assert.deepEqual(parseParticipants({confirmed: [], waitlist: []}), {confirmed: [], waitlist: []});
});
test('keeps pairs and reserve order, trims names and excludes other fields', () => {
  const result = parseParticipants({confirmed: [{...entry, email: 'private@example.test'}], waitlist: [{id:'b', names:['B', 'C'], seekingPartner:false}]});
  assert.deepEqual(result, {confirmed:[{...entry, names:['Ana']}], waitlist:[{id:'b', names:['B','C'], seekingPartner:false}]});
});
test('rejects conflicting identities and invalid entries', () => {
  assert.equal(parseParticipants({confirmed:[entry], waitlist:[entry]}), null);
  assert.equal(parseParticipants({confirmed:[entry,entry], waitlist:[]}), null);
  for (const change of [{names:[]}, {names:['']}, {names:[1]}, {names:['A','B']}, {seekingPartner:'yes'}, {id:''}]) {
    assert.equal(parseParticipants({confirmed:[{...entry,...change}], waitlist:[]}), null);
  }
});
