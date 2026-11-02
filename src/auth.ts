import { parseTournament } from './schedule.ts';
import type { PublicTournament } from './schedule.ts';

// Контракт сервера — LFPT-0637 (docs/auth-flow.md, docs/endpoints/player-contact.md):
// вход /api/auth/login, обновление /api/auth/refresh, профиль /api/auth/me,
// «Мои мероприятия» /api/players/me/tournaments, Google — /oauth2/authorization/google?client=app
// с возвратом на /app/#accessToken=...&refreshToken=...&expiresIn=...
export type Profile = { id: number; email: string; name: string };
export type Session = { accessToken: string; refreshToken: string; expiresAt: number };
// status === null — турнир из истории: сервер отдаёт только сам турнир, без статуса записи.
export type Registration = { registrationId: number; status: string | null; active: boolean; waitlistPosition: number | null; event: PublicTournament };
// Forma exacta de PartnerRegistrationDto (servidor) — compañero existente por ID, o datos de uno nuevo sin email (LFPT-0687).
// nombre/apellido son @NotBlank en el servidor incluso con existingUserId (no se usan para resolver
// al jugador, pero la validación los exige igual) — se envían también para el compañero existente.
export type PartnerPayload = { isExistingUser: true; existingUserId: number; nombre: string; apellido: string } | { isExistingUser: false; nombre: string; apellido: string; telefono: string; telegramUsername?: string };
export const registrationStatuses = ['CONFIRMED', 'WAITLIST', 'WAITLIST_INVITED', 'CANCELLED', 'PARTICIPATED', 'PENDING_PARTNER', 'PARTNER_INVITED', 'PAIR_REGISTERED', 'SOLO_ADD_LATER', 'SOLO_SEARCH', 'SOLO_EXPIRED'] as const;
export class AuthError extends Error {
  code: string;
  constructor(code: string) { super(code); this.name = 'AuthError'; this.code = code; }
}
export class PlayerRequestError extends AuthError {
  detail: string; needContact: boolean; needLevel: boolean;
  constructor(value: unknown) {
    super('REJECTED');
    const data = record(value) ? value : {};
    this.detail = typeof data.message === 'string' ? data.message.slice(0, 600) : '';
    this.needContact = data.needContact === true;
    this.needLevel = data.needLevel === true;
  }
}
type PlayerRequest = { method?: 'GET' | 'POST' | 'PATCH'; body?: unknown; business?: boolean };
type Store = { get: () => Promise<string | null>; set: (token: string | null) => Promise<void> };
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function text(value: unknown): value is string { return typeof value === 'string' && value.length > 0; }
export function parseSession(value: unknown): Session {
  if (!record(value) || !text(value.accessToken) || !text(value.refreshToken)) throw new AuthError('UNAVAILABLE');
  const expiresIn = Number(value.expiresIn);
  if (!Number.isFinite(expiresIn) || expiresIn <= 0) throw new AuthError('UNAVAILABLE');
  return { accessToken: value.accessToken, refreshToken: value.refreshToken, expiresAt: Date.now() + expiresIn };
}
// Токены, которые сервер кладёт во fragment после входа через Google (LFPT-0637).
export function parseSessionFragment(hash: string): Session | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  if (!params.has('accessToken')) return null;
  return parseSession({ accessToken: params.get('accessToken'), refreshToken: params.get('refreshToken'), expiresIn: params.get('expiresIn') });
}
// /api/auth/me отдаёт PlayerResponseDto игрока или OwnerDto организатора — личные записи только у игрока.
export function parseProfile(value: unknown): Profile {
  if (!record(value)) throw new AuthError('UNAVAILABLE');
  if ('isSuperAdmin' in value || 'firstName' in value) throw new AuthError('PLAYER_REQUIRED');
  const name = text(value.nombreCompleto) ? value.nombreCompleto : [value.nombre, value.apellido].filter(text).join(' ');
  if (!Number.isSafeInteger(value.id) || Number(value.id) < 1 || !text(value.email) || !name) throw new AuthError('UNAVAILABLE');
  return { id: Number(value.id), email: value.email, name };
}

