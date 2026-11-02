import { AuthError, PlayerRequestError } from './auth.ts';
import type { Registration } from './auth.ts';
import type { PublicTournament } from './schedule.ts';

export type BookingSnapshot = { event: PublicTournament; registration: Registration | null; hasContact: boolean };
export type BookingReceipt = { status: 'CONFIRMED' | 'WAITLIST'; waitlistPosition: number | null; existing: boolean };
export class BookingError extends AuthError {
  snapshot?: BookingSnapshot;
  constructor(code: string, snapshot?: BookingSnapshot) { super(code); this.snapshot = snapshot; }
}
export type BookingTransport = {
  sessionVersion?: () => number;
  details: (id: number) => Promise<PublicTournament>;
  registrations: () => Promise<Registration[]>;
  contactStatus: () => Promise<unknown>;
  saveContact: (value: { telefono?: string; telegramUsername?: string }) => Promise<unknown>;
  registerIndividual: (id: number) => Promise<unknown>;
  cancelIndividual: (id: number) => Promise<unknown>;
};
export function isIndividualEvent(event: PublicTournament) {
  return event.modality === 'INDIVIDUAL' && ['KING_OF_COURT', 'AMERICANO', 'PADEL_CLINIC', 'CANCHA_ABIERTA'].includes(event.type);
}
export function cancellationDeadline(event: PublicTournament) {
  return event.cancellationDeadline ?? new Date(Date.parse(event.startsAt) - 86400000).toISOString();
}
// Отслеживаем и цену, и важные признаки заявки, а не только количество мест.
export function bookingQuote(event: PublicTournament) {
  return JSON.stringify([event.id, event.name, event.type, event.modality, event.gender, event.level, event.status,
    event.registrationOpen, event.price, event.currency, event.startsAt, event.timeZone, event.club.id, event.club.name, event.club.address, event.duration, event.description,
    cancellationDeadline(event), event.available > 0]);
}
// Отмена — отдельная проверка от записи: кроме данных мероприятия, значим и собственный статус
// регистрации игрока (WAITLIST ↔ CONFIRMED, смена позиции в листе ожидания) между проверкой и подтверждением.
export function cancellationQuote(snapshot: Pick<BookingSnapshot, 'event' | 'registration'>) {
  return JSON.stringify([bookingQuote(snapshot.event), snapshot.registration?.status ?? null, snapshot.registration?.waitlistPosition ?? null]);
}
export function parseBookingReceipt(value: unknown, existing = false): BookingReceipt {
  const row = value as Record<string, unknown> | null;
  if (!row || typeof row !== 'object' || Array.isArray(row) || row.success !== true || !['CONFIRMED', 'WAITLIST'].includes(String(row.status))) throw new BookingError('UNCERTAIN');
  if (row.waitlistPosition != null && (!Number.isSafeInteger(row.waitlistPosition) || Number(row.waitlistPosition) < 1)) throw new BookingError('UNCERTAIN');
  return { status: row.status as BookingReceipt['status'], waitlistPosition: row.waitlistPosition as number | null ?? null, existing };
}
function parseCancellationReceipt(value: unknown) {
  const row = value as Record<string, unknown> | null;
  if (!row || typeof row !== 'object' || Array.isArray(row) || row.success !== true) throw new BookingError('UNCERTAIN');
}
export function createIndividualBooking(transport: BookingTransport) {
  const sessionVersion = transport.sessionVersion?.();
  function checkAccount() {
    if (transport.sessionVersion?.() !== sessionVersion) throw new AuthError('CANCELLED');
  }
  const pending = new Set<number>();
  const uncertain = new Set<number>();
  async function load(id: number): Promise<BookingSnapshot> {
    checkAccount();
    if (!Number.isSafeInteger(id) || id < 1) throw new BookingError('UNAVAILABLE');
    const [event, registrations, contact] = await Promise.all([transport.details(id), transport.registrations(), transport.contactStatus()]);
    checkAccount();
    if (event.id !== id || !contact || typeof contact !== 'object' || typeof (contact as { hasContact?: unknown }).hasContact !== 'boolean') throw new BookingError('UNAVAILABLE');
    return { event, registration: registrations.find(row => row.event.id === id && row.active && row.status !== null) ?? null, hasContact: (contact as { hasContact: boolean }).hasContact };
  }
  function guard(snapshot: BookingSnapshot) {
    if (!isIndividualEvent(snapshot.event)) throw new BookingError('NOT_INDIVIDUAL', snapshot);
    if (!snapshot.event.registrationOpen || snapshot.event.status !== 'REGISTRO_ABIERTO' || Date.parse(snapshot.event.startsAt) <= Date.now()) throw new BookingError('CLOSED', snapshot);
    if (!snapshot.hasContact) throw new BookingError('NEED_CONTACT', snapshot);
  }
  function existing(snapshot: BookingSnapshot): BookingReceipt | null {
    if (!snapshot.registration) return null;
    const { status, waitlistPosition } = snapshot.registration;
    if (status !== 'CONFIRMED' && status !== 'WAITLIST') throw new BookingError('EXISTING', snapshot);
    return { status, waitlistPosition, existing: true };
  }
  return {
    load,
    isUncertain: (id: number) => uncertain.has(id),
    async reconcile(id: number) {
      const snapshot = await load(id);
      const receipt = existing(snapshot);
      if (receipt) uncertain.delete(id);
      // Отсутствие записи после тайм-аута ещё не доказывает, что первый POST не завершится.
      return { snapshot, receipt, uncertain: uncertain.has(id) };
    },
    // Отмена — зеркало reconcile(): там "запись нашлась" снимает неопределённость,
    // здесь, наоборот, снимает её именно отсутствие активной записи.
    async reconcileCancellation(id: number) {
      const snapshot = await load(id);
      const active = !!snapshot.registration && ['CONFIRMED', 'WAITLIST'].includes(snapshot.registration.status ?? '');
      if (!active) uncertain.delete(id);
      return { snapshot, cancelled: !active, uncertain: uncertain.has(id) };
    },
    async saveContact(value: { telefono?: string; telegramUsername?: string }) {
      checkAccount();
      const telefono = value.telefono?.trim(); const telegramUsername = value.telegramUsername?.trim();
      if ((!telefono || !/^\+?[0-9\s\-()]{8,20}$/.test(telefono)) && (!telegramUsername || !/^@?[A-Za-z][A-Za-z0-9_]{4,31}$/.test(telegramUsername))) throw new BookingError('NEED_CONTACT');
      // Не отправляем второе заполненное, но некорректное поле на сервер.
      if (telefono && !/^\+?[0-9\s\-()]{8,20}$/.test(telefono) || telegramUsername && !/^@?[A-Za-z][A-Za-z0-9_]{4,31}$/.test(telegramUsername)) throw new BookingError('NEED_CONTACT');
      const reply = await transport.saveContact({ ...(telefono ? { telefono } : {}), ...(telegramUsername ? { telegramUsername } : {}) });
      if (!reply || typeof reply !== 'object' || (reply as { success?: unknown }).success !== true) throw new BookingError('UNAVAILABLE');
    },
    async join(id: number, quote: string): Promise<BookingReceipt> {
      if (pending.has(id)) throw new BookingError('BUSY');
      if (uncertain.has(id)) throw new BookingError('UNCERTAIN');
      pending.add(id);
      try {
        const snapshot = await load(id);
        if (!isIndividualEvent(snapshot.event)) throw new BookingError('NOT_INDIVIDUAL', snapshot);
        const receipt = existing(snapshot);
        if (receipt) return receipt;
        guard(snapshot);
        if (bookingQuote(snapshot.event) !== quote) throw new BookingError('CHANGED', snapshot);
        checkAccount();
        try { return parseBookingReceipt(await transport.registerIndividual(id)); }
        catch (error) {
          if (error instanceof PlayerRequestError || error instanceof AuthError && ['REVIEW_REQUIRED', 'RATE_LIMIT', 'FORBIDDEN', 'SESSION_EXPIRED', 'CANCELLED', 'PLAYER_REQUIRED'].includes(error.code)) throw error;
          uncertain.add(id); throw new BookingError('UNCERTAIN');
        }
      } finally { pending.delete(id); }
    },
    async cancel(id: number, quote: string): Promise<void> {
      if (pending.has(id)) throw new BookingError('BUSY');
      if (uncertain.has(id)) throw new BookingError('UNCERTAIN');
      pending.add(id);
      try {
        const snapshot = await load(id);
        if (!isIndividualEvent(snapshot.event)) throw new BookingError('NOT_INDIVIDUAL', snapshot);
        if (!snapshot.registration || !['CONFIRMED', 'WAITLIST'].includes(snapshot.registration.status ?? '')) throw new BookingError('NO_REGISTRATION', snapshot);
        if (Date.now() >= Date.parse(cancellationDeadline(snapshot.event))) throw new BookingError('DEADLINE_PASSED', snapshot);
        if (cancellationQuote(snapshot) !== quote) throw new BookingError('CHANGED', snapshot);
        checkAccount();
        try { parseCancellationReceipt(await transport.cancelIndividual(id)); }
        catch (error) {
          if (error instanceof PlayerRequestError || error instanceof AuthError && ['REVIEW_REQUIRED', 'RATE_LIMIT', 'FORBIDDEN', 'SESSION_EXPIRED', 'CANCELLED', 'PLAYER_REQUIRED'].includes(error.code)) throw error;
          uncertain.add(id); throw new BookingError('UNCERTAIN');
        }
      } finally { pending.delete(id); }
    },
  };
}
