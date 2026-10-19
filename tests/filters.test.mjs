import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { availableLevels, defaultFilters, filterSchedule, matchesLevel } from '../src/filters.ts';

const fixtures = JSON.parse(fs.readFileSync(new URL('./fixtures/schedule.json', import.meta.url)));

test('level choice includes combined and all-level events without confusing pair sums', () => {
  assert.equal(matchesLevel('C9_C8', 'C8'), true);
  assert.equal(matchesLevel('C9_C8', 'C7'), false);
  assert.equal(matchesLevel('D7_D6', 'D6'), true);
  assert.equal(matchesLevel('TODOS', 'C8'), true);
  assert.equal(matchesLevel(null, 'C8'), false);
  assert.equal(matchesLevel('SUMA_15', 'C8'), false);
  assert.equal(matchesLevel('SUMA_15', 'SUMA_15'), true);
  assert.equal(matchesLevel('SUMA_14', 'SUMA_15'), false);
});

test('gender, level, format, participation and free spots narrow the same result', () => {
  const event = { ...fixtures[0], id: 1, gender: 'MASCULINO', level: 'C9_C8', modality: 'INDIVIDUAL', type: 'PADEL_CLINIC', available: 3, registrationOpen: true };
  const choices = { ...defaultFilters, gender: 'MASCULINO', level: 'C8', type: 'PADEL_CLINIC', modality: 'INDIVIDUAL', availableOnly: true };
  const events = [event, { ...event, id: 2, gender: 'FEMENINO' }, { ...event, id: 3, level: 'C7' },
    { ...event, id: 4, type: 'AMERICANO' }, { ...event, id: 5, modality: 'DOBLES' },
    { ...event, id: 6, available: 0 }, { ...event, id: 7, registrationOpen: false }];
  assert.deepEqual(filterSchedule(events, choices).map(x => x.id), [1]);
  assert.equal(filterSchedule(events, defaultFilters).length, events.length);
});

test('level choices follow the selected gender and preserve sums as separate categories', () => {
  const events = [
    { ...fixtures[0], gender: 'MASCULINO', level: 'C9_C8' },
    { ...fixtures[0], gender: 'MASCULINO', level: 'C8' },
    { ...fixtures[0], gender: 'FEMENINO', level: 'D7_D6' },
    { ...fixtures[0], gender: 'MIXTO', level: 'SUMA_15' },
    { ...fixtures[0], gender: 'MIXTO', level: 'TODOS' },
    { ...fixtures[0], gender: 'MASCULINO', level: null },
  ];
  assert.deepEqual(availableLevels(events, 'MASCULINO'), ['C9', 'C8']);
  assert.deepEqual(availableLevels(events, 'FEMENINO'), ['D7', 'D6']);
  assert.deepEqual(availableLevels(events, 'MIXTO'), ['SUMA_15']);
  assert.deepEqual(availableLevels(events, 'all'), ['C9', 'C8', 'D7', 'D6', 'SUMA_15']);
});
