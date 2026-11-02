import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAuth } from './AuthContext';
import { AuthError } from './auth';
import type { Registration } from './auth';
import { eventDate, eventPrice } from './schedule';
import type { Language } from './schedule';
import { authErrorText } from './LoginScreen';
import { messages } from './copy';
import { colors } from './theme';
import { isIndividualEvent } from './individualBooking';
import { bookingCopy } from './bookingCopy';
import CancelBookingPanel from './CancelBookingPanel';
const copy: Record<Language, Record<string, string>> = {
  "ru": {
    "title": "Мои мероприятия",
    "subtitle": "Ваши записи с сайта 1‑Padel",
    "upcoming": "Предстоящие",
    "history": "История",
    "logout": "Выйти",
    "refresh": "Обновить",
    "loading": "Загружаем ваши записи…",
    "empty": "Здесь пока нет мероприятий",
    "emptyHint": "Когда вы запишетесь на сайте, мероприятие появится здесь.",
    "browse": "Найти игру",
    "open": "Открыть на сайте",
    "waitPosition": "Место в очереди",
    "count": "записей",
    "CONFIRMED": "Вы в составе",
    "WAITLIST": "Лист ожидания",
    "WAITLIST_INVITED": "Подтвердите место на сайте",
    "CANCELLED": "Запись отменена",
    "PARTICIPATED": "Участие завершено",
    "PENDING_PARTNER": "Ожидаем партнёра",
    "PARTNER_INVITED": "Партнёр приглашён",
    "PAIR_REGISTERED": "Пара зарегистрирована",
    "SOLO_ADD_LATER": "Добавьте партнёра на сайте",
    "SOLO_SEARCH": "Ищете партнёра",
    "SOLO_EXPIRED": "Срок добавления партнёра истёк",
    "changed": "Вход завершён. Войдите снова.",
    "logoutError": "Не удалось удалить сохранённый вход. Нажмите «Выйти» ещё раз."
  },
  "es": {
    "title": "Mis eventos",
    "subtitle": "Tus inscripciones de la web de 1‑Padel",
    "upcoming": "Próximos",
    "history": "Historial",
    "logout": "Salir",
    "refresh": "Actualizar",
    "loading": "Cargando tus inscripciones…",
    "empty": "Todavía no hay eventos acá",
    "emptyHint": "Cuando te inscribas en la web, el evento aparecerá acá.",
    "browse": "Buscar un juego",
    "open": "Abrir en la web",
    "waitPosition": "Posición en espera",
    "count": "inscripciones",
    "CONFIRMED": "Estás en la lista",
    "WAITLIST": "Lista de espera",
    "WAITLIST_INVITED": "Confirmá tu lugar en la web",
    "CANCELLED": "Inscripción cancelada",
    "PARTICIPATED": "Participación finalizada",
    "PENDING_PARTNER": "Esperando compañero",
    "PARTNER_INVITED": "Compañero invitado",
    "PAIR_REGISTERED": "Pareja registrada",
    "SOLO_ADD_LATER": "Agregá tu compañero en la web",
    "SOLO_SEARCH": "Buscando compañero",
    "SOLO_EXPIRED": "Venció el plazo para agregar compañero",
    "changed": "Sesión finalizada. Volvé a ingresar.",
    "logoutError": "No pudimos borrar la sesión guardada. Volvé a tocar Salir."
  },
  "en": {
    "title": "My events",
    "subtitle": "Your registrations from the 1‑Padel website",
    "upcoming": "Upcoming",
    "history": "History",
    "logout": "Sign out",
    "refresh": "Refresh",
    "loading": "Loading your registrations…",
    "empty": "No events here yet",
    "emptyHint": "When you register on the website, your event will appear here.",
    "browse": "Find a game",
    "open": "Open on website",
    "waitPosition": "Waiting list position",
    "count": "registrations",
    "CONFIRMED": "You are in",
    "WAITLIST": "Waiting list",
    "WAITLIST_INVITED": "Confirm your spot on the website",
    "CANCELLED": "Registration cancelled",
    "PARTICIPATED": "Participation completed",
    "PENDING_PARTNER": "Waiting for partner",
    "PARTNER_INVITED": "Partner invited",
    "PAIR_REGISTERED": "Pair registered",
    "SOLO_ADD_LATER": "Add your partner on the website",
    "SOLO_SEARCH": "Looking for a partner",
    "SOLO_EXPIRED": "Partner deadline expired",
    "changed": "Session ended. Please sign in again.",
    "logoutError": "Could not remove the saved session. Tap Sign out again."
  }
};
export default function MyEventsScreen({ language, onBrowse }: { language: Language; onBrowse: () => void }) {
  const auth = useAuth();
  const t = copy[language];
  const bt = bookingCopy[language];
  const [data, setData] = useState<Registration[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState(false);
  const [revision, setRevision] = useState(0);
  const [logoutError, setLogoutError] = useState(false);
  const [cancelling, setCancelling] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    setLoading(true); setError(null);
    auth.client.registrations().then(value => { if (alive) setData(value); }).catch(e => { if (alive) { setData(null); setError(e instanceof AuthError ? e.code : 'UNAVAILABLE'); } }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [auth.client, auth.profile?.id, revision]);
  const rows = useMemo(() => (data ?? []).filter(item => {
    const past = item.status === null || Date.parse(item.event.startsAt) < Date.now() || !item.active || ['CANCELLED', 'SOLO_EXPIRED', 'PARTICIPATED'].includes(item.status) || ['FINALIZADO', 'CANCELADO', 'CERRADO'].includes(item.event.status);
    return history === past;
  }).sort((a, b) => (history ? -1 : 1) * (Date.parse(a.event.startsAt) - Date.parse(b.event.startsAt))), [data, history]);
  async function logout() { try { await auth.logout(); } catch { setLogoutError(true); } }
  // LFPT-0666: парная (DOBLES) отмена и отмена через приложение прошедших/неактивных записей остаются на сайте.
  function cancellable(item: Registration) { return item.active && item.status !== null && ['CONFIRMED', 'WAITLIST'].includes(item.status) && isIndividualEvent(item.event); }
  return <ScrollView contentContainerStyle={styles.content}>
    <View style={styles.top}><View style={{ flex: 1 }}><Text accessibilityRole="header" style={styles.title}>{t.title}</Text><Text style={styles.subtitle}>{t.subtitle}</Text></View>
      <TouchableOpacity accessibilityRole="button" onPress={() => void logout()} style={styles.smallButton}><Text style={styles.link}>{t.logout}</Text></TouchableOpacity></View>
    <View style={styles.profile}><View style={styles.avatar}><Text style={styles.initial}>{auth.profile?.name.slice(0, 1).toUpperCase()}</Text></View><View style={{ flex: 1 }}><Text style={styles.name}>{auth.profile?.name}</Text><Text style={styles.subtitle}>{auth.profile?.email}</Text></View></View>
    {logoutError && <Text accessibilityRole="alert" style={styles.error}>{t.logoutError}</Text>}
    <View style={styles.segment}>{[false, true].map(value => <TouchableOpacity key={String(value)} accessibilityRole="tab" accessibilityState={{ selected: history === value }} onPress={() => setHistory(value)} style={[styles.segmentTab, history === value && styles.selected]}><Text style={styles.link}>{value ? t.history : t.upcoming}</Text></TouchableOpacity>)}</View>
    <TouchableOpacity accessibilityRole="button" disabled={loading} onPress={() => setRevision(value => value + 1)} style={styles.refresh}><Text style={styles.link}>{t.refresh} ↻</Text></TouchableOpacity>
    {loading ? <View style={styles.empty}><ActivityIndicator color={colors.orange} /><Text style={styles.subtitle}>{t.loading}</Text></View> : error ? <View style={styles.empty}><Text accessibilityRole="alert" style={styles.error}>{authErrorText(language, error)}</Text></View> : rows.length === 0 ? <View style={styles.empty}><Text style={styles.name}>{t.empty}</Text><Text style={styles.subtitle}>{t.emptyHint}</Text><TouchableOpacity accessibilityRole="button" onPress={onBrowse} style={styles.open}><Text style={styles.link}>{t.browse} ›</Text></TouchableOpacity></View> : rows.map(item => <View style={styles.card} key={item.registrationId}>
      {item.status !== null && <Text style={[styles.status, ['WAITLIST', 'WAITLIST_INVITED'].includes(item.status) && styles.wait]}>{t[item.active ? item.status : 'CANCELLED'] ?? item.status}</Text>}
      <Text style={styles.eventTitle}>{messages[language][item.event.type]}</Text>
      <Text style={styles.date}>{eventDate(item.event.startsAt, item.event.timeZone, language)}</Text>
      <Text style={styles.subtitle}>{item.event.club.name}</Text>
      {item.waitlistPosition != null && item.active && <Text style={styles.subtitle}>{t.waitPosition}: {item.waitlistPosition}</Text>}
      <View style={styles.bottom}><Text style={styles.price}>{eventPrice(item.event, language)}</Text><TouchableOpacity accessibilityRole="link" onPress={() => Linking.openURL(item.event.websiteUrl)} style={styles.open}><Text style={styles.link}>{t.open} ↗</Text></TouchableOpacity></View>
      {cancellable(item) && cancelling !== item.event.id && <TouchableOpacity accessibilityRole="button" onPress={() => setCancelling(item.event.id)} style={styles.cancelLink}><Text style={[styles.link, styles.cancelLinkText]}>{bt.cancelAction}</Text></TouchableOpacity>}
      {cancelling === item.event.id && <CancelBookingPanel tournamentId={item.event.id} booking={auth.booking} language={language} onClose={() => setCancelling(null)} onCancelled={() => { setCancelling(null); setRevision(value => value + 1); }} />}
    </View>)}
  </ScrollView>;
}
const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 30, width: '100%', maxWidth: 640, alignSelf: 'center' },
  top: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' }, title: { fontSize: 27, lineHeight: 34, letterSpacing: -0.7, color: colors.ink, fontWeight: '800' },
  subtitle: { color: colors.muted, fontSize: 13, lineHeight: 20, marginTop: 5 }, smallButton: { paddingVertical: 10, minHeight: 44 }, link: { color: colors.green, fontWeight: '700', fontSize: 12 },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.white, borderRadius: 16, padding: 16, marginTop: 20, borderColor: colors.line, borderWidth: 1 },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.greenPale, justifyContent: 'center', alignItems: 'center' }, initial: { fontSize: 20, fontWeight: '800', color: colors.ink },
  name: { color: colors.ink, fontSize: 16, fontWeight: '700' }, segment: { flexDirection: 'row', padding: 4, backgroundColor: colors.line, borderRadius: 12, marginTop: 22 },
  segmentTab: { flex: 1, minHeight: 40, justifyContent: 'center', alignItems: 'center', borderRadius: 9 }, selected: { backgroundColor: colors.white }, refresh: { alignSelf: 'flex-end', minHeight: 44, justifyContent: 'center' },
  empty: { alignItems: 'center', padding: 24, gap: 8 }, error: { color: '#A13F31', fontSize: 13, lineHeight: 20 },
  card: { borderRadius: 18, padding: 18, borderColor: colors.line, borderWidth: 1, backgroundColor: colors.white, marginBottom: 12 }, status: { color: colors.green, fontSize: 11, fontWeight: '800', alignSelf: 'flex-start', backgroundColor: colors.greenPale, borderRadius: 7, paddingHorizontal: 8, paddingVertical: 5 }, wait: { backgroundColor: colors.pale, color: '#98512F' },
  eventTitle: { color: colors.ink, fontSize: 21, lineHeight: 28, fontWeight: '800', marginTop: 12 }, date: { color: colors.ink, fontWeight: '600', fontSize: 14, marginTop: 8 },
  bottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 10 }, price: { color: colors.ink, fontSize: 13, fontWeight: '700' }, open: { minHeight: 44, justifyContent: 'center', paddingVertical: 8 },
  cancelLink: { minHeight: 36, justifyContent: 'center', marginTop: 2 }, cancelLinkText: { color: '#A13F31' },
});
