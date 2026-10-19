import type { PublicTournament, TournamentType } from './schedule';

export interface ScheduleFilters {
  gender: PublicTournament['gender'] | 'all';
  level: string;
  type: TournamentType | 'all';
  modality: PublicTournament['modality'] | 'all';
  availableOnly: boolean;
}

export const defaultFilters: ScheduleFilters = {
  gender: 'all', level: 'all', type: 'all', modality: 'all', availableOnly: false,
};

export function matchesLevel(eventLevel: string | null, selected: string) {
  if (selected === 'all' || eventLevel === 'TODOS') return true;
  if (eventLevel === selected) return true;
  // C9/C8 подходит обеим категориям; Suma остаётся отдельной категорией пар.
  return /^[CD]\d+$/.test(selected) && (eventLevel ?? '').split(/[_/\s]+/).includes(selected);
}

export function filterSchedule(events: PublicTournament[], filters: ScheduleFilters) {
  return events.filter(event => (filters.gender === 'all' || event.gender === filters.gender)
    && matchesLevel(event.level, filters.level)
    && (filters.type === 'all' || event.type === filters.type)
    && (filters.modality === 'all' || event.modality === filters.modality)
    && (!filters.availableOnly || (event.registrationOpen && event.available > 0)));
}

export function availableLevels(events: PublicTournament[], gender: ScheduleFilters['gender']) {
  const levels = new Set<string>();
  for (const event of events) {
    if (gender !== 'all' && event.gender !== gender) continue;
    if (!event.level || ['TODOS', 'SIN_ESPECIFICAR'].includes(event.level)) continue;
    const parts = /^(?:[CD]\d+)(?:[_/\s]+[CD]\d+)+$/.test(event.level) ? event.level.split(/[_/\s]+/) : [event.level];
    parts.forEach(level => levels.add(level));
  }
  return [...levels].sort((a, b) => {
    if (a === 'PRINCIPIANTES' || b === 'PRINCIPIANTES') return a === b ? 0 : a === 'PRINCIPIANTES' ? -1 : 1;
    const left = /^([CD]|SUMA_)(\d+)$/.exec(a);
    const right = /^([CD]|SUMA_)(\d+)$/.exec(b);
    return left && right && left[1] === right[1]
      ? Number(right[2]) - Number(left[2]) : a.localeCompare(b, 'en', { numeric: true });
  });
}
