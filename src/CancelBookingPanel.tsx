import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { Language } from './schedule';
import { eventDate } from './schedule';
import { AuthError, PlayerRequestError } from './auth';
import { BookingError, cancellationDeadline, cancellationQuote, isIndividualEvent } from './individualBooking';
import type { BookingSnapshot, createIndividualBooking } from './individualBooking';
import { bookingCopy } from './bookingCopy';
import { messages } from './copy';
import { colors as c } from './theme';

// Панель встроена в карточку «Моих мероприятий», не отдельный экран: отмена проще записи
// (нет формы контакта/уровня), полноэкранный переход избыточен (LFPT-0666).
export default function CancelBookingPanel({ tournamentId, booking, language, onClose, onCancelled }: {
  tournamentId: number; booking: ReturnType<typeof createIndividualBooking>; language: Language; onClose: () => void; onCancelled: () => void;
}) {
  const t = bookingCopy[language];
  const [snapshot, setSnapshot] = useState<BookingSnapshot | null>(null);
  const [error, setError] = useState<AuthError | null>(null);
  const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(true);
  const [accepted, setAccepted] = useState(false); const [uncertain, setUncertain] = useState(false);
  const [uncertainChecked, setUncertainChecked] = useState(false); const [done, setDone] = useState(false);
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
      const next = await booking.load(tournamentId);
      if (started !== version.current) return;
      setSnapshot(next); setAccepted(false); setUncertain(false); setUncertainChecked(false);
    });
  }
  async function checkCancellation() {
    const started = version.current;
    await perform(async () => {
      const next = await booking.reconcileCancellation(tournamentId);
      if (started !== version.current) return;
      setSnapshot(next.snapshot); setUncertain(next.uncertain); setUncertainChecked(true);
      if (next.cancelled) setDone(true);
    });
  }
  useEffect(() => { version.current++; void check(); return () => { version.current++; }; }, [booking, tournamentId]);
  const event = snapshot?.event;
  const individual = !!event && isIndividualEvent(event);
  const registration = snapshot?.registration;
  const active = !!registration && ['CONFIRMED', 'WAITLIST'].includes(registration.status ?? '');
  const deadlinePassed = !!event && Date.now() >= Date.parse(cancellationDeadline(event));
  let errorText = t.unavailable;
  if (error?.code === 'CHANGED') errorText = t.changed;
  if (error?.code === 'NOT_INDIVIDUAL') errorText = t.notIndividual;
  if (error?.code === 'NO_REGISTRATION') errorText = t.cancelNoRegistration;
  if (error?.code === 'DEADLINE_PASSED') errorText = t.cancelDeadlinePassed;
  if (error?.code === 'FORBIDDEN') errorText = t.forbidden;
  if (error?.code === 'REVIEW_REQUIRED') errorText = t.review;
  if (error instanceof PlayerRequestError) errorText = error.detail || t.cancelRejected;
  async function external(url: string) { try { await Linking.openURL(url); } catch { setError(new AuthError('UNAVAILABLE')); } }
  return <View style={s.panel}>
    <View style={s.top}><Text accessibilityRole="header" style={s.title}>{t.cancelTitle}</Text>
      <TouchableOpacity accessibilityRole="button" onPress={onClose} style={s.closeBtn}><Text style={s.link}>✕</Text></TouchableOpacity></View>
    {loading && <View style={s.state}><ActivityIndicator color={c.orange} /></View>}
    {done && <View style={[s.notice]}><Text style={s.result}>{t.cancelled}</Text><Text style={s.body}>{t.cancelledBody}</Text>
      <Button title={t.myEvents} onPress={onCancelled} /></View>}
    {!done && uncertain && <View style={[s.notice, s.amber]}><Text style={s.result}>{t.cancelUncertain}</Text><Text style={s.body}>{t.cancelUncertainBody}</Text>
      {uncertainChecked && <Text style={s.body}>{t.cancelStillActive}</Text>}
      <Button secondary title={t.retry} disabled={busy} onPress={() => void checkCancellation()} /></View>}
    {!loading && !done && !uncertain && event && <>
      <Text style={s.eventTitle}>{messages[language][event.type]}</Text>
      <Text style={s.fact}>{eventDate(event.startsAt, event.timeZone, language)}</Text>
      {individual && active && <>
        <Text style={s.label}>{t.cancellation}</Text>
        <Text style={s.fact}>{eventDate(cancellationDeadline(event), event.timeZone, language)}</Text>
        <Text style={s.body}>{event.type === 'CANCHA_ABIERTA' ? t.cancha : t.finance}</Text>
      </>}
      {!individual && <Text accessibilityRole="alert" style={s.error}>{t.notIndividual}</Text>}
      {individual && !active && <Text accessibilityRole="alert" style={s.error}>{t.cancelNoRegistration}</Text>}
      {individual && active && deadlinePassed && <Text accessibilityRole="alert" style={s.error}>{t.cancelDeadlinePassed}</Text>}
      {individual && active && !deadlinePassed && <TouchableOpacity accessibilityRole="checkbox" accessibilityState={{ checked: accepted, disabled: busy }} disabled={busy} onPress={() => setAccepted(value => !value)} style={s.checkRow}>
        <View style={[s.checkbox, accepted && s.checked]}><Text style={s.check}>{accepted ? '✓' : ''}</Text></View><Text style={s.consent}>{t.cancelConsent}</Text>
      </TouchableOpacity>}
      <TouchableOpacity accessibilityRole="link" onPress={() => void external(event.websiteUrl)} style={s.textButton}><Text style={s.link}>{t.conditions} ↗</Text></TouchableOpacity>
    </>}
    {error && !uncertain && <Text accessibilityRole="alert" style={s.error}>{errorText}</Text>}
    {!loading && error && !uncertain && !done && <Button secondary title={t.retry} disabled={busy} onPress={() => void check()} />}
    {!loading && !done && !uncertain && individual && active && !deadlinePassed && <View style={s.row}>
      <Button secondary title={t.cancelKeep} disabled={busy} onPress={onClose} />
      <Button title={busy ? t.cancelling : t.cancelConfirm} disabled={busy || !accepted} onPress={() => {
        if (!snapshot || !accepted) return;
        const started = version.current;
        void perform(async () => { await booking.cancel(tournamentId, cancellationQuote(snapshot)); if (started === version.current) setDone(true); });
      }} />
    </View>}
  </View>;
}
function Button({ title, onPress, disabled = false, secondary = false }: { title: string; onPress: () => void; disabled?: boolean; secondary?: boolean }) {
  return <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[s.button, secondary && s.secondary, disabled && s.disabled]}><Text style={[s.buttonText, secondary && s.secondaryText]}>{title}</Text></TouchableOpacity>;
}
const s = StyleSheet.create({
  panel: { marginTop: 10, borderTopWidth: 1, borderColor: c.line, paddingTop: 14, gap: 8 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, title: { color: c.ink, fontSize: 15, fontWeight: '800' }, closeBtn: { minHeight: 32, minWidth: 32, alignItems: 'center', justifyContent: 'center' },
  state: { padding: 14, alignItems: 'center' }, link: { color: c.green, fontWeight: '700', fontSize: 12 },
  eventTitle: { color: c.ink, fontSize: 15, fontWeight: '800' }, fact: { color: c.ink, fontSize: 13, lineHeight: 20, fontWeight: '700', marginTop: 2 },
  label: { color: c.muted, fontSize: 11, lineHeight: 17, marginTop: 6 }, body: { fontSize: 12, lineHeight: 19, color: c.muted, marginTop: 4 },
  notice: { backgroundColor: c.greenPale, borderRadius: 13, padding: 14, gap: 6 }, amber: { backgroundColor: c.amberPale }, result: { color: c.ink, fontSize: 15, fontWeight: '800' },
  error: { color: '#A13F31', fontSize: 12, lineHeight: 19 },
  checkRow: { flexDirection: 'row', gap: 10, minHeight: 40, paddingVertical: 6, alignItems: 'center' }, checkbox: { width: 20, height: 20, borderWidth: 1, borderColor: c.muted, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  checked: { backgroundColor: c.green, borderColor: c.green }, check: { color: c.white, fontSize: 13, fontWeight: '800' }, consent: { flex: 1, color: c.ink, fontSize: 12, lineHeight: 19 },
  textButton: { minHeight: 36, justifyContent: 'center' },
  row: { flexDirection: 'row', gap: 10, marginTop: 4 },
  button: { flex: 1, backgroundColor: c.orange, minHeight: 44, borderRadius: 11, padding: 10, alignItems: 'center', justifyContent: 'center' }, buttonText: { color: c.white, fontSize: 13, lineHeight: 19, fontWeight: '800', textAlign: 'center' },
  secondary: { backgroundColor: c.white, borderWidth: 1, borderColor: c.line }, secondaryText: { color: c.ink }, disabled: { opacity: 0.4 },
});
