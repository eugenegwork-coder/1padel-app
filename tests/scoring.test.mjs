import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateRanking, validateResult } from '../src/scoring.js';

const players = ['Anna', 'Boris', 'Clara', 'Denis'];
const match = { courtId: 1, players: [0, 1, 2, 3], winners: [0, 1], winnerScore: 12, total: 21 };

test('King of Court awards match points and court bonuses to each player', () => {
  const ranking = calculateRanking(players, [match]);
  assert.deepEqual(ranking.map(({ name, points, bonus, wins }) => [name, points, bonus, wins]), [
    ['Anna', 12, 3, 1], ['Boris', 12, 3, 1], ['Clara', 9, 1, 0], ['Denis', 9, 1, 0],
  ]);
});

test('invalid results cannot change the ranking', () => {
  assert.match(validateResult([0, 1, 2, 3], [0, 0], 12), /разных победителей/);
  assert.match(validateResult([0, 1, 2, 3], [0, 1], 10), /от 11 до 21/);
  assert.deepEqual(calculateRanking(players, [{ ...match, winnerScore: 22 }]).map(player => player.points), [0, 0, 0, 0]);
});
