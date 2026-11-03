// Proposed optional detail API extension; missing/malformed data must not mean an empty roster.
export type ParticipantEntry = { id: string; names: string[]; seekingPartner: boolean };
export type Participants = { confirmed: ParticipantEntry[]; waitlist: ParticipantEntry[] };
export function parseParticipants(value: unknown): Participants | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  function entries(input: unknown): ParticipantEntry[] | null {
    if (!Array.isArray(input)) return null;
    const ids = new Set<string>();
    const result: ParticipantEntry[] = [];
    for (const item of input) {
      if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !item.id.trim() || ids.has(item.id)
        || !Array.isArray(item.names) || item.names.length < 1 || item.names.length > 2
        || !item.names.every((name: unknown) => typeof name === 'string' && name.trim())
        || typeof item.seekingPartner !== 'boolean' || (item.seekingPartner && item.names.length !== 1)) return null;
      ids.add(item.id);
      result.push({ id: item.id, names: item.names.map((name: string) => name.trim()), seekingPartner: item.seekingPartner });
    }
    return result;
  }
  const confirmed = entries(v.confirmed), waitlist = entries(v.waitlist);
  if (!confirmed || !waitlist || waitlist.some(row => confirmed.some(other => other.id === row.id))) return null;
  return { confirmed, waitlist };
}