// TournamentDto (внутренний DTO сайта) → тот же PublicTournament, что у публичного расписания.
// Время событий — Аргентина (UTC−3 без перехода на летнее время), как в PublicTournamentMapper.
const EVENT_OFFSET = '-03:00';
function localDateTime(date: unknown, time: unknown): string | null {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const hhmm = typeof time === 'string' && /^\d{2}:\d{2}/.test(time) ? time.slice(0, 5) : '00:00';
  return `${date}T${hhmm}:00${EVENT_OFFSET}`;
}
export function tournamentFromDto(value: unknown, base: string): PublicTournament {
  if (!record(value)) throw new AuthError('UNAVAILABLE');
  const capacity = Math.max(0, Number(value.cupoMax ?? 0));
  const occupied = Math.max(0, Number(value.inscritosActuales ?? 0));
  const deadline = typeof value.deadlineCancelacion === 'string' ? value.deadlineCancelacion.split('T') : null;
  try {
    return parseTournament({
      id: value.id,
      name: value.nombre,
      club: { id: value.clubId, name: value.clubNombre, address: value.clubDireccion ?? null },
      type: value.tipo,
      modality: value.modalidad,
      gender: value.generoFormato,
      level: value.mostrarNivel === false ? null : value.categoriaNivel ?? null,
      startsAt: localDateTime(value.fechaInicio, value.horaInicio),
      timeZone: 'America/Argentina/Buenos_Aires',
      duration: value.duracion ?? null,
      price: Number(value.precio ?? 0),
      currency: text(value.moneda) ? value.moneda : 'ARS',
      status: value.estado,
      capacity,
      capacityUnit: value.modalidad === 'DOBLES' ? 'PAIRS' : 'PLAYERS',
      occupied,
      available: Math.max(0, Number(value.disponibles ?? capacity - occupied)),
      waitlistCount: Math.max(0, Number(value.waitlistCount ?? 0)),
      registrationOpen: value.estado === 'REGISTRO_ABIERTO',
      cancellationDeadline: deadline ? localDateTime(deadline[0], deadline[1]) : null,
      description: value.infoDetallada ?? null,
      websiteUrl: `${base}/torneo/${value.id}`,
    });
  } catch { throw new AuthError('UNAVAILABLE'); }
}
export function parseRegistrations(value: unknown, base = 'https://1-padel.com'): Registration[] {
  if (!record(value) || !Array.isArray(value.upcoming) || !Array.isArray(value.historical)) throw new AuthError('UNAVAILABLE');
  const upcoming = value.upcoming.map(item => {
    if (!record(item) || !registrationStatuses.includes(item.registrationStatus as typeof registrationStatuses[number])
      || !(item.waitlistPosition == null || Number.isSafeInteger(item.waitlistPosition) && Number(item.waitlistPosition) > 0)) throw new AuthError('UNAVAILABLE');
    const event = tournamentFromDto(item.tournament, base);
    return { registrationId: event.id, status: String(item.registrationStatus), active: true, waitlistPosition: (item.waitlistPosition as number | null | undefined) ?? null, event };
  });
  const historical = value.historical.map(item => {
    const event = tournamentFromDto(item, base);
    return { registrationId: event.id, status: null, active: true, waitlistPosition: null, event };
  });
  return [...upcoming, ...historical];
}

