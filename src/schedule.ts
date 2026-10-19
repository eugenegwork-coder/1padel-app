export const tournamentTypes = ['KING_OF_COURT', 'AMERICANO', 'AMERICANO_TEAMS', 'CANCHA_ABIERTA', 'PADEL_CLINIC'] as const;
export type TournamentType = typeof tournamentTypes[number];
export type Language = 'ru' | 'es' | 'en';

export interface PublicTournament {
  id: number;
  name: string;
  club: { id: number; name: string; address: string | null };
  type: TournamentType;
  modality: 'INDIVIDUAL' | 'DOBLES';
  gender: 'MASCULINO' | 'FEMENINO' | 'MIXTO';
  level: string | null;
  startsAt: string;
  timeZone: string;
  duration: string | null;
  price: number;
  currency: string;
  status: string;
  capacity: number;
  capacityUnit: 'PLAYERS' | 'PAIRS';
  occupied: number;
  available: number;
  waitlistCount: number;
  registrationOpen: boolean;
  cancellationDeadline: string | null;
  description: string | null;
  websiteUrl: string;
}

export class ScheduleError extends Error {
  kind: 'unavailable' | 'not_found' | 'network';
  constructor(kind: ScheduleError['kind']) {
    super(kind);
    this.name = 'ScheduleError';
    this.kind = kind;
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function nonnegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
function text(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0; }
function nullableText(value: unknown): value is string | null { return value === null || typeof value === 'string'; }
function offsetDate(value: unknown): value is string {
  return typeof value === 'string' && /T\d{2}:\d{2}.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
}

export function parseTournament(value: unknown): PublicTournament {
  if (!record(value) || !record(value.club)) throw new ScheduleError('unavailable');
  const counts = [value.capacity, value.occupied, value.available, value.waitlistCount];
  if (!nonnegative(value.id) || value.id === 0 || !text(value.name)
    || !nonnegative(value.club.id) || !text(value.club.name) || !nullableText(value.club.address)
    || !tournamentTypes.includes(value.type as TournamentType)
    || !['INDIVIDUAL', 'DOBLES'].includes(String(value.modality))
    || !['MASCULINO', 'FEMENINO', 'MIXTO'].includes(String(value.gender))
    || !nullableText(value.level) || !offsetDate(value.startsAt) || !text(value.timeZone)
    || !nullableText(value.duration) || typeof value.price !== 'number' || !Number.isFinite(value.price) || value.price < 0
    || typeof value.currency !== 'string' || !/^[A-Z]{3}$/.test(value.currency)
    || !text(value.status) || !counts.every(nonnegative)
    || value.capacityUnit !== (value.modality === 'DOBLES' ? 'PAIRS' : 'PLAYERS')
    || typeof value.registrationOpen !== 'boolean'
    || !(value.cancellationDeadline === null || offsetDate(value.cancellationDeadline))
    || !nullableText(value.description) || !text(value.websiteUrl)) {
    throw new ScheduleError('unavailable');
  }
  let websiteUrl: URL;
  try {
    new Intl.DateTimeFormat('en', { timeZone: value.timeZone }).format(0);
    websiteUrl = new URL(value.websiteUrl);
    if (!['https:', 'http:'].includes(websiteUrl.protocol) || websiteUrl.username || websiteUrl.password) throw new Error('url');
  } catch { throw new ScheduleError('unavailable'); }
  // На сервере ещё встречается старый APP_BASE_URL (GitHub #619).
  // Исправляем только известную ссылку того же события; тестовые среды сохраняем.
  if (['epadel.org', 'www.epadel.org'].includes(websiteUrl.hostname)
    && !websiteUrl.port && websiteUrl.pathname === `/torneo/${value.id}`) {
    websiteUrl.protocol = 'https:';
    websiteUrl.hostname = '1-padel.com';
  }
  return { ...value, websiteUrl: websiteUrl.toString() } as unknown as PublicTournament;
}

export function createScheduleClient({ baseUrl = '', fetchImpl = fetch, timeoutMs = 12000 } = {}) {
  const base = baseUrl.replace(/\/+$/, '');

  async function request(path: string, language: Language, signal?: AbortSignal, isDetail = false): Promise<unknown> {
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal?.aborted) controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, timeoutMs);
    try {
      const response = await fetchImpl(`${base}/api/public/tournaments${path}`, {
        headers: { Accept: 'application/json', 'Accept-Language': language },
        signal: controller.signal, credentials: 'omit',
      });
      if (isDetail && response.status === 404) throw new ScheduleError('not_found');
      if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw new ScheduleError('unavailable');
      return await response.json();
    } catch (error) {
      if (error instanceof ScheduleError) throw error;
      if (error instanceof SyntaxError) throw new ScheduleError('unavailable');
      throw new ScheduleError('network');
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
  }

  return {
    async list(language: Language, signal?: AbortSignal) {
      const response = await request('', language, signal);
      if (!Array.isArray(response)) throw new ScheduleError('unavailable');
      return response.map(parseTournament).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt) || a.id - b.id);
    },
    async details(id: number, language: Language, signal?: AbortSignal) {
      if (!Number.isSafeInteger(id) || id <= 0) throw new ScheduleError('not_found');
      const result = parseTournament(await request(`/${id}`, language, signal, true));
      if (result.id !== id) throw new ScheduleError('unavailable');
      return result;
    },
  };
}

export function eventDate(date: string, timeZone: string, language: Language): string {
  return new Intl.DateTimeFormat(language, {
    timeZone, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(date));
}

export function eventPrice(event: PublicTournament, language: Language): string {
  return new Intl.NumberFormat(language, { style: 'currency', currency: event.currency, currencyDisplay: 'code', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(event.price);
}
