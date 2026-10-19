import { parseTournament } from './schedule.ts';
import type { PublicTournament } from './schedule.ts';

export type Profile = { id: number; email: string; name: string };
export type Session = { accessToken: string; refreshToken: string; expiresAt: number };
export type Registration = { registrationId: number; status: string; active: boolean; waitlistPosition: number | null; event: PublicTournament };
export const registrationStatuses = ['CONFIRMED', 'WAITLIST', 'WAITLIST_INVITED', 'CANCELLED', 'PARTICIPATED', 'PENDING_PARTNER', 'PARTNER_INVITED', 'PAIR_REGISTERED', 'SOLO_ADD_LATER', 'SOLO_SEARCH', 'SOLO_EXPIRED'] as const;
export class AuthError extends Error {
  code: string;
  constructor(code: string) { super(code); this.name = 'AuthError'; this.code = code; }
}
type Store = { get: () => Promise<string | null>; set: (token: string | null) => Promise<void> };
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function text(value: unknown): value is string { return typeof value === 'string' && value.length > 0; }
export function parseSession(value: unknown): Session {
  if (!record(value) || !text(value.accessToken) || !text(value.refreshToken) || typeof value.expiresIn !== 'number' || !Number.isFinite(value.expiresIn) || value.expiresIn <= 0) throw new AuthError('UNAVAILABLE');
  return { accessToken: value.accessToken, refreshToken: value.refreshToken, expiresAt: Date.now() + value.expiresIn };
}
export function parseProfile(value: unknown): Profile {
  if (!record(value) || !Number.isSafeInteger(value.id) || Number(value.id) < 1 || !text(value.email) || !text(value.name)) throw new AuthError('UNAVAILABLE');
  return value as Profile;
}
export function parseRegistrations(value: unknown): Registration[] {
  if (!Array.isArray(value)) throw new AuthError('UNAVAILABLE');
  return value.map(item => {
    if (!record(item) || !Number.isSafeInteger(item.registrationId) || Number(item.registrationId) <= 0 || !registrationStatuses.includes(item.status as typeof registrationStatuses[number]) || typeof item.active !== 'boolean' || !(item.waitlistPosition === null || Number.isSafeInteger(item.waitlistPosition) && Number(item.waitlistPosition) > 0)) throw new AuthError('UNAVAILABLE');
    try { return { ...item, event: parseTournament(item.event) } as Registration; }
    catch { throw new AuthError('UNAVAILABLE'); }
  });
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
  async function raw(path: string, body?: unknown, accessToken?: string): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(base + path, { method: body === undefined ? 'GET' : 'POST',
        headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }), credentials: 'omit', cache: 'no-store', redirect: 'error', signal: controller.signal });
      if (response.status === 429) throw new AuthError('RATE_LIMIT');
      const value = response.headers.get('content-type')?.includes('application/json') ? await response.json() : null;
      if (!response.ok) {
        if (response.status === 401) throw new AuthError(record(value) && value.code === 'INVALID_CREDENTIALS' ? 'INVALID_CREDENTIALS' : 'SESSION_EXPIRED');
        if (response.status === 403) throw new AuthError(record(value) && value.code === 'PLAYER_REQUIRED' ? 'PLAYER_REQUIRED' : 'ACCOUNT_UNAVAILABLE');
        if (response.status === 410) throw new AuthError('LOGIN_REQUEST_EXPIRED');
        throw new AuthError('UNAVAILABLE');
      }
      if (value === null) throw new AuthError('UNAVAILABLE');
      return value;
    } catch (error) { if (error instanceof AuthError) throw error; throw new AuthError('NETWORK'); }
    finally { clearTimeout(timer); }
  }
  async function accept(value: unknown, started: number) {
    const next = parseSession(value);
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
        try { await accept(await raw('/api/mobile-auth/refresh', { refreshToken: token }), started); }
        catch (error) {
          if (started === epoch && error instanceof AuthError && ['SESSION_EXPIRED', 'ACCOUNT_UNAVAILABLE', 'PLAYER_REQUIRED'].includes(error.code)) { await clear(); onExpired(); }
          throw error;
        }
      })().finally(() => { if (epoch === started) refreshTask = null; });
    }
    return refreshTask;
  }
  async function authorized(path: string) {
    const started = epoch;
    if (!session || session.expiresAt < Date.now() + 30000) await refresh();
    if (!session || started !== epoch) throw new AuthError('CANCELLED');
    try {
      const value = await raw(path, undefined, session.accessToken);
      if (started !== epoch) throw new AuthError('CANCELLED');
      return value;
    } catch (error) {
      if (error instanceof AuthError && ['ACCOUNT_UNAVAILABLE', 'PLAYER_REQUIRED'].includes(error.code) && started === epoch) { await clear(); onExpired(); throw error; }
      if (!(error instanceof AuthError) || error.code !== 'SESSION_EXPIRED' || started !== epoch) throw error;
      await refresh();
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
  return {
    async restore() { if (!(await store.get())) return null; await refresh(); return parseProfile(await authorized('/api/mobile/me')); },
    async login(email: string, password: string) {
      const started = ++epoch; refreshTask = null;
      await accept(await raw('/api/mobile-auth/login', { email: email.trim(), password }), started);
      return parseProfile(await authorized('/api/mobile/me'));
    },
    async startGoogle(challenge: string) {
      const value = await raw('/api/mobile-auth/google/start', { challenge });
      if (!record(value) || typeof value.requestId !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value.requestId) || value.verificationPath !== `/mobile-auth/google?request=${value.requestId}` || value.expiresIn !== 300) throw new AuthError('UNAVAILABLE');
      return { requestId: value.requestId, browserUrl: base + value.verificationPath, expiresIn: 300 };
    },
    async exchangeGoogle(requestId: string, verifier: string) {
      const started = epoch;
      const value = await raw('/api/mobile-auth/google/exchange', { requestId, verifier });
      if (record(value) && value.status === 'pending') return null;
      await accept(value, started);
      return parseProfile(await authorized('/api/mobile/me'));
    },
    async registrations() { return parseRegistrations(await authorized('/api/mobile/me/tournaments')); },
    cancelPending() { epoch++; refreshTask = null; },
    logout: clear,
  };
}
