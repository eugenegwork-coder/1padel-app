import { AuthError, PlayerRequestError } from './auth.ts';
import type { PartnerPayload } from './auth.ts';
import type { PublicTournament } from './schedule.ts';
import { bookingQuote, cancellationDeadline } from './individualBooking.ts';

export { bookingQuote, cancellationDeadline };
// Propia, no reutiliza la de individualBooking.ts: allí `snapshot` está tipado a su propio
// BookingSnapshot (con `registration: Registration | null` de la lista de eventos), que no
// es compatible con el snapshot de pareja (`registration: MyRegistration`, de my-registration).
export class BookingError extends AuthError {
  snapshot?: PairSnapshot;
  constructor(code: string, snapshot?: PairSnapshot) { super(code); this.snapshot = snapshot; }
}

// Estados que ya tienen ambos participantes resueltos por el servidor, sin pareja pendiente.
const completeStatuses = ['CONFIRMED', 'WAITLIST'] as const;
// Resultado válido de una inscripción solo (register-solo): todavía sin compañero, a propósito.
const soloResultStatuses = ['SOLO_SEARCH', 'SOLO_ADD_LATER'] as const;
const knownStatuses = [
  'CONFIRMED', 'WAITLIST', 'WAITLIST_INVITED', 'CANCELLED', 'PARTICIPATED',
  'PENDING_PARTNER', 'PARTNER_INVITED', 'PAIR_REGISTERED', 'SOLO_ADD_LATER', 'SOLO_SEARCH', 'SOLO_EXPIRED',
] as const;

export type MyRegistration = {
  registered: boolean; registrationId: number | null; status: string | null;
  waitlistPosition: number | null; registrationDate: string | null; isDoubleRegistration: boolean;
  partnerId: number | null; partnerFirstName: string | null; partnerLastName: string | null; hasRegisteredPartner: boolean;
};
export type PairSnapshot = { event: PublicTournament; registration: MyRegistration; hasContact: boolean };
// Resultado de una mutación: para register-solo el status es SOLO_SEARCH/SOLO_ADD_LATER (éxito, no error);
// para register/add-partner siempre CONFIRMED/WAITLIST. Nunca se confunde con BookingReceipt (individual),
// cuyo tipo está cerrado a esos dos únicos valores.
export type PairReceipt = { status: string; waitlistPosition: number | null; existing: boolean };
export type PartnerCandidate = { id: number; nombre: string; apellido: string; nombreCompleto: string };
export type LookingForPartnerEntry = { registrationId: number; playerName: string; nivel: string | null };

export function isPairAmericanoEvent(event: PublicTournament) {
  return event.modality === 'DOBLES' && (event.type === 'AMERICANO' || event.type === 'AMERICANO_TEAMS');
}

export type PairBookingTransport = {
  sessionVersion?: () => number;
  details: (id: number) => Promise<PublicTournament>;
  myRegistration: (id: number) => Promise<unknown>;
  contactStatus: () => Promise<unknown>;
  saveContact: (value: { telefono?: string; telegramUsername?: string }) => Promise<unknown>;
  searchPartners: (tournamentId: number, query: string) => Promise<unknown>;
  registerPair: (tournamentId: number, partner: PartnerPayload) => Promise<unknown>;
  registerSoloPair: (tournamentId: number, soloType: 'SEARCH' | 'ADD_LATER', shareContacts: boolean) => Promise<unknown>;
  addPartner: (tournamentId: number, partner: PartnerPayload) => Promise<unknown>;
  lookingForPartner: (tournamentId: number) => Promise<unknown>;
  proposePair: (tournamentId: number, targetRegistrationId: number) => Promise<unknown>;
};

function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }

