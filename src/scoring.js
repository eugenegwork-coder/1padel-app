// Mirrors the point-and-court-bonus ranking used in the existing King of Court demo.
export function bonusFor(courtId, won) {
  if (courtId === 1) return won ? 3 : 1;
  if (courtId === 2) return won ? 2 : 1;
  if (courtId === 3) return won ? 1 : 0;
  return 0;
}

export function validateResult(players, winners, winnerScore, total = 21) {
  if (players.length !== 4 || new Set(players).size !== 4) return 'Нужны четыре разных игрока.';
  if (winners.length !== 2 || !winners.every(index => Number.isInteger(index) && index >= 0 && index < 4) || winners[0] === winners[1]) {
    return 'Выберите двух разных победителей.';
  }
  if (!Number.isInteger(winnerScore) || winnerScore < Math.ceil(total / 2) || winnerScore > total) {
    return `Очки победителей: от ${Math.ceil(total / 2)} до ${total}.`;
  }
  return null;
}

export function calculateRanking(players, results) {
  const stats = players.map((name, index) => ({ index, name, points: 0, bonus: 0, games: 0, wins: 0 }));
  for (const match of results) {
    const { courtId, winners, winnerScore, total = 21 } = match;
    if (validateResult(match.players, winners, winnerScore, total)) continue;
    const losers = match.players.filter(index => !winners.includes(index));
    for (const index of winners) {
      stats[index].games++;
      stats[index].wins++;
      stats[index].points += winnerScore;
      stats[index].bonus += bonusFor(courtId, true);
    }
    for (const index of losers) {
      stats[index].games++;
      stats[index].points += total - winnerScore;
      stats[index].bonus += bonusFor(courtId, false);
    }
  }
  return stats.sort((a, b) =>
    b.points + b.bonus - a.points - a.bonus || b.wins - a.wins || a.name.localeCompare(b.name)
  );
}