export function createAuthClient({ baseUrl = 'https://1-padel.com', fetchImpl = fetch, store, onExpired = () => {}, timeoutMs = 15000 }: {
  baseUrl?: string; fetchImpl?: typeof fetch; store: Store; onExpired?: () => void; timeoutMs?: number;
}) {
  const origin = new URL(baseUrl);
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/') throw new AuthError('INSECURE');
  const base = origin.origin;
  let session: Session | null = null;
  let epoch = 0;
  let refreshTask: Promise<void> | null = null;
  // Все операции хранилища упорядочены: выход не может проиграть позднему сохранению входа.
  let writes = Promise.resolve();
  const save = (token: string | null) => { writes = writes.catch(() => {}).then(() => store.set(token)); return writes; };
  // badRequest — во что превращается 400: сервер отвечает им и на неверный пароль, и на негодный refresh.
  async function raw(path: string, body?: unknown, accessToken?: string, badRequest = 'UNAVAILABLE', options: PlayerRequest = {}): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(base + path, { method: options.method ?? (body === undefined ? 'GET' : 'POST'),
        headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }), credentials: 'omit', cache: 'no-store', redirect: 'manual', signal: controller.signal });
      // Без действующего токена сервер не отвечает 401, а редиректит /api/** на /login.
      if (response.type === 'opaqueredirect' || response.status === 0 || response.status >= 300 && response.status < 400) throw new AuthError('SESSION_EXPIRED');
      if (response.status === 429) throw new AuthError('RATE_LIMIT');
      const isJson = response.headers.get('content-type')?.includes('application/json');
      if (!response.ok) {
        if (options.business && response.status === 400 && isJson) throw new PlayerRequestError(await response.json());
        if (options.business && response.status === 403) throw new AuthError('FORBIDDEN');
        if (response.status === 400) {
          const message = isJson ? '' : await response.text().catch(() => '');
          throw new AuthError(badRequest === 'INVALID_CREDENTIALS' && /confirma|desactivada/i.test(message) ? 'ACCOUNT_UNAVAILABLE' : badRequest);
        }
        if (response.status === 401) throw new AuthError('SESSION_EXPIRED');
        if (response.status === 403) throw new AuthError('PLAYER_REQUIRED');
        throw new AuthError('UNAVAILABLE');
      }
      if (!isJson) throw new AuthError('UNAVAILABLE');
      const value = await response.json();
      if (options.business && record(value) && value.success === false) throw new PlayerRequestError(value);
      return value;
    } catch (error) { if (error instanceof AuthError) throw error; throw new AuthError('NETWORK'); }
    finally { clearTimeout(timer); }
  }
  async function accept(next: Session, started: number) {
    if (epoch !== started) throw new AuthError('CANCELLED');
    await save(next.refreshToken);
    if (epoch !== started) throw new AuthError('CANCELLED');
    session = next;
  }
  async function clear() {
    epoch++; session = null; refreshTask = null;
    await save(null);
  }
  async function refresh() {
    if (!refreshTask) {
      const started = epoch;
      refreshTask = (async () => {
        const token = session?.refreshToken ?? await store.get();
        if (started !== epoch) throw new AuthError('CANCELLED');
        if (!token) throw new AuthError('SESSION_EXPIRED');
        try { await accept(parseSession(await raw('/api/auth/refresh', { refreshToken: token }, undefined, 'SESSION_EXPIRED')), started); }
        catch (error) {
          if (started === epoch && error instanceof AuthError && ['SESSION_EXPIRED', 'ACCOUNT_UNAVAILABLE', 'PLAYER_REQUIRED'].includes(error.code)) { await clear(); onExpired(); }
          throw error;
        }
      })().finally(() => { if (epoch === started) refreshTask = null; });
    }
    return refreshTask;
  }
  async function authorized(path: string, options: PlayerRequest = {}) {
    const started = epoch;
    if (!session || session.expiresAt < Date.now() + 30000) await refresh();
    if (!session || started !== epoch) throw new AuthError('CANCELLED');
    try {
      const value = await raw(path, options.body, session.accessToken, 'UNAVAILABLE', options);
      if (started !== epoch) throw new AuthError('CANCELLED');
      return value;
    } catch (error) {
      if (error instanceof AuthError && ['ACCOUNT_UNAVAILABLE', 'PLAYER_REQUIRED'].includes(error.code) && started === epoch) { await clear(); onExpired(); throw error; }
      if (!(error instanceof AuthError) || error.code !== 'SESSION_EXPIRED' || started !== epoch) throw error;
      await refresh();
      // После мутации не повторяем POST/PATCH автоматически даже при редиректе/401.
      // Новый запрос возможен только после сверки своей записи и нового подтверждения.
      if (options.method && options.method !== 'GET') throw new AuthError('REVIEW_REQUIRED');
      if (!session || started !== epoch) throw new AuthError('CANCELLED');
      try {
        const value = await raw(path, undefined, session.accessToken);
        if (started !== epoch) throw new AuthError('CANCELLED');
        return value;
      } catch (retryError) {
        if (retryError instanceof AuthError && ['SESSION_EXPIRED', 'ACCOUNT_UNAVAILABLE', 'PLAYER_REQUIRED'].includes(retryError.code) && started === epoch) { await clear(); onExpired(); }
        throw retryError;
      }
    }
  }
  async function me() {
    try { return parseProfile(await authorized('/api/auth/me')); }
    catch (error) { if (error instanceof AuthError && error.code === 'PLAYER_REQUIRED') { await clear(); } throw error; }
  }
  return {
    async restore() { if (!(await store.get())) return null; await refresh(); return me(); },
    async login(email: string, password: string) {
      const started = ++epoch; refreshTask = null;
      await accept(parseSession(await raw('/api/auth/login', { email: email.trim(), password }, undefined, 'INVALID_CREDENTIALS')), started);
      return me();
    },
    // Адрес, с которого начинается вход через Google; вернётся на /app/ с токенами во fragment.
    googleUrl() { return `${base}/oauth2/authorization/google?client=app`; },
    async adopt(next: Session) {
      const started = ++epoch; refreshTask = null;
      await accept(next, started);
      return me();
    },
    async registrations() { return parseRegistrations(await authorized('/api/players/me/tournaments'), base); },
    async contactStatus() { return authorized('/api/players/me/contact-status'); },
    async saveContact(value: { telefono?: string; telegramUsername?: string }) {
      return authorized('/api/players/me/contact', { method: 'PATCH', body: value, business: true });
    },
    async registerIndividual(tournamentId: number) {
      if (!Number.isSafeInteger(tournamentId) || tournamentId < 1) throw new AuthError('UNAVAILABLE');
      return authorized(`/players/tournaments/${tournamentId}/register`, { method: 'POST', business: true });
    },
    async cancelIndividual(tournamentId: number) {
      if (!Number.isSafeInteger(tournamentId) || tournamentId < 1) throw new AuthError('UNAVAILABLE');
      return authorized(`/players/tournaments/${tournamentId}/cancel`, { method: 'POST', business: true });
    },
    // LFPT-0706/LFPT-0707: estado de la propia inscripción (individual o en pareja) para un evento.
    async myRegistration(tournamentId: number) {
      if (!Number.isSafeInteger(tournamentId) || tournamentId < 1) throw new AuthError('UNAVAILABLE');
      return authorized(`/players/tournaments/${tournamentId}/my-registration`);
    },
    async searchPartners(tournamentId: number, query: string) {
      if (!Number.isSafeInteger(tournamentId) || tournamentId < 1) throw new AuthError('UNAVAILABLE');
      return authorized(`/api/players/search?tournamentId=${tournamentId}&query=${encodeURIComponent(query)}`);
    },
    async registerPair(tournamentId: number, partner: PartnerPayload) {
      if (!Number.isSafeInteger(tournamentId) || tournamentId < 1) throw new AuthError('UNAVAILABLE');
      return authorized(`/api/tournaments/double/${tournamentId}/register`, { method: 'POST', body: partner, business: true });
    },
    async registerSoloPair(tournamentId: number, soloType: 'SEARCH' | 'ADD_LATER', shareContacts: boolean) {
      if (!Number.isSafeInteger(tournamentId) || tournamentId < 1) throw new AuthError('UNAVAILABLE');
      return authorized(`/api/tournaments/double/${tournamentId}/register-solo`, { method: 'POST', body: { soloType, shareContacts }, business: true });
    },
    async addPartner(tournamentId: number, partner: PartnerPayload) {
      if (!Number.isSafeInteger(tournamentId) || tournamentId < 1) throw new AuthError('UNAVAILABLE');
      return authorized(`/api/tournaments/double/${tournamentId}/add-partner`, { method: 'POST', body: partner, business: true });
    },
    async lookingForPartner(tournamentId: number) {
      if (!Number.isSafeInteger(tournamentId) || tournamentId < 1) throw new AuthError('UNAVAILABLE');
      return authorized(`/api/tournaments/double/${tournamentId}/looking-for-partner`);
    },
    async proposePair(tournamentId: number, targetRegistrationId: number) {
      if (!Number.isSafeInteger(tournamentId) || tournamentId < 1 || !Number.isSafeInteger(targetRegistrationId) || targetRegistrationId < 1) throw new AuthError('UNAVAILABLE');
      return authorized(`/api/tournaments/double/${tournamentId}/propose-pair/${targetRegistrationId}`, { method: 'POST', business: true });
    },
    sessionVersion() { return epoch; },
    cancelPending() { epoch++; refreshTask = null; },
    logout: clear,
  };
}