function parseMyRegistration(value: unknown): MyRegistration {
  if (!record(value)) throw new BookingError('UNAVAILABLE');
  if (value.registered !== true) {
    return { registered: false, registrationId: null, status: null, waitlistPosition: null, registrationDate: null, isDoubleRegistration: false, partnerId: null, partnerFirstName: null, partnerLastName: null, hasRegisteredPartner: false };
  }
  const status = typeof value.status === 'string' ? value.status : null;
  if (status !== null && !(knownStatuses as readonly string[]).includes(status)) throw new BookingError('UNAVAILABLE');
  if (value.waitlistPosition != null && (!Number.isSafeInteger(value.waitlistPosition) || Number(value.waitlistPosition) < 1)) throw new BookingError('UNAVAILABLE');
  if (!Number.isSafeInteger(value.registrationId) || Number(value.registrationId) < 1) throw new BookingError('UNAVAILABLE');
  return {
    registered: true, registrationId: Number(value.registrationId), status,
    waitlistPosition: (value.waitlistPosition as number | null | undefined) ?? null,
    registrationDate: typeof value.registrationDate === 'string' ? value.registrationDate : null,
    isDoubleRegistration: value.isDoubleRegistration === true,
    partnerId: Number.isSafeInteger(value.partnerId) ? Number(value.partnerId) : null,
    partnerFirstName: typeof value.partnerFirstName === 'string' ? value.partnerFirstName : null,
    partnerLastName: typeof value.partnerLastName === 'string' ? value.partnerLastName : null,
    hasRegisteredPartner: value.hasRegisteredPartner === true,
  };
}
function parseReceipt(value: unknown, allowed: readonly string[]): PairReceipt {
  const row = value as Record<string, unknown> | null;
  if (!row || typeof row !== 'object' || Array.isArray(row) || row.success !== true || typeof row.status !== 'string' || !allowed.includes(row.status)) throw new BookingError('UNCERTAIN');
  if (row.waitlistPosition != null && (!Number.isSafeInteger(row.waitlistPosition) || Number(row.waitlistPosition) < 1)) throw new BookingError('UNCERTAIN');
  return { status: row.status, waitlistPosition: (row.waitlistPosition as number | null | undefined) ?? null, existing: false };
}
function parseCandidates(value: unknown): PartnerCandidate[] {
  if (!Array.isArray(value)) throw new BookingError('UNAVAILABLE');
  return value.map(row => {
    if (!record(row) || !Number.isSafeInteger(row.id) || Number(row.id) < 1 || typeof row.nombreCompleto !== 'string' || !row.nombreCompleto.trim()
      || typeof row.nombre !== 'string' || !row.nombre.trim() || typeof row.apellido !== 'string' || !row.apellido.trim()) throw new BookingError('UNAVAILABLE');
    return { id: Number(row.id), nombre: row.nombre, apellido: row.apellido, nombreCompleto: row.nombreCompleto };
  });
}
function parseLookingForPartner(value: unknown, selfPlayerId: number | null): LookingForPartnerEntry[] {
  if (!Array.isArray(value)) throw new BookingError('UNAVAILABLE');
  return value.filter(row => record(row) && row.playerId !== selfPlayerId).map(row => {
    const data = row as Record<string, unknown>;
    if (!Number.isSafeInteger(data.registrationId) || Number(data.registrationId) < 1 || typeof data.playerName !== 'string' || !data.playerName.trim()) throw new BookingError('UNAVAILABLE');
    return { registrationId: Number(data.registrationId), playerName: data.playerName, nivel: typeof data.nivel === 'string' ? data.nivel : null };
  });
}

