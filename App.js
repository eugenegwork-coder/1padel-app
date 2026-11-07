import React, { useEffect, useState } from 'react';
import {
  Linking, Platform, ScrollView, StatusBar, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import PlayerScreen from './src/PlayerScreen';
import LoginScreen, { loginCopy } from './src/LoginScreen';
import MyEventsScreen from './src/MyEventsScreen';
import { AuthProvider, useAuth } from './src/AuthContext';
import { messages, organizerMessages } from './src/copy';
import { colors as COLORS } from './src/theme';
import IndividualBookingScreen from './src/IndividualBookingScreen';
import PairBookingScreen from './src/PairBookingScreen';
import { readBookingIntent, saveBookingIntent } from './src/bookingIntent';
import IndividualBookingLab from './src/IndividualBookingLab';

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

function OrganizerScreen({ language }) {
  const copy = organizerMessages[language];
  const [error, setError] = useState(false);

  async function openTournaments() {
    setError(false);
    const origin = process.env.EXPO_PUBLIC_API_BASE_URL
      || (Platform.OS === 'web' ? window.location.origin : 'https://1-padel.com');
    try {
      const url = new URL('/admin/tournaments', origin);
      url.searchParams.set('lang', language);
      if (Platform.OS === 'web') window.location.assign(url.toString());
      else await Linking.openURL(url.toString());
    } catch {
      setError(true);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.intro}>
        <Text style={styles.kicker}>{copy.kicker}</Text>
        <Text style={styles.pageTitle}>{copy.title}</Text>
        <Text style={styles.subtext}>{copy.subtitle}</Text>
      </View>
      <TouchableOpacity accessibilityRole="link" onPress={openTournaments} style={styles.button}>
        <Text style={styles.buttonText}>{copy.open}</Text>
      </TouchableOpacity>
      {error && <Text accessibilityRole="alert" style={styles.error}>{copy.error}</Text>}
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
  const [bookingRevision, setBookingRevision] = useState(0);
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
      <View style={[styles.body, (showLogin || bookingId !== null || pairBookingId !== null) && styles.hidden]}>{mode === 'player' ? <PlayerScreen language={language} onBook={startBooking} onBookPair={startPairBooking} refreshRevision={bookingRevision} /> : mode === 'account' ? (auth.profile ? <MyEventsScreen language={language} onBrowse={() => setMode('player')} /> : <LoginScreen language={language} onClose={() => setMode('player')} onBrowse={() => setMode('player')} onSuccess={() => setMode('account')} />) : <OrganizerScreen language={language} />}</View>
      {showLogin && <LoginScreen language={language} onClose={closeLogin} onBrowse={() => { setMode('player'); closeLogin(); }} onSuccess={completeLogin} />}
      {bookingId !== null && auth.profile && !showLogin && <IndividualBookingScreen key={`${bookingId}:${auth.profile.id}`} tournamentId={bookingId} booking={auth.booking} profileName={auth.profile.name} language={language} onClose={() => { setBookingId(null); setBookingRevision(value => value + 1); }} onMyEvents={() => { setBookingId(null); setMode('account'); }} />}
      {pairBookingId !== null && auth.profile && !showLogin && <PairBookingScreen key={`pair:${pairBookingId}:${auth.profile.id}`} tournamentId={pairBookingId} booking={auth.pairBooking} profileName={auth.profile.name} profileId={auth.profile.id} language={language} onClose={() => { setPairBookingId(null); setBookingRevision(value => value + 1); }} onMyEvents={() => { setPairBookingId(null); setMode('account'); }} />}
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
  button: { backgroundColor: COLORS.orange, minHeight: 48, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  buttonText: { color: COLORS.white, fontSize: 14, fontWeight: '800' },
  error: { color: '#b22920', marginTop: 10, fontSize: 13 },
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
