import React, { useEffect, useState } from 'react';
import {
  Platform, ScrollView, StatusBar, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import PlayerScreen from './src/PlayerScreen';
import LoginScreen, { loginCopy } from './src/LoginScreen';
import MyEventsScreen from './src/MyEventsScreen';
import { AuthProvider, useAuth } from './src/AuthContext';
import { messages, organizerMessages } from './src/copy';
import { calculateRanking, validateResult } from './src/scoring';
import { colors as COLORS } from './src/theme';
import IndividualBookingScreen from './src/IndividualBookingScreen';
import PairBookingScreen from './src/PairBookingScreen';
import { readBookingIntent, saveBookingIntent } from './src/bookingIntent';
import IndividualBookingLab from './src/IndividualBookingLab';

const players = ['Анна', 'Борис', 'Клара', 'Денис'];
const demoCourt = [0, 1, 2, 3];

function Button({ title, onPress, secondary = false, disabled = false, style }) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, secondary && styles.buttonSecondary, disabled && styles.buttonDisabled, style]}
    >
      <Text style={[styles.buttonText, secondary && styles.buttonSecondaryText]}>{title}</Text>
    </TouchableOpacity>
  );
}

function Chip({ title, active, onPress }) {
  return (
    <TouchableOpacity accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{title}</Text>
    </TouchableOpacity>
  );
}

function TabIcon({ organizer, active, account }) {
  const color = active ? COLORS.ink : COLORS.muted;
  if (account) return <View accessible={false} style={styles.accountIcon}>
    <View style={[styles.accountHead, { borderColor: color }]} />
    <View style={[styles.accountShoulders, { borderColor: color }]} />
  </View>;
  return <View accessible={false} style={[styles.navIcon, { borderColor: color }]}>
    <View style={[organizer ? styles.courtMiddle : styles.calendarLine, { backgroundColor: color }]} />
    {organizer ? <View style={[styles.courtNet, { backgroundColor: color }]} /> : <View style={styles.calendarDots}>
      {[0, 1, 2].map(dot => <View key={dot} style={[styles.calendarDot, { backgroundColor: color }]} />)}
    </View>}
  </View>;
}