export function createPairBooking(transport: PairBookingTransport) {
  const sessionVersion = transport.sessionVersion?.();
  function checkAccount() { if (transport.sessionVersion?.() !== sessionVersion) throw new AuthError('CANCELLED'); }
  const pending = new Set<number>();
  const uncertain = new Set<number>();
  async function load(id: number): Promise<PairSnapshot> {
    checkAccount();
    if (!Number.isSafeInteger(id) || id < 1) throw new BookingError('UNAVAILABLE');
    const [event, registrationRaw, contact] = await Promise.all([transport.details(id), transport.myRegistration(id), transport.contactStatus()]);
    checkAccount();
    if (event.id !== id || !contact || typeof contact !== 'object' || typeof (contact as { hasContact?: unknown }).hasContact !== 'boolean') throw new BookingError('UNAVAILABLE');
    return { event, registration: parseMyRegistration(registrationRaw), hasContact: (contact as { hasContact: boolean }).hasContact };
  }
  function guard(snapshot: PairSnapshot) {
    if (!isPairAmericanoEvent(snapshot.event)) throw new BookingError('NOT_PAIR', snapshot);
    if (!snapshot.event.registrationOpen || snapshot.event.status !== 'REGISTRO_ABIERTO' || Date.parse(snapshot.event.startsAt) <= Date.now()) throw new BookingError('CLOSED', snapshot);
    if (!snapshot.hasContact) throw new BookingError('NEED_CONTACT', snapshot);
  }
  // null → sin registro, o solo sin pareja todavía (puede seguir mutando: agregar pareja/proponer).
  // Un recibo → ya completa (CONFIRMED/WAITLIST), no se intenta ninguna mutación más.
  // Cualquier otro estado conocido (legacy) → EXISTING, nunca se trata como uno de los tres flujos.
  function existingReceipt(snapshot: PairSnapshot): PairReceipt | null {
    const reg = snapshot.registration;
    if (!reg.registered || reg.status === null) return null;
    if ((completeStatuses as readonly string[]).includes(reg.status)) return { status: reg.status, waitlistPosition: reg.waitlistPosition, existing: true };
    if ((soloResultStatuses as readonly string[]).includes(reg.status)) return null;
    throw new BookingError('EXISTING', snapshot);
  }
  async function mutate(id: number, quote: string, allowed: readonly string[], send: () => Promise<unknown>): Promise<PairReceipt> {
    if (pending.has(id)) throw new BookingError('BUSY');
    if (uncertain.has(id)) throw new BookingError('UNCERTAIN');
    pending.add(id);
    try {
      const snapshot = await load(id);
      const receipt = existingReceipt(snapshot);
      if (receipt) return receipt;
      guard(snapshot);
      if (bookingQuote(snapshot.event) !== quote) throw new BookingError('CHANGED', snapshot);
      checkAccount();
      try { return parseReceipt(await send(), allowed); }
      catch (error) {
        if (error instanceof PlayerRequestError || error instanceof AuthError && ['REVIEW_REQUIRED', 'RATE_LIMIT', 'FORBIDDEN', 'SESSION_EXPIRED', 'CANCELLED', 'PLAYER_REQUIRED'].includes(error.code)) throw error;
        uncertain.add(id); throw new BookingError('UNCERTAIN');
      }
    } finally { pending.delete(id); }
  }
  return {
    load,
    isUncertain: (id: number) => uncertain.has(id),
    async reconcile(id: number) {
      const snapshot = await load(id);
      const receipt = existingReceipt(snapshot);
      if (receipt) uncertain.delete(id);
      return { snapshot, receipt, uncertain: uncertain.has(id) };
    },
    async saveContact(value: { telefono?: string; telegramUsername?: string }) {
      checkAccount();
      const telefono = value.telefono?.trim(); const telegramUsername = value.telegramUsername?.trim();
      const validPhone = !!telefono && /^\+?[0-9\s\-()]{8,20}$/.test(telefono);
      const validTelegram = !!telegramUsername && /^@?[A-Za-z][A-Za-z0-9_]{4,31}$/.test(telegramUsername);
      if (!validPhone && !validTelegram) throw new BookingError('NEED_CONTACT');
      if (telefono && !validPhone || telegramUsername && !validTelegram) throw new BookingError('NEED_CONTACT');
      const reply = await transport.saveContact({ ...(telefono ? { telefono } : {}), ...(telegramUsername ? { telegramUsername } : {}) });
      if (!reply || typeof reply !== 'object' || (reply as { success?: unknown }).success !== true) throw new BookingError('UNAVAILABLE');
    },
    async searchPartners(id: number, query: string): Promise<PartnerCandidate[]> {
      checkAccount();
      if (query.trim().length < 2) return [];
      return parseCandidates(await transport.searchPartners(id, query.trim()));
    },
    async lookingForPartner(id: number, selfPlayerId: number | null): Promise<LookingForPartnerEntry[]> {
      checkAccount();
      return parseLookingForPartner(await transport.lookingForPartner(id), selfPlayerId);
    },
    async joinWithPartner(id: number, quote: string, partner: PartnerPayload) {
      return mutate(id, quote, completeStatuses, () => transport.registerPair(id, partner));
    },
    async joinSolo(id: number, quote: string, soloType: 'SEARCH' | 'ADD_LATER', shareContacts: boolean) {
      return mutate(id, quote, soloResultStatuses, () => transport.registerSoloPair(id, soloType, shareContacts));
    },
    async addPartnerNow(id: number, quote: string, partner: PartnerPayload) {
      return mutate(id, quote, completeStatuses, () => transport.addPartner(id, partner));
    },
    async proposePair(id: number, targetRegistrationId: number) {
      if (pending.has(id)) throw new BookingError('BUSY');
      pending.add(id);
      try {
        checkAccount();
        const reply = await transport.proposePair(id, targetRegistrationId);
        if (!reply || typeof reply !== 'object' || (reply as { success?: unknown }).success !== true) throw new BookingError('UNAVAILABLE');
      } finally { pending.delete(id); }
    },
  };
}
