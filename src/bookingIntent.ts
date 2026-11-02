const key = 'onepadel.pendingIndividual.v1';
export type BookingIntentKind = 'individual' | 'pair';
export type BookingIntent = { id: number; kind: BookingIntentKind };
// Только ID выбранного события и тип экрана записи (LFPT-0707), не подтверждение и не личные данные.
export function saveBookingIntent(id: number | null, kind: BookingIntentKind = 'individual') {
  try {
    if (typeof window === 'undefined') return;
    if (id === null) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, JSON.stringify({ id, kind, at: Date.now() }));
  } catch { /* Вход доступен и без sessionStorage; пользователь выберет событие снова. */ }
}
export function readBookingIntent(): BookingIntent | null {
  try {
    if (typeof window === 'undefined') return null;
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const value = JSON.parse(raw);
    if (Number.isSafeInteger(value?.id) && value.id > 0 && typeof value.at === 'number' && Date.now() - value.at >= 0 && Date.now() - value.at < 1800000) {
      return { id: value.id, kind: value.kind === 'pair' ? 'pair' : 'individual' };
    }
  } catch { /* Повреждённые/недоступные данные не создают запись. */ }
  return null;
}
