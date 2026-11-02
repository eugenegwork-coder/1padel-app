import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Linking, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { Language } from './schedule';
import { eventDate, eventPrice } from './schedule';
import { AuthError, PlayerRequestError } from './auth';
import { BookingError, bookingQuote, cancellationDeadline, isIndividualEvent } from './individualBooking';
import type { BookingSnapshot, BookingReceipt, createIndividualBooking } from './individualBooking';
import { bookingCopy } from './bookingCopy';
import { messages } from './copy';
import { colors as c } from './theme';

export default function IndividualBookingScreen({ tournamentId, booking, language, profileName, onClose, onMyEvents, demo = false }: {
  tournamentId: number; booking: ReturnType<typeof createIndividualBooking>; language: Language; profileName: string;
  onClose: () => void; onMyEvents: () => void; demo?: boolean;
}) {
  const t = bookingCopy[language];
  const [snapshot, setSnapshot] = useState<BookingSnapshot | null>(null);
  const [receipt, setReceipt] = useState<BookingReceipt | null>(null);
  const [error, setError] = useState<AuthError | null>(null);
  const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(true);
  const [accepted, setAccepted] = useState(false); const [uncertain, setUncertain] = useState(false);
  const [uncertainChecked, setUncertainChecked] = useState(false);
  const [phone, setPhone] = useState(''); const [telegram, setTelegram] = useState('');
  const running = useRef(false); const version = useRef(0);
  function problem(value: unknown) {
    const issue = value instanceof AuthError ? value : new AuthError('UNAVAILABLE');
    if (issue instanceof BookingError && issue.snapshot) { setSnapshot(issue.snapshot); setAccepted(false); }
    setError(issue); if (issue.code === 'UNCERTAIN') { setUncertain(true); setUncertainChecked(false); }
  }
  async function perform(action: () => Promise<void>) {
    if (running.current) return;
    running.current = true; const started = version.current; setBusy(true); setError(null);
    try { await action(); } catch (value) { if (started === version.current) problem(value); }
    finally { running.current = false; if (started === version.current) { setBusy(false); setLoading(false); } }
  }
  async function check() {
    const started = version.current;
    await perform(async () => {
      const next = await booking.reconcile(tournamentId);
      if (started !== version.current) return;
      setSnapshot(next.snapshot); setReceipt(next.receipt); setAccepted(false); setUncertain(next.uncertain); setUncertainChecked(next.uncertain);
    });
  }
  useEffect(() => { version.current++; void check(); return () => { version.current++; }; }, [booking, tournamentId]);
  const needContact = snapshot?.hasContact === false || error instanceof PlayerRequestError && error.needContact || error?.code === 'NEED_CONTACT';
  const needLevel = error instanceof PlayerRequestError && error.needLevel;
  const event = snapshot?.event;
  const open = !!event && event.registrationOpen && event.status === 'REGISTRO_ABIERTO' && Date.parse(event.startsAt) > Date.now();
  const individual = !!event && isIndividualEvent(event);
  const existing = !!snapshot?.registration;
  let errorText = t.unavailable;
  if (error?.code === 'CHANGED') errorText = t.changed;
  if (error?.code === 'CLOSED') errorText = t.closed;
  if (error?.code === 'NOT_INDIVIDUAL') errorText = t.notIndividual;
  if (error?.code === 'FORBIDDEN') errorText = t.forbidden;
  if (error?.code === 'REVIEW_REQUIRED') errorText = t.review;
  if (needContact) errorText = t.contactHint;
  if (needLevel) errorText = t.needLevel;
  if (error instanceof PlayerRequestError && !needLevel && !needContact) errorText = error.detail || t.rejected;
  async function external(url: string) { try { await Linking.openURL(url); } catch { setError(new AuthError('UNAVAILABLE')); } }
  return <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View style={s.top}><TouchableOpacity accessibilityRole="button" onPress={onClose} style={s.back}><Text style={s.link}>‹ {t.back}</Text></TouchableOpacity><Text accessibilityRole="header" style={s.title}>{t.title}</Text></View>
    {demo && <Text style={s.demo}>{t.demo}</Text>}
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
      {loading && <View style={s.state}><ActivityIndicator color={c.orange} /><Text style={s.body}>{t.loading}</Text></View>}
      {receipt && <View style={[s.notice, receipt.status === 'WAITLIST' && s.amber]}><Text accessibilityRole="header" style={s.result}>{receipt.existing ? t.already : receipt.status === 'CONFIRMED' ? t.confirmed : t.waiting}</Text><Text style={s.body}>{receipt.status === 'CONFIRMED' ? t.confirmedBody : t.waitBody}</Text>{receipt.waitlistPosition != null && <Text style={s.fact}>{t.position}: {receipt.waitlistPosition}</Text>}</View>}
      {uncertain && !receipt && <View style={[s.notice, s.amber]}><Text style={s.result}>{t.uncertain}</Text><Text style={s.body}>{t.uncertainBody}</Text>{uncertainChecked && <Text style={s.body}>{t.unconfirmed}</Text>}</View>}
      {event && <View style={s.card}><Text style={s.eventTitle}>{messages[language][event.type]}</Text><Text style={s.body}>{messages[language][event.gender]}{event.level ? ` · ${event.level.replaceAll('_', '/')}` : ''} · {t.individual}</Text><Text style={s.fact}>{eventDate(event.startsAt, event.timeZone, language)}</Text><Text style={s.body}>{event.club.name}</Text>{event.club.address && <Text style={s.body}>{event.club.address}</Text>}<View style={s.priceRow}><Text style={s.body}>{t.price}</Text><Text style={s.price}>{eventPrice(event, language)}</Text></View></View>}
      {!loading && event && !receipt && !uncertain && <>
        <View style={s.card}><Text style={s.label}>{t.person}</Text><Text style={s.fact}>{profileName}</Text></View>
        {!individual && <Text accessibilityRole="alert" style={s.error}>{t.notIndividual}</Text>}
        {individual && !open && <Text accessibilityRole="alert" style={s.error}>{t.closed}</Text>}
        {existing && <View style={s.notice}><Text style={s.fact}>{t.existing}</Text><Button secondary title={t.myEvents} onPress={onMyEvents} /></View>}
        {individual && open && !existing && needContact && <View style={s.card}><Text style={s.sectionTitle}>{t.contact}</Text><Text style={s.body}>{t.contactHint}</Text><Text style={s.label}>{t.phone}</Text><TextInput accessibilityLabel={t.phone} keyboardType="phone-pad" value={phone} onChangeText={setPhone} editable={!busy} style={s.input} placeholder="+54…" /><Text style={s.label}>{t.telegram}</Text><TextInput accessibilityLabel={t.telegram} autoCapitalize="none" autoCorrect={false} value={telegram} onChangeText={setTelegram} editable={!busy} style={s.input} placeholder="@username" /><Button title={t.saveContact} disabled={busy} onPress={() => {
          const started = version.current;
          void perform(async () => { await booking.saveContact({ telefono: phone, telegramUsername: telegram }); const next = await booking.load(tournamentId); if (started === version.current) { setSnapshot(next); setAccepted(false); setPhone(''); setTelegram(''); } });
        }} /></View>}
        {needLevel && <View style={s.notice}><Text style={s.body}>{t.needLevel}</Text><Button secondary title={t.profile} onPress={() => void external('https://1-padel.com/perfil')} /></View>}
        {individual && open && !existing && <View style={s.card}><Text style={s.sectionTitle}>{t.rules}</Text><Text style={s.label}>{t.cancellation}</Text><Text style={s.fact}>{eventDate(cancellationDeadline(event), event.timeZone, language)}</Text><Text style={s.body}>{event.type === 'CANCHA_ABIERTA' ? t.cancha : t.finance}</Text><Text style={s.body}>{t.arrival}</Text>{['KING_OF_COURT', 'AMERICANO'].includes(event.type) && <Text style={s.body}>{t.late}</Text>}<TouchableOpacity accessibilityRole="link" onPress={() => void external(event.websiteUrl)} style={s.textButton}><Text style={s.link}>{t.conditions} ↗</Text></TouchableOpacity></View>}
        {individual && open && !existing && !needContact && !needLevel && <TouchableOpacity accessibilityRole="checkbox" accessibilityState={{ checked: accepted, disabled: busy }} disabled={busy} onPress={() => setAccepted(value => !value)} style={s.checkRow}><View style={[s.checkbox, accepted && s.checked]}><Text style={s.check}>{accepted ? '✓' : ''}</Text></View><Text style={s.consent}>{t.consent}</Text></TouchableOpacity>}
      </>}
      {error && !uncertain && !needLevel && !(error.code === 'CLOSED' && !open) && !(error.code === 'NOT_INDIVIDUAL' && !individual) && <Text accessibilityRole="alert" style={s.error}>{errorText}</Text>}
      {!loading && (error || uncertain || needLevel) && !receipt && <Button secondary title={t.retry} disabled={busy} onPress={() => void check()} />}
      {!loading && event && (uncertain || !individual || !open) && <Button secondary title={t.site} onPress={() => void external(event.websiteUrl)} />}
    </ScrollView>
    <View style={s.footer}><View style={s.footerInner}>{receipt || existing ? <Button title={t.myEvents} onPress={onMyEvents} /> : <><Text style={s.small}>{t.noPayment}</Text><Button title={busy ? t.sending : event?.available === 0 ? t.waitlist : t.join} disabled={busy || loading || !accepted || !individual || !open || !!needContact || !!needLevel || uncertain} onPress={() => {
      if (!snapshot || !accepted) return;
      const started = version.current;
      void perform(async () => { const result = await booking.join(tournamentId, bookingQuote(snapshot.event)); if (started === version.current) { setReceipt(result); setAccepted(false); } });
    }} /></>}</View></View>
  </KeyboardAvoidingView>;
}
function Button({ title, onPress, disabled = false, secondary = false }: { title: string; onPress: () => void; disabled?: boolean; secondary?: boolean }) {
  return <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[s.button, secondary && s.secondary, disabled && s.disabled]}><Text style={[s.buttonText, secondary && s.secondaryText]}>{title}</Text></TouchableOpacity>;
}
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.background }, top: { paddingHorizontal: 20, paddingBottom: 14, backgroundColor: c.white, borderBottomWidth: 1, borderColor: c.line }, back: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }, link: { color: c.green, fontSize: 12, fontWeight: '700', lineHeight: 19 }, title: { color: c.ink, fontSize: 24, fontWeight: '800', letterSpacing: -0.6 },
  content: { width: '100%', maxWidth: 520, alignSelf: 'center', padding: 20, gap: 14, paddingBottom: 26 }, card: { backgroundColor: c.white, padding: 18, borderRadius: 18, borderWidth: 1, borderColor: c.line }, eventTitle: { fontSize: 25, fontWeight: '800', letterSpacing: -0.6, color: c.ink, lineHeight: 31 }, sectionTitle: { fontSize: 17, lineHeight: 24, fontWeight: '800', color: c.ink, marginBottom: 8 }, label: { color: c.muted, fontSize: 11, lineHeight: 17, marginTop: 10 }, body: { fontSize: 13, lineHeight: 21, color: c.muted, marginTop: 7 }, fact: { color: c.ink, fontSize: 14, lineHeight: 22, fontWeight: '700', marginTop: 8 }, priceRow: { borderTopWidth: 1, borderColor: c.line, marginTop: 16, paddingTop: 12, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10 }, price: { color: c.ink, fontSize: 21, fontWeight: '800' },
  input: { borderWidth: 1, borderColor: c.line, borderRadius: 11, paddingHorizontal: 12, minHeight: 49, color: c.ink, fontSize: 16, marginTop: 5, marginBottom: 8 }, notice: { backgroundColor: c.greenPale, borderRadius: 15, padding: 18 }, amber: { backgroundColor: c.amberPale }, result: { color: c.ink, fontSize: 23, fontWeight: '800', lineHeight: 29 }, state: { padding: 25, alignItems: 'center', gap: 10 }, error: { color: '#A13F31', fontSize: 13, lineHeight: 21 }, small: { color: c.muted, fontSize: 11, lineHeight: 18, textAlign: 'center', marginBottom: 7 }, demo: { padding: 10, textAlign: 'center', fontSize: 11, color: c.amber, backgroundColor: c.amberPale },
  checkRow: { flexDirection: 'row', gap: 10, minHeight: 48, paddingVertical: 9 }, checkbox: { width: 22, height: 22, borderWidth: 1, borderColor: c.muted, borderRadius: 6, alignItems: 'center', justifyContent: 'center', marginTop: 1 }, checked: { backgroundColor: c.green, borderColor: c.green }, check: { color: c.white, fontSize: 15, fontWeight: '800' }, consent: { flex: 1, color: c.ink, fontSize: 13, lineHeight: 21 },
  footer: { backgroundColor: c.white, borderTopWidth: 1, borderColor: c.line, paddingHorizontal: 20, paddingTop: 11, paddingBottom: 12 }, footerInner: { width: '100%', maxWidth: 480, alignSelf: 'center' }, button: { backgroundColor: c.orange, minHeight: 50, borderRadius: 13, padding: 12, alignItems: 'center', justifyContent: 'center', marginTop: 8 }, buttonText: { color: c.white, fontSize: 14, lineHeight: 21, fontWeight: '800', textAlign: 'center' }, secondary: { backgroundColor: c.white, borderWidth: 1, borderColor: c.line }, secondaryText: { color: c.ink }, disabled: { opacity: 0.4 }, textButton: { minHeight: 44, justifyContent: 'center', marginTop: 9 },
});
