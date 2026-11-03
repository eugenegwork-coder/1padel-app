import type { PublicTournament } from './schedule';

type AvailabilityEvent = Pick<PublicTournament, 'status' | 'registrationOpen' | 'available' | 'occupied' | 'capacityUnit'>;

export type AvailabilityStatus = 'published' | 'closed' | 'reserve' | 'limited' | 'available';

export function availabilityStatus(event: AvailabilityEvent): AvailabilityStatus {
  if (event.status === 'PUBLICADO') return 'published';
  if (!event.registrationOpen) return 'closed';
  if (event.available === 0) return 'reserve';
  const threshold = event.capacityUnit === 'PAIRS' ? 10 : 15;
  return event.occupied >= threshold ? 'limited' : 'available';
}
