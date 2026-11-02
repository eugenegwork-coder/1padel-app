import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Linking, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { Language } from './schedule';
import { eventDate, eventPrice } from './schedule';
import { AuthError, PlayerRequestError } from './auth';
import type { PartnerPayload } from './auth';
import {
  BookingError, bookingQuote, cancellationDeadline, isPairAmericanoEvent, createPairBooking,
} from './pairBooking';
import type { PairSnapshot, PairReceipt, PartnerCandidate, LookingForPartnerEntry } from './pairBooking';
import { pairCopy } from './pairCopy';
import { messages } from './copy';
import { colors as c } from './theme';

type Mode = 'partner' | 'search' | 'later' | null;
type NewPartnerField = 'firstName' | 'lastName' | 'whatsapp' | 'telegram';

export default function PairBookingScreen({ tournamentId, booking, language, profileName, profileId, onClose, onMyEvents }: {
  tournamentId: number; booking: ReturnType<typeof createPairBooking>; language: Language; profileName: string; profileId: number;
  onClose: () => void; onMyEvents: () => void;
}) {
  const t = pairCopy[language];
  const [snapshot, setSnapshot] = useState<PairSnapshot | null>(null);
  const [receipt, setReceipt] = useState<PairReceipt | null>(null);
  const [error, setError] = useState<AuthError | null>(null);
  const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(true);
  const [accepted, setAccepted] = useState(false); const [uncertain, setUncertain] = useState(false);
  const [uncertainChecked, setUncertainChecked] = useState(false);
  const [phone, setPhone] = useState(''); const [telegram, setTelegram] = useState('');
  const [mode, setMode] = useState<Mode>(null);
  const [partnerTab, setPartnerTab] = useState<'existing' | 'new'>('existing');
  const [query, setQuery] = useState(''); const [candidates, setCandidates] = useState<PartnerCandidate[]>([]); const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<PartnerCandidate | null>(null);
  const [searchError, setSearchError] = useState(false);
  const [firstName, setFirstName] = useState(''); const [lastName, setLastName] = useState(''); const [whatsapp, setWhatsapp] = useState(''); const [newTelegram, setNewTelegram] = useState('');
  const [shareContacts, setShareContacts] = useState(false);
  const [lookingList, setLookingList] = useState<LookingForPartnerEntry[] | null>(null);
  const [proposedIds, setProposedIds] = useState<number[]>([]);
  // LFPT-0721: подсказки существующего игрока во время ввода нового партнёра — поиск
  // независимо по каждому из четырёх полей (имя/фамилия/WhatsApp/Telegram), результаты
  // объединяются по id (как на сайте, tournament-details.js).
  const [newPartnerResults, setNewPartnerResults] = useState<Record<NewPartnerField, PartnerCandidate[]>>({ firstName: [], lastName: [], whatsapp: [], telegram: [] });
  const [newPartnerSearchError, setNewPartnerSearchError] = useState(false);
  const newPartnerTimers = useRef<Record<NewPartnerField, ReturnType<typeof setTimeout> | null>>({ firstName: null, lastName: null, whatsapp: null, telegram: null });
  const running = useRef(false); const version = useRef(0); const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearNewPartnerSuggestions() {
    setNewPartnerResults({ firstName: [], lastName: [], whatsapp: [], telegram: [] }); setNewPartnerSearchError(false);
    (Object.keys(newPartnerTimers.current) as NewPartnerField[]).forEach(field => { const timer = newPartnerTimers.current[field]; if (timer) clearTimeout(timer); newPartnerTimers.current[field] = null; });
  }
  function resetChoices() {
    setMode(null); setPartnerTab('existing'); setQuery(''); setCandidates([]); setSelected(null); setSearchError(false);
    setFirstName(''); setLastName(''); setWhatsapp(''); setNewTelegram(''); setShareContacts(false);
    setLookingList(null); setProposedIds([]); clearNewPartnerSuggestions();
  }
  function searchNewPartnerField(field: NewPartnerField, value: string) {
    const timer = newPartnerTimers.current[field];
    if (timer) clearTimeout(timer);
    const trimmed = value.trim();
    const meetsMinLength = field === 'whatsapp' ? trimmed.replace(/\D/g, '').length >= 4 : trimmed.length >= 2;
    if (!meetsMinLength) { setNewPartnerResults(prev => ({ ...prev, [field]: [] })); return; }
    newPartnerTimers.current[field] = setTimeout(() => {
      booking.searchPartners(tournamentId, trimmed)
        .then(result => { setNewPartnerResults(prev => ({ ...prev, [field]: result })); setNewPartnerSearchError(false); })
        .catch(() => setNewPartnerSearchError(true));
    }, 400);
  }
  function selectNewPartnerSuggestion(candidate: PartnerCandidate) {
    setSelected(candidate); setFirstName(''); setLastName(''); setWhatsapp(''); setNewTelegram('');
    clearNewPartnerSuggestions();
  }
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
  async function loadLooking() {
    try { setLookingList(await booking.lookingForPartner(tournamentId, profileId)); } catch { /* lista secundaria: su fallo no bloquea el flujo principal */ }
  }
  async function check() {
    const started = version.current;
    await perform(async () => {
      const next = await booking.reconcile(tournamentId);
      if (started !== version.current) return;
      setSnapshot(next.snapshot); setReceipt(next.receipt); setAccepted(false); setUncertain(next.uncertain); setUncertainChecked(next.uncertain);
      if (next.snapshot.registration.status === 'SOLO_SEARCH' || next.snapshot.registration.status === 'SOLO_ADD_LATER') await loadLooking();
    });
  }
  useEffect(() => { version.current++; resetChoices(); void check(); return () => { version.current++; }; }, [booking, tournamentId]);
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (query.trim().length < 2) { setCandidates([]); setSearching(false); setSearchError(false); return; }
    setSearching(true);
    searchTimer.current = setTimeout(() => {
      booking.searchPartners(tournamentId, query).then(result => { setCandidates(result); setSearching(false); setSearchError(false); }).catch(() => { setCandidates([]); setSearching(false); setSearchError(true); });
    }, 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [query, booking, tournamentId]);

  const needContact = snapshot?.hasContact === false || error instanceof PlayerRequestError && error.needContact || error?.code === 'NEED_CONTACT';
  const needLevel = error instanceof PlayerRequestError && error.needLevel;
  const event = snapshot?.event;
  const open = !!event && event.registrationOpen && event.status === 'REGISTRO_ABIERTO' && Date.parse(event.startsAt) > Date.now();
  const pair = !!event && isPairAmericanoEvent(event);
  const reg = snapshot?.registration ?? null;
  const addingPartner = !!reg?.registered && (reg.status === 'SOLO_SEARCH' || reg.status === 'SOLO_ADD_LATER');
  const showPartnerForm = mode === 'partner' || addingPartner;
  const showShare = !!receipt && !!reg?.hasRegisteredPartner;
  let errorText = t.unavailable;
  if (error?.code === 'CHANGED') errorText = t.changed;
  if (error?.code === 'CLOSED') errorText = t.closed;
  if (error?.code === 'NOT_PAIR') errorText = t.notPair;
  if (error?.code === 'EXISTING') errorText = t.existing;
  if (error?.code === 'FORBIDDEN') errorText = t.forbidden;
  if (error?.code === 'REVIEW_REQUIRED') errorText = t.review;
  if (needContact) errorText = t.contactHint;
  if (needLevel) errorText = t.needLevel;
  if (error instanceof PlayerRequestError && !needLevel && !needContact) errorText = error.detail || t.rejected;

  async function external(url: string) { try { await Linking.openURL(url); } catch { setError(new AuthError('UNAVAILABLE')); } }
  function partnerPayload(): PartnerPayload | null {
    if (selected) return { isExistingUser: true, existingUserId: selected.id, nombre: selected.nombre, apellido: selected.apellido };
    if (firstName.trim() && lastName.trim() && whatsapp.trim()) return { isExistingUser: false, nombre: firstName.trim(), apellido: lastName.trim(), telefono: whatsapp.trim(), ...(newTelegram.trim() ? { telegramUsername: newTelegram.trim() } : {}) };
    return null;
  }
  function submitPartner() {
    const partner = partnerPayload();
    if (!snapshot || !accepted || !partner) return;
    const started = version.current;
    void perform(async () => {
      const result = addingPartner
        ? await booking.addPartnerNow(tournamentId, bookingQuote(snapshot.event), partner)
        : await booking.joinWithPartner(tournamentId, bookingQuote(snapshot.event), partner);
      if (started !== version.current) return;
      const fresh = await booking.load(tournamentId);
      if (started === version.current) { setSnapshot(fresh); setReceipt(result); setAccepted(false); }
    });
  }
  function submitSolo(soloType: 'SEARCH' | 'ADD_LATER') {
    if (!snapshot || !accepted) return;
    const started = version.current;
    void perform(async () => {
      await booking.joinSolo(tournamentId, bookingQuote(snapshot.event), soloType, soloType === 'SEARCH' ? shareContacts : false);
      if (started !== version.current) return;
      const next = await booking.reconcile(tournamentId);
      if (started !== version.current) return;
      setSnapshot(next.snapshot); setReceipt(next.receipt); setAccepted(false); setUncertain(next.uncertain); setUncertainChecked(next.uncertain);
      await loadLooking();
    });
  }
  function propose(entry: LookingForPartnerEntry) {
    const started = version.current;
    void perform(async () => {
      await booking.proposePair(tournamentId, entry.registrationId);
      if (started === version.current) setProposedIds(ids => [...ids, entry.registrationId]);
    });
  }
  function shareUrl() { return event ? `${new URL(event.websiteUrl).origin}/app/?event=${tournamentId}` : null; }
  async function shareWhatsapp() { const url = shareUrl(); if (url) await external(`https://wa.me/?text=${encodeURIComponent(`${t.shareMessage}: ${url}`)}`); }
  async function shareTelegram() { const url = shareUrl(); if (url) await external(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(t.shareMessage)}`); }

  function partnerForm() {
    // addPartnerNow (completar una inscripción SOLO_* ya existente) llama a .../add-partner: para un
    // compañero NUEVO (sin cuenta) ese endpoint usa el flujo legado PARTNER_INVITED por token de email
    // (addPartnerToSoloRegistration, rama "else" — no el registro inmediato de LFPT-0687 que sí usa
    // .../register). Como esta pantalla nunca pide el email del compañero, ese flujo no podría
    // completarse jamás: la pestaña "compañero nuevo" solo se ofrece en el registro inicial.
    return <View style={s.card}>
      <Text style={s.sectionTitle}>{addingPartner ? t.addPartnerTitle : t.modeHasPartner}</Text>
      {selected && <View style={[s.candidateRow, s.candidateSelected]}>
        <Text style={s.fact}>{selected.nombreCompleto}</Text>
        <TouchableOpacity accessibilityRole="button" onPress={() => setSelected(null)}><Text style={s.link}>✕</Text></TouchableOpacity>
      </View>}
      {!addingPartner && <View style={s.tabRow}>
        <TouchableOpacity accessibilityRole="tab" accessibilityState={{ selected: partnerTab === 'existing' }} onPress={() => setPartnerTab('existing')} style={[s.tab, partnerTab === 'existing' && s.tabActive]}><Text style={[s.tabText, partnerTab === 'existing' && s.tabTextActive]}>{t.searchLabel}</Text></TouchableOpacity>
        <TouchableOpacity accessibilityRole="tab" accessibilityState={{ selected: partnerTab === 'new' }} onPress={() => setPartnerTab('new')} style={[s.tab, partnerTab === 'new' && s.tabActive]}><Text style={[s.tabText, partnerTab === 'new' && s.tabTextActive]}>{t.orNewPartner}</Text></TouchableOpacity>
      </View>}
      {(partnerTab === 'existing' || addingPartner) && <>
        <TextInput accessibilityLabel={t.searchLabel} value={query} onChangeText={value => { setQuery(value); setSelected(null); }} editable={!busy} style={s.input} placeholder={t.searchPlaceholder} />
        {searching && <Text style={s.body}>{t.searching}</Text>}
        {!searching && query.trim().length >= 2 && candidates.length === 0 && <Text style={searchError ? s.error : s.body}>{searchError ? t.searchError : t.noResults}</Text>}
        {candidates.map(candidate => <TouchableOpacity key={candidate.id} accessibilityRole="button" onPress={() => setSelected(candidate)} style={[s.candidateRow, selected?.id === candidate.id && s.candidateSelected]}>
          <Text style={s.fact}>{candidate.nombreCompleto}</Text>
          {selected?.id === candidate.id ? <Text style={s.link}>✓</Text> : <Text style={s.link}>{t.selectPartner}</Text>}
        </TouchableOpacity>)}
        {addingPartner && <Text style={s.hint}>{t.addPartnerSearchOnlyHint}</Text>}
      </>}
      {!addingPartner && partnerTab === 'new' && <>
        <Text style={s.label}>{t.firstName}</Text><TextInput accessibilityLabel={t.firstName} value={firstName} onChangeText={value => { setFirstName(value); searchNewPartnerField('firstName', value); }} editable={!busy} style={s.input} />
        <Text style={s.label}>{t.lastName}</Text><TextInput accessibilityLabel={t.lastName} value={lastName} onChangeText={value => { setLastName(value); searchNewPartnerField('lastName', value); }} editable={!busy} style={s.input} />
        <Text style={s.label}>{t.whatsapp}</Text><TextInput accessibilityLabel={t.whatsapp} keyboardType="phone-pad" value={whatsapp} onChangeText={value => { setWhatsapp(value); searchNewPartnerField('whatsapp', value); }} editable={!busy} style={s.input} placeholder="+54…" />
        <Text style={s.label}>{t.telegramOptional}</Text><TextInput accessibilityLabel={t.telegramOptional} autoCapitalize="none" autoCorrect={false} value={newTelegram} onChangeText={value => { setNewTelegram(value); searchNewPartnerField('telegram', value); }} editable={!busy} style={s.input} placeholder="@username" />
        {newPartnerSearchError && <Text style={s.error}>{t.searchError}</Text>}
        {!newPartnerSearchError && newPartnerSuggestions().length > 0 && <View style={s.card}>
          <Text style={s.hint}>{t.newPartnerSuggestionsTitle}</Text>
          {newPartnerSuggestions().map(candidate => <TouchableOpacity key={candidate.id} accessibilityRole="button" onPress={() => selectNewPartnerSuggestion(candidate)} style={s.candidateRow}>
            <Text style={s.fact}>{candidate.nombreCompleto}</Text><Text style={s.link}>{t.selectPartner}</Text>
          </TouchableOpacity>)}
        </View>}
        <Text style={s.hint}>{t.requiredFields}</Text>
      </>}
    </View>;
  }
  function newPartnerSuggestions(): PartnerCandidate[] {
    const byId = new Map<number, PartnerCandidate>();
    [...newPartnerResults.firstName, ...newPartnerResults.lastName, ...newPartnerResults.whatsapp, ...newPartnerResults.telegram]
      .forEach(candidate => byId.set(candidate.id, candidate));
    return [...byId.values()];
  }
  function lookingForPartnerList() {
    return <View style={s.card}>
      <Text style={s.sectionTitle}>{t.lookingForPartnerTitle}</Text>
      {lookingList === null && <ActivityIndicator color={c.orange} />}
      {lookingList?.length === 0 && <Text style={s.body}>{t.lookingForPartnerEmpty}</Text>}
      {lookingList?.map(entry => <View key={entry.registrationId} style={s.candidateRow}>
        <Text style={s.fact}>{entry.playerName}{entry.nivel ? ` · ${entry.nivel.replaceAll('_', '/')}` : ''}</Text>
        {proposedIds.includes(entry.registrationId)
          ? <Text style={s.body}>{t.proposalSent}</Text>
          : <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => propose(entry)} style={s.textButton}><Text style={s.link}>{t.proposeButton}</Text></TouchableOpacity>}
      </View>)}
    </View>;
  }

  return <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View style={s.top}><TouchableOpacity accessibilityRole="button" onPress={onClose} style={s.back}><Text style={s.link}>‹ {t.back}</Text></TouchableOpacity><Text accessibilityRole="header" style={s.title}>{t.title}</Text></View>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
      {loading && <View style={s.state}><ActivityIndicator color={c.orange} /><Text style={s.body}>{t.loading}</Text></View>}
      {receipt && <View style={[s.notice, receipt.status === 'WAITLIST' && s.amber]}>
        <Text accessibilityRole="header" style={s.result}>{receipt.existing ? t.already : receipt.status === 'CONFIRMED' ? t.confirmed : t.waiting}</Text>
        <Text style={s.body}>{receipt.status === 'CONFIRMED' ? t.confirmedBody : t.waitBody}</Text>
        {receipt.waitlistPosition != null && <Text style={s.fact}>{t.position}: {receipt.waitlistPosition}</Text>}
        {reg?.hasRegisteredPartner && <Text style={s.fact}>{t.partner}: {reg.partnerFirstName} {reg.partnerLastName}</Text>}
        {!reg?.hasRegisteredPartner && <Text style={s.body}>{t.noPartnerYet}</Text>}
        {showShare && <View style={s.shareRow}>
          <TouchableOpacity accessibilityRole="button" onPress={() => void shareWhatsapp()} style={s.textButton}><Text style={s.link}>{t.shareWhatsapp}</Text></TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" onPress={() => void shareTelegram()} style={s.textButton}><Text style={s.link}>{t.shareTelegram}</Text></TouchableOpacity>
        </View>}
      </View>}
      {uncertain && !receipt && <View style={[s.notice, s.amber]}><Text style={s.result}>{t.uncertain}</Text><Text style={s.body}>{t.uncertainBody}</Text>{uncertainChecked && <Text style={s.body}>{t.unconfirmed}</Text>}</View>}
      {event && <View style={s.card}><Text style={s.eventTitle}>{messages[language][event.type]}</Text><Text style={s.body}>{messages[language][event.gender]}{event.level ? ` · ${event.level.replaceAll('_', '/')}` : ''}</Text><Text style={s.fact}>{eventDate(event.startsAt, event.timeZone, language)}</Text><Text style={s.body}>{event.club.name}</Text>{event.club.address && <Text style={s.body}>{event.club.address}</Text>}<View style={s.priceRow}><Text style={s.body}>{t.price}</Text><Text style={s.price}>{eventPrice(event, language)}</Text></View></View>}
      {!loading && event && !receipt && !uncertain && <>
        <View style={s.card}><Text style={s.label}>{t.person}</Text><Text style={s.fact}>{profileName}</Text></View>
        {!pair && <Text accessibilityRole="alert" style={s.error}>{t.notPair}</Text>}
        {pair && !open && <Text accessibilityRole="alert" style={s.error}>{t.closed}</Text>}
        {pair && open && !needContact && !needLevel && error?.code !== 'EXISTING' && <>
          {!reg?.registered && mode === null && <View style={s.card}>
            <Text style={s.sectionTitle}>{t.modeTitle}</Text>
            <TouchableOpacity accessibilityRole="button" onPress={() => setMode('partner')} style={s.modeRow}><Text style={s.fact}>{t.modeHasPartner}</Text><Text style={s.body}>{t.modeHasPartnerHint}</Text></TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" onPress={() => setMode('search')} style={s.modeRow}><Text style={s.fact}>{t.modeSearch}</Text><Text style={s.body}>{t.modeSearchHint}</Text></TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" onPress={() => setMode('later')} style={s.modeRow}><Text style={s.fact}>{t.modeAddLater}</Text><Text style={s.body}>{t.modeAddLaterHint}</Text></TouchableOpacity>
          </View>}
          {!reg?.registered && mode !== null && <TouchableOpacity accessibilityRole="button" onPress={() => setMode(null)} style={s.back}><Text style={s.link}>‹ {t.modeTitle}</Text></TouchableOpacity>}
          {showPartnerForm && partnerForm()}
          {mode === 'search' && !reg?.registered && <View style={s.card}>
            <TouchableOpacity accessibilityRole="checkbox" accessibilityState={{ checked: shareContacts }} onPress={() => setShareContacts(value => !value)} style={s.checkRow}><View style={[s.checkbox, shareContacts && s.checked]}><Text style={s.check}>{shareContacts ? '✓' : ''}</Text></View><Text style={s.consent}>{t.shareContactsLabel}</Text></TouchableOpacity>
          </View>}
          {mode === 'later' && !reg?.registered && <View style={s.card}><Text style={s.body}>{t.addLaterDeadline}</Text></View>}
          {addingPartner && <>{reg?.status === 'SOLO_ADD_LATER' && <View style={s.card}><Text style={s.body}>{t.addLaterDeadline}</Text></View>}{lookingForPartnerList()}</>}
        </>}
        {needContact && <View style={s.card}><Text style={s.sectionTitle}>{t.contact}</Text><Text style={s.body}>{t.contactHint}</Text><Text style={s.label}>{t.phone}</Text><TextInput accessibilityLabel={t.phone} keyboardType="phone-pad" value={phone} onChangeText={setPhone} editable={!busy} style={s.input} placeholder="+54…" /><Text style={s.label}>{t.telegram}</Text><TextInput accessibilityLabel={t.telegram} autoCapitalize="none" autoCorrect={false} value={telegram} onChangeText={setTelegram} editable={!busy} style={s.input} placeholder="@username" /><Button title={t.saveContact} disabled={busy} onPress={() => {
          const started = version.current;
          void perform(async () => { await booking.saveContact({ telefono: phone, telegramUsername: telegram }); const next = await booking.load(tournamentId); if (started === version.current) { setSnapshot(next); setAccepted(false); setPhone(''); setTelegram(''); } });
        }} /></View>}
        {needLevel && <View style={s.notice}><Text style={s.body}>{t.needLevel}</Text><Button secondary title={t.profile} onPress={() => void external('https://1-padel.com/perfil')} /></View>}
        {pair && open && !needContact && !needLevel && error?.code !== 'EXISTING' && (mode !== null || addingPartner) && <View style={s.card}><Text style={s.sectionTitle}>{t.rules}</Text><Text style={s.label}>{t.cancellation}</Text><Text style={s.fact}>{eventDate(cancellationDeadline(event), event.timeZone, language)}</Text><Text style={s.body}>{t.finance}</Text><Text style={s.body}>{t.arrival}</Text></View>}
        {pair && open && !needContact && !needLevel && error?.code !== 'EXISTING' && (mode !== null || addingPartner) && <TouchableOpacity accessibilityRole="checkbox" accessibilityState={{ checked: accepted, disabled: busy }} disabled={busy} onPress={() => setAccepted(value => !value)} style={s.checkRow}><View style={[s.checkbox, accepted && s.checked]}><Text style={s.check}>{accepted ? '✓' : ''}</Text></View><Text style={s.consent}>{t.consent}</Text></TouchableOpacity>}
      </>}
      {error && !uncertain && !needLevel && !(error.code === 'CLOSED' && !open) && !(error.code === 'NOT_PAIR' && !pair) && <Text accessibilityRole="alert" style={s.error}>{errorText}</Text>}
      {!loading && (error || uncertain || needLevel) && !receipt && <Button secondary title={t.retry} disabled={busy} onPress={() => void check()} />}
      {!loading && event && (uncertain || !pair || !open || error?.code === 'EXISTING') && <Button secondary title={t.site} onPress={() => void external(event.websiteUrl)} />}
    </ScrollView>
    <View style={s.footer}><View style={s.footerInner}>{receipt || error?.code === 'EXISTING' ? <Button title={t.myEvents} onPress={onMyEvents} /> : (mode === 'partner' || addingPartner) ? <Button title={busy ? t.sending : event?.available === 0 ? t.waitlist : t.join} disabled={busy || loading || !accepted || !partnerPayload() || !pair || !open} onPress={submitPartner} />
      : mode === 'search' ? <Button title={busy ? t.sending : t.joinSolo} disabled={busy || loading || !accepted || !pair || !open} onPress={() => submitSolo('SEARCH')} />
      : mode === 'later' ? <Button title={busy ? t.sending : t.joinSolo} disabled={busy || loading || !accepted || !pair || !open} onPress={() => submitSolo('ADD_LATER')} />
      : null}</View></View>
  </KeyboardAvoidingView>;
}
function Button({ title, onPress, disabled = false, secondary = false }: { title: string; onPress: () => void; disabled?: boolean; secondary?: boolean }) {
  return <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[s.button, secondary && s.secondary, disabled && s.disabled]}><Text style={[s.buttonText, secondary && s.secondaryText]}>{title}</Text></TouchableOpacity>;
}
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.background }, top: { paddingHorizontal: 20, paddingBottom: 14, backgroundColor: c.white, borderBottomWidth: 1, borderColor: c.line }, back: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }, link: { color: c.green, fontSize: 12, fontWeight: '700', lineHeight: 19 }, title: { color: c.ink, fontSize: 24, fontWeight: '800', letterSpacing: -0.6 },
  content: { width: '100%', maxWidth: 520, alignSelf: 'center', padding: 20, gap: 14, paddingBottom: 26 }, card: { backgroundColor: c.white, padding: 18, borderRadius: 18, borderWidth: 1, borderColor: c.line }, eventTitle: { fontSize: 25, fontWeight: '800', letterSpacing: -0.6, color: c.ink, lineHeight: 31 }, sectionTitle: { fontSize: 17, lineHeight: 24, fontWeight: '800', color: c.ink, marginBottom: 8 }, label: { color: c.muted, fontSize: 11, lineHeight: 17, marginTop: 10 }, body: { fontSize: 13, lineHeight: 21, color: c.muted, marginTop: 7 }, fact: { color: c.ink, fontSize: 14, lineHeight: 22, fontWeight: '700', marginTop: 8 }, hint: { color: c.muted, fontSize: 11, lineHeight: 17, marginTop: 10 }, priceRow: { borderTopWidth: 1, borderColor: c.line, marginTop: 16, paddingTop: 12, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10 }, price: { color: c.ink, fontSize: 21, fontWeight: '800' },
  input: { borderWidth: 1, borderColor: c.line, borderRadius: 11, paddingHorizontal: 12, minHeight: 49, color: c.ink, fontSize: 16, marginTop: 5, marginBottom: 8 }, notice: { backgroundColor: c.greenPale, borderRadius: 15, padding: 18 }, amber: { backgroundColor: c.amberPale }, result: { color: c.ink, fontSize: 23, fontWeight: '800', lineHeight: 29 }, state: { padding: 25, alignItems: 'center', gap: 10 }, error: { color: '#A13F31', fontSize: 13, lineHeight: 21 },
  checkRow: { flexDirection: 'row', gap: 10, minHeight: 48, paddingVertical: 9 }, checkbox: { width: 22, height: 22, borderWidth: 1, borderColor: c.muted, borderRadius: 6, alignItems: 'center', justifyContent: 'center', marginTop: 1 }, checked: { backgroundColor: c.green, borderColor: c.green }, check: { color: c.white, fontSize: 15, fontWeight: '800' }, consent: { flex: 1, color: c.ink, fontSize: 13, lineHeight: 21 },
  footer: { backgroundColor: c.white, borderTopWidth: 1, borderColor: c.line, paddingHorizontal: 20, paddingTop: 11, paddingBottom: 12 }, footerInner: { width: '100%', maxWidth: 480, alignSelf: 'center' }, button: { backgroundColor: c.orange, minHeight: 50, borderRadius: 13, padding: 12, alignItems: 'center', justifyContent: 'center', marginTop: 8 }, buttonText: { color: c.white, fontSize: 14, lineHeight: 21, fontWeight: '800', textAlign: 'center' }, secondary: { backgroundColor: c.white, borderWidth: 1, borderColor: c.line }, secondaryText: { color: c.ink }, disabled: { opacity: 0.4 }, textButton: { minHeight: 44, justifyContent: 'center', marginTop: 9 },
  tabRow: { flexDirection: 'row', gap: 8, marginBottom: 10 }, tab: { flex: 1, minHeight: 40, borderRadius: 10, borderWidth: 1, borderColor: c.line, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 }, tabActive: { borderColor: c.ink, backgroundColor: c.ink }, tabText: { color: c.muted, fontSize: 12, fontWeight: '700', textAlign: 'center' }, tabTextActive: { color: c.white },
  candidateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderTopWidth: 1, borderColor: c.line, paddingTop: 10, marginTop: 10 }, candidateSelected: { opacity: 0.6 },
  modeRow: { borderTopWidth: 1, borderColor: c.line, paddingVertical: 12, marginTop: 4 },
  shareRow: { flexDirection: 'row', gap: 16, marginTop: 10 },
});
