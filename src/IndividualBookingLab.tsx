import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import IndividualBookingScreen from './IndividualBookingScreen';
import { AuthError, PlayerRequestError } from './auth';
import type { Registration } from './auth';
import type { PublicTournament } from './schedule';
import { createIndividualBooking } from './individualBooking';
import { colors as c } from './theme';

const options = ['Тренировка + игра', 'Cancha Abierta', 'Король корта', 'Americano', 'Лист ожидания', 'Уже записан', 'Нужен контакт', 'Нужен уровень', 'Изменилась цена', 'Обрыв связи'] as const;
type Scenario = typeof options[number];
function laboratory(scenario: Scenario, onWrite: () => void) {
  const type = scenario === 'Cancha Abierta' ? 'CANCHA_ABIERTA' : scenario === 'Король корта' ? 'KING_OF_COURT' : scenario === 'Americano' || scenario === 'Нужен уровень' ? 'AMERICANO' : 'PADEL_CLINIC';
  const event: PublicTournament = { id: 90001, name: 'Тестовое мероприятие', type, modality: 'INDIVIDUAL', gender: type === 'CANCHA_ABIERTA' ? 'MIXTO' : 'MASCULINO', level: type === 'CANCHA_ABIERTA' ? 'TODOS' : 'C8', club: { id: 1, name: 'Тестовый клуб', address: 'Пример адреса' }, startsAt: new Date(Date.now() + 7 * 86400000).toISOString(), timeZone: 'America/Argentina/Buenos_Aires', duration: '3 h', price: 43000, currency: 'ARS', status: 'REGISTRO_ABIERTO', capacity: 12, occupied: scenario === 'Лист ожидания' ? 12 : 8, available: scenario === 'Лист ожидания' ? 0 : 4, capacityUnit: 'PLAYERS', registrationOpen: true, waitlistCount: 2, cancellationDeadline: new Date(Date.now() + 6 * 86400000).toISOString(), description: null, websiteUrl: 'https://1-padel.com/' };
  let hasContact = scenario !== 'Нужен контакт'; let detailReads = 0;
  const row = (status: 'CONFIRMED' | 'WAITLIST'): Registration => ({ event, registrationId: event.id, active: true, status, waitlistPosition: status === 'WAITLIST' ? 3 : null });
  let rows: Registration[] = scenario === 'Уже записан' ? [row('CONFIRMED')] : [];
  const booking = createIndividualBooking({
    details: async () => { if (scenario === 'Изменилась цена' && ++detailReads >= 2) event.price = 45000; return { ...event }; },
    registrations: async () => [...rows], contactStatus: async () => ({ hasContact }),
    saveContact: async () => { hasContact = true; return { success: true }; },
    registerIndividual: async () => {
      onWrite();
      if (scenario === 'Нужен уровень') throw new PlayerRequestError({ needLevel: true, message: 'Укажите уровень', success: false });
      const status = event.available === 0 ? 'WAITLIST' : 'CONFIRMED'; rows = [row(status)];
      if (scenario === 'Обрыв связи') throw new AuthError('NETWORK');
      return { success: true, status, waitlistPosition: status === 'WAITLIST' ? 3 : null };
    },
    cancelIndividual: async () => { onWrite(); rows = []; return { success: true }; },
  });
  return { booking, rows: () => [...rows] };
}
export default function IndividualBookingLab() {
  const [scenario, setScenario] = useState<Scenario>('Тренировка + игра');
  const [writes, setWrites] = useState(0); const [screen, setScreen] = useState<'booking' | 'events' | 'event'>('booking');
  const lab = useMemo(() => laboratory(scenario, () => setWrites(value => value + 1)), [scenario]);
  return <SafeAreaProvider><SafeAreaView style={s.root}>
    <View style={s.header}><Text style={s.brand}>1-PADEL<Text style={{ color: c.orange }}>.</Text></Text><Text style={s.label}>Проверка новой записи</Text></View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabs} contentContainerStyle={s.tabContent}>{options.map(value => <TouchableOpacity key={value} accessibilityRole="tab" accessibilityState={{ selected: value === scenario }} onPress={() => { setWrites(0); setScreen('booking'); setScenario(value); }} style={[s.tab, value === scenario && s.active]}><Text style={[s.tabText, value === scenario && { color: c.white }]}>{value}</Text></TouchableOpacity>)}</ScrollView>
    <Text style={s.counter}>Тестовых отправок: {writes}</Text>
    {screen === 'booking' ? <IndividualBookingScreen key={scenario} tournamentId={90001} booking={lab.booking} language="ru" profileName="Игрок · тестовый аккаунт" demo onClose={() => setScreen('event')} onMyEvents={() => setScreen('events')} /> : <View style={s.page}><Text style={s.title}>{screen === 'events' ? 'Мои мероприятия · тест' : 'Тестовое мероприятие'}</Text>{screen === 'events' && lab.rows().map(row => <View key={row.registrationId} style={s.card}><Text style={s.title}>{scenario}</Text><Text style={s.label}>{row.status === 'WAITLIST' ? 'Лист ожидания · позиция 3' : 'Участие подтверждено'}</Text></View>)}<TouchableOpacity accessibilityRole="button" onPress={() => setScreen('booking')} style={s.button}><Text style={s.buttonText}>Открыть экран записи</Text></TouchableOpacity><Text style={s.label}>Только вымышленные данные. На сайт ничего не отправляется.</Text></View>}
  </SafeAreaView></SafeAreaProvider>;
}
const s = StyleSheet.create({ root: { flex: 1, backgroundColor: c.white }, header: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 10 }, brand: { fontWeight: '900', fontSize: 22, color: c.ink, letterSpacing: -1 }, label: { fontSize: 11, color: c.muted, lineHeight: 19 }, tabs: { flexGrow: 0, maxHeight: 56 }, tabContent: { paddingHorizontal: 16, paddingVertical: 8, gap: 7 }, tab: { paddingHorizontal: 12, borderRadius: 19, borderWidth: 1, borderColor: c.line, minHeight: 35, justifyContent: 'center' }, active: { backgroundColor: c.ink }, tabText: { fontSize: 11, color: c.ink, fontWeight: '600' }, counter: { fontSize: 10, color: c.muted, paddingHorizontal: 20, paddingBottom: 8 }, page: { flex: 1, backgroundColor: c.background, padding: 20 }, title: { fontSize: 20, fontWeight: '800', color: c.ink, marginBottom: 12 }, card: { borderRadius: 15, padding: 18, backgroundColor: c.white, marginVertical: 12 }, button: { backgroundColor: c.orange, padding: 15, borderRadius: 12, alignItems: 'center', marginVertical: 15 }, buttonText: { fontSize: 14, fontWeight: '700', color: c.white } });