function OrganizerScreen({ savedResult, onSaveResult, language }) {
  const c = organizerMessages[language];
  const [winningPair, setWinningPair] = useState(savedResult?.winners[0] === 2 ? 'B' : 'A');
  const [score, setScore] = useState(String(savedResult?.winnerScore ?? 12));
  const [error, setError] = useState(false);
  const ranking = calculateRanking(players, savedResult ? [savedResult] : []);
  const winners = winningPair === 'A' ? [0, 1] : [2, 3];

  function save() {
    const winnerScore = score.trim() === '' ? NaN : Number(score);
    const issue = validateResult(demoCourt, winners, winnerScore);
    if (issue) {
      setError(true);
      return;
    }
    onSaveResult({ courtId: 1, players: demoCourt, winners, winnerScore, total: 21 });
    setError(false);
  }

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.intro}>
        <Text style={styles.kicker}>{c.kicker}</Text>
        <Text style={styles.pageTitle}>{c.title}</Text>
        <Text style={styles.subtext}>{c.subtitle}</Text>
      </View>
      <View style={styles.notice}>
        <Text style={styles.noticeTitle}>{c.notice}</Text>
        <Text style={styles.noticeText}>{c.note}</Text>
      </View>
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <Text style={styles.eyebrow}>{c.round}</Text>
          <Text style={[styles.status, savedResult && styles.statusDone]}>{savedResult ? c.saved : c.pending}</Text>
        </View>
        <Text style={styles.cardTitle}>King of Court</Text>
        <View style={styles.pairBox}>
          <Text style={styles.pairLabel}>{c.pairA}</Text>
          <Text style={styles.pairNames}>Анна · Борис</Text>
        </View>
        <View style={styles.pairBox}>
          <Text style={styles.pairLabel}>{c.pairB}</Text>
          <Text style={styles.pairNames}>Клара · Денис</Text>
        </View>
        <Text style={styles.fieldLabel}>{c.winners}</Text>
        <View style={styles.chips}>
          <Chip title={c.pairA} active={winningPair === 'A'} onPress={() => setWinningPair('A')} />
          <Chip title={c.pairB} active={winningPair === 'B'} onPress={() => setWinningPair('B')} />
        </View>
        <Text style={styles.fieldLabel}>{c.score}</Text>
        <TextInput
          accessibilityLabel={c.score}
          keyboardType="number-pad"
          maxLength={2}
          value={score}
          onChangeText={value => { setScore(value); setError(false); }}
          style={styles.input}
        />
        <Text style={styles.inputHint}>{c.loser}: {score.trim() !== '' && Number.isInteger(Number(score)) && Number(score) >= 0 && Number(score) <= 21 ? 21 - Number(score) : '—'}</Text>
        {error ? <Text accessibilityRole="alert" style={styles.error}>{c.invalid}</Text> : null}
        <Button title={savedResult ? c.update : c.save} onPress={save} style={styles.saveButton} />
        {savedResult ? <Button title={c.clear} secondary onPress={() => { onSaveResult(null); setError(false); }} style={styles.clearButton} /> : null}
      </View>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{c.table}</Text>
        <Text style={styles.tableHint}>{c.rule}</Text>
        {ranking.map((player, index) => (
          <View key={player.index} style={[styles.rankRow, index === ranking.length - 1 && styles.rankRowLast]}>
            <Text style={styles.rankPosition}>{index + 1}</Text>
            <Text style={styles.rankName}>{player.name}</Text>
            <Text style={styles.rankScore}>{player.points + player.bonus}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

export default function App() {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && new URL(window.location.href).searchParams.get('screen') === 'individual-booking-test') return <IndividualBookingLab />;
  return <AuthProvider><AppContent /></AuthProvider>;
}

function AppContent() {
  const auth = useAuth();
  // После входа через Google страница возвращается на /app/#accessToken=... — сразу в «Мои мероприятия».
  const [mode, setMode] = useState(() => Platform.OS === 'web' && typeof window !== 'undefined' && window.location.hash.includes('accessToken=') ? 'account' : 'player');
  const [showLogin, setShowLogin] = useState(() => Platform.OS === 'web' && typeof window !== 'undefined' && new URL(window.location.href).searchParams.get('screen') === 'login');
  const [language, setLanguage] = useState('ru');
  const [bookingId, setBookingId] = useState(null);
  const [pairBookingId, setPairBookingId] = useState(null);
  const [pendingIntent, setPendingIntent] = useState(readBookingIntent);
  function completeLogin() {
    if (pendingIntent !== null) {
      if (pendingIntent.kind === 'pair') setPairBookingId(pendingIntent.id); else setBookingId(pendingIntent.id);
      setPendingIntent(null); setMode('player'); saveBookingIntent(null);
    }
    else setMode('account');
    setShowLogin(false);
  }
  useEffect(() => { if (auth.profile && (showLogin || pendingIntent !== null)) completeLogin(); }, [auth.profile?.id, showLogin, pendingIntent]);
  useEffect(() => { if (!auth.profile && !auth.restoring && bookingId !== null) { setBookingId(null); setPendingIntent({ id: bookingId, kind: 'individual' }); saveBookingIntent(bookingId, 'individual'); setShowLogin(true); } }, [auth.profile?.id, auth.restoring, bookingId]);
  useEffect(() => { if (!auth.profile && !auth.restoring && pairBookingId !== null) { setPairBookingId(null); setPendingIntent({ id: pairBookingId, kind: 'pair' }); saveBookingIntent(pairBookingId, 'pair'); setShowLogin(true); } }, [auth.profile?.id, auth.restoring, pairBookingId]);
  function startBooking(event) {
    if (auth.profile) setBookingId(event.id);
    else { setPendingIntent({ id: event.id, kind: 'individual' }); saveBookingIntent(event.id, 'individual'); setShowLogin(true); }
  }
  function startPairBooking(event) {
    if (auth.profile) setPairBookingId(event.id);
    else { setPendingIntent({ id: event.id, kind: 'pair' }); saveBookingIntent(event.id, 'pair'); setShowLogin(true); }
  }
  function closeLogin() { setShowLogin(false); setPendingIntent(null); saveBookingIntent(null); }
  const t = messages[language];
  const [savedResult, setSavedResult] = useState(null);
  return (
    <SafeAreaProvider>
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.white} />
      <View style={styles.header}>
        <Text style={styles.brand}>1-PADEL<Text style={styles.brandDot}>.</Text></Text>
        <View style={styles.languages}>
          {['es', 'ru', 'en'].map(value => <TouchableOpacity key={value} accessibilityRole="button"
            accessibilityLabel={value.toUpperCase()} accessibilityState={{ selected: language === value }}
            onPress={() => setLanguage(value)} style={[styles.language, language === value && styles.languageActive]}>
            <Text style={[styles.languageText, language === value && { color: COLORS.ink }]}>{value.toUpperCase()}</Text>
          </TouchableOpacity>)}
        </View>
      </View>
      <View style={[styles.body, (showLogin || bookingId !== null || pairBookingId !== null) && styles.hidden]}>{mode === 'player' ? <PlayerScreen language={language} onBook={startBooking} onBookPair={startPairBooking} /> : mode === 'account' ? (auth.profile ? <MyEventsScreen language={language} onBrowse={() => setMode('player')} /> : <LoginScreen language={language} onClose={() => setMode('player')} onBrowse={() => setMode('player')} onSuccess={() => setMode('account')} />) : <OrganizerScreen language={language} savedResult={savedResult} onSaveResult={setSavedResult} />}</View>
      {showLogin && <LoginScreen language={language} onClose={closeLogin} onBrowse={() => { setMode('player'); closeLogin(); }} onSuccess={completeLogin} />}
      {bookingId !== null && auth.profile && !showLogin && <IndividualBookingScreen key={`${bookingId}:${auth.profile.id}`} tournamentId={bookingId} booking={auth.booking} profileName={auth.profile.name} language={language} onClose={() => setBookingId(null)} onMyEvents={() => { setBookingId(null); setMode('account'); }} />}
      {pairBookingId !== null && auth.profile && !showLogin && <PairBookingScreen key={`pair:${pairBookingId}:${auth.profile.id}`} tournamentId={pairBookingId} booking={auth.pairBooking} profileName={auth.profile.name} profileId={auth.profile.id} language={language} onClose={() => setPairBookingId(null)} onMyEvents={() => { setPairBookingId(null); setMode('account'); }} />}
      {!showLogin && bookingId === null && pairBookingId === null && <View style={styles.tabBar}>
        <TouchableOpacity accessibilityRole="tab" accessibilityState={{ selected: mode === 'player' }}
          onPress={() => setMode('player')} style={[styles.tab, mode === 'player' && styles.tabActive]}>
          <TabIcon active={mode === 'player'} />
          <Text style={[styles.tabText, mode === 'player' && styles.tabTextActive]}>{loginCopy[language].navGames}</Text>
        </TouchableOpacity>
        <TouchableOpacity accessibilityRole="tab" accessibilityState={{ selected: mode === 'organizer' }}
          onPress={() => setMode('organizer')} style={[styles.tab, mode === 'organizer' && styles.tabActive]}>
          <TabIcon organizer active={mode === 'organizer'} />
          <Text style={[styles.tabText, mode === 'organizer' && styles.tabTextActive]}>{t.organizer}</Text>
        </TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={auth.profile ? loginCopy[language].navAccount : loginCopy[language].navLogin} onPress={() => { if (auth.profile) setMode('account'); else setShowLogin(true); }} style={[styles.tab, mode === 'account' && styles.tabActive]}>
          <TabIcon account active={mode === 'account'} />
          <Text style={[styles.tabText, mode === 'account' && styles.tabTextActive]}>{auth.profile ? loginCopy[language].navAccount : loginCopy[language].navLogin}</Text>
        </TouchableOpacity>
      </View>}
    </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.white },
  header: { paddingHorizontal: 20, paddingVertical: 10, borderBottomWidth: 1, borderColor: COLORS.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.white },
  brand: { color: COLORS.ink, fontSize: 23, fontWeight: '900', letterSpacing: -1 },
  brandDot: { color: COLORS.orange },
  languages: { flexDirection: 'row', padding: 3, borderRadius: 13, backgroundColor: COLORS.background },
  language: { minWidth: 39, minHeight: 38, justifyContent: 'center', alignItems: 'center', borderRadius: 10 },
  languageActive: { backgroundColor: COLORS.white },
  languageText: { fontSize: 11, fontWeight: '700', color: COLORS.muted },
  body: { flex: 1, backgroundColor: COLORS.background },
  hidden: { display: 'none' },
  content: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 32, width: '100%', maxWidth: 640, alignSelf: 'center' },
  intro: { marginBottom: 18 },
  kicker: { color: COLORS.orange, fontSize: 11, fontWeight: '900', letterSpacing: 1.4, marginBottom: 8 },
  pageTitle: { color: COLORS.ink, fontSize: 30, lineHeight: 36, fontWeight: '800', letterSpacing: -0.7 },
  subtext: { color: COLORS.muted, fontSize: 15, lineHeight: 22, marginTop: 8 },
  notice: { backgroundColor: COLORS.pale, borderRadius: 14, padding: 16, marginBottom: 22 },
  noticeTitle: { color: COLORS.ink, fontSize: 14, fontWeight: '800', marginBottom: 5 },
  noticeText: { color: '#76584a', fontSize: 13, lineHeight: 20 },
  sectionTitle: { color: COLORS.ink, fontSize: 19, fontWeight: '800', marginBottom: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chip: { paddingHorizontal: 13, paddingVertical: 10, backgroundColor: COLORS.white, borderRadius: 20, borderWidth: 1, borderColor: COLORS.line },
  chipActive: { backgroundColor: COLORS.ink, borderColor: COLORS.ink },
  chipText: { color: COLORS.ink, fontWeight: '700', fontSize: 12 },
  chipTextActive: { color: COLORS.white },
  card: { backgroundColor: COLORS.white, borderRadius: 17, borderWidth: 1, borderColor: COLORS.line, padding: 18, marginBottom: 12 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eyebrow: { color: COLORS.orange, fontWeight: '800', fontSize: 11, letterSpacing: 0.3 },
  cardTitle: { color: COLORS.ink, fontSize: 20, fontWeight: '800', marginTop: 8, marginBottom: 8 },
  button: { backgroundColor: COLORS.orange, minHeight: 48, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  buttonText: { color: COLORS.white, fontSize: 14, fontWeight: '800' },
  buttonSecondary: { backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.line },
  buttonSecondaryText: { color: COLORS.ink },
  buttonDisabled: { opacity: 0.45 },
  status: { color: COLORS.muted, fontSize: 12, fontWeight: '700' },
  statusDone: { color: COLORS.green },
  pairBox: { backgroundColor: COLORS.background, borderRadius: 10, padding: 13, marginTop: 8 },
  pairLabel: { color: COLORS.muted, fontSize: 11, marginBottom: 3 },
  pairNames: { color: COLORS.ink, fontWeight: '800', fontSize: 15 },
  fieldLabel: { color: COLORS.ink, fontSize: 13, fontWeight: '800', marginTop: 20, marginBottom: 10 },
  input: { borderWidth: 1, borderColor: COLORS.line, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 20, color: COLORS.ink },
  inputHint: { color: COLORS.muted, fontSize: 12, marginTop: 8 },
  error: { color: '#b22920', marginTop: 10, fontSize: 13 },
  saveButton: { marginTop: 20 },
  clearButton: { marginTop: 8 },
  tableHint: { color: COLORS.muted, fontSize: 12, lineHeight: 19, marginBottom: 8 },
  rankRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderColor: COLORS.line },
  rankRowLast: { borderBottomWidth: 0 },
  rankPosition: { color: COLORS.orange, fontWeight: '900', width: 30 },
  rankName: { color: COLORS.ink, fontWeight: '700', flex: 1 },
  rankScore: { color: COLORS.ink, fontWeight: '900', fontSize: 17 },
  tabBar: { flexDirection: 'row', gap: 8, borderTopWidth: 1, borderColor: COLORS.line, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8, backgroundColor: COLORS.white },
  tab: { flex: 1, gap: 5, justifyContent: 'center', alignItems: 'center', minHeight: 53, paddingVertical: 7, borderRadius: 14 },
  tabActive: { backgroundColor: COLORS.greenPale },
  tabText: { color: COLORS.muted, fontWeight: '700', fontSize: 11 },
  tabTextActive: { color: COLORS.ink },
  navIcon: { width: 20, height: 19, borderWidth: 1.5, borderRadius: 4 },
  calendarLine: { position: 'absolute', left: 0, right: 0, top: 4, height: 1.5 },
  calendarDots: { flexDirection: 'row', gap: 3, position: 'absolute', top: 10, left: 3 },
  calendarDot: { width: 2, height: 2, borderRadius: 1 },
  courtMiddle: { position: 'absolute', left: 0, right: 0, top: 7, height: 1 },
  courtNet: { position: 'absolute', top: 0, bottom: 0, left: 8, width: 1 },
  accountIcon: { width: 22, height: 20 },
  accountHead: { position: 'absolute', width: 7, height: 7, borderRadius: 4, borderWidth: 1.5, left: 7, top: 0 },
  accountShoulders: { position: 'absolute', width: 18, height: 9, borderWidth: 1.5, borderBottomWidth: 0, borderTopLeftRadius: 9, borderTopRightRadius: 9, left: 2, bottom: 0 },
});
