import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createScheduleClient, eventDate, eventPrice, ScheduleError, tournamentTypes } from './schedule';
import type { Language, PublicTournament } from './schedule';
import { availableLevels, defaultFilters, filterSchedule } from './filters';
import type { ScheduleFilters } from './filters';
import { messages } from './copy';
import { colors as palette } from './theme';

const isFixture = process.env.EXPO_PUBLIC_PREVIEW_MODE === 'fixtures';
const apiBase = Platform.OS === 'web' ? '' : (process.env.EXPO_PUBLIC_API_BASE_URL || 'https://1-padel.com');

function useResource<T>(load: ((signal: AbortSignal) => Promise<T>) | null) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{ loading: boolean; data: T | null; error: ScheduleError | null }>({ loading: true, data: null, error: null });
  useEffect(() => {
    if (!load) return;
    const controller = new AbortController();
    setState({ loading: true, data: null, error: null });
    load(controller.signal).then(data => {
      if (!controller.signal.aborted) setState({ loading: false, data, error: null });
    }).catch(error => {
      if (!controller.signal.aborted) setState({ loading: false, data: null, error: error instanceof ScheduleError ? error : new ScheduleError('network') });
    });
    return () => controller.abort();
  }, [load, revision]);
  return { ...state, retry: () => setRevision(value => value + 1) };
}

function Action({ title, onPress, secondary = false, disabled = false }: { title: string; onPress: () => void; secondary?: boolean; disabled?: boolean }) {
  return <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={[styles.action, secondary && styles.secondary, disabled && { opacity: 0.45 }]}>
    <Text style={[styles.actionText, secondary && { color: palette.ink }]}>{title}</Text>
  </TouchableOpacity>;
}

function Fact({ title, value }: { title: string; value: string }) {
  return <View style={styles.fact}><Text style={styles.caption}>{title}</Text><Text style={styles.factValue}>{value}</Text></View>;
}

function levelLabel(level: string | null, language: Language) {
  if (!level) return '';
  if (level === 'TODOS') return messages[language].allLevels;
  if (level === 'PRINCIPIANTES') return messages[language].beginners;
  return level.replace(/^SUMA_(\d+)$/, 'Suma $1+').replaceAll('_', ' / ');
}

function FilterChoices({ title, options, value, onChange }: {
  title: string; options: { value: string; label: string }[]; value: string; onChange: (value: string) => void;
}) {
  return <View style={styles.filterSection}>
    <Text accessibilityRole="header" style={styles.filterSectionTitle}>{title}</Text>
    <View style={styles.choiceRow}>
      {options.map(option => <TouchableOpacity key={option.value} accessibilityRole="radio"
        accessibilityLabel={`${title}: ${option.label}`} accessibilityState={{ checked: value === option.value }}
        onPress={() => onChange(option.value)} style={[styles.choice, value === option.value && styles.choiceActive]}>
        <Text style={[styles.choiceText, value === option.value && styles.choiceTextActive]}>{option.label}</Text>
      </TouchableOpacity>)}
    </View>
  </View>;
}

function durationLabel(duration: string | null, language: Language) {
  if (!duration) return '';
  const hours = /^(\d+)(?:\s*[-–]\s*(\d+))?\s*(?:horas?|hours?|ч(?:аса|асов)?\.?)$/i.exec(duration.trim());
  return hours ? `${hours[1]}${hours[2] ? `–${hours[2]}` : ''} ${language === 'ru' ? 'ч' : 'h'}` : duration;
}

function dateParts(event: PublicTournament, language: Language) {
  const date = new Date(event.startsAt);
  const format = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(language, { ...options, timeZone: event.timeZone }).format(date);
  return {
    day: format({ day: 'numeric' }), month: format({ month: 'short' }).replace(/\.$/, ''),
    weekday: format({ weekday: 'short' }).replace(/\.$/, ''),
    time: format({ hour: '2-digit', minute: '2-digit', hour12: false }),
    fullDate: format({ weekday: 'long', day: 'numeric', month: 'long' }),
  };
}

function freeSpots(event: PublicTournament, language: Language) {
  const count = event.available;
  if (language === 'ru') {
    const form = new Intl.PluralRules('ru').select(count);
    const words = event.capacityUnit === 'PAIRS'
      ? { one: 'пара', few: 'пары', many: 'пар', other: 'пары' }
      : { one: 'место', few: 'места', many: 'мест', other: 'места' };
    return `${count} ${words[form as keyof typeof words] ?? words.other}`;
  }
  if (language === 'es') return `${count} ${event.capacityUnit === 'PAIRS' ? count === 1 ? 'pareja' : 'parejas' : count === 1 ? 'cupo' : 'cupos'}`;
  return `${count} ${event.capacityUnit === 'PAIRS' ? count === 1 ? 'pair' : 'pairs' : count === 1 ? 'spot' : 'spots'}`;
}

function Availability({ event, language }: { event: PublicTournament; language: Language }) {
  const t = messages[language];
  const open = event.registrationOpen && event.status !== 'PUBLICADO';
  const scarce = open && event.available > 0 && event.available <= 3;
  const full = open && event.available === 0;
  const label = event.status === 'PUBLICADO' ? t.published : !open ? t.closed : full ? t.waitlistShort : `${t.free}: ${freeSpots(event, language)}`;
  return <View style={[styles.availability, scarce && styles.scarce, (!open || full) && styles.unavailable]}>
    <View style={[styles.statusDot, scarce && { backgroundColor: palette.amber }, (!open || full) && { backgroundColor: palette.muted }]} />
    <Text style={[styles.availabilityText, scarce && { color: palette.amber }, (!open || full) && { color: palette.muted }]}>{label}</Text>
  </View>;
}

export default function PlayerScreen({ language }: { language: Language }) {
  const t = messages[language];
  const client = useMemo(() => createScheduleClient({ baseUrl: apiBase }), []);
  const [filters, setFilters] = useState<ScheduleFilters>({ ...defaultFilters });
  const [draft, setDraft] = useState<ScheduleFilters>({ ...defaultFilters });
  const [filterVisible, setFilterVisible] = useState(false);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const scroll = useRef<ScrollView>(null);
  const listOffset = useRef(0);
  useEffect(() => { scroll.current?.scrollTo({ y: selectedId === null ? listOffset.current : 0, animated: false }); }, [selectedId]);
  const loadList = useCallback((signal: AbortSignal) => client.list(language, signal), [client, language]);
  const list = useResource(loadList);
  const loadDetail = useMemo(() => selectedId === null ? null : (signal: AbortSignal) => client.details(selectedId, language, signal), [client, selectedId, language]);
  const detail = useResource(loadDetail);
  const resource = selectedId === null ? list : detail;
  const events = list.data ?? [];
  const filtered = filterSchedule(events, filters);
  const draftCount = filterSchedule(events, draft).length;
  const filterTags = [
    { key: 'gender', title: t.genderLabel, label: filters.gender === 'all' ? '' : t[filters.gender] },
    { key: 'level', title: t.levelLabel, label: filters.level === 'all' ? '' : levelLabel(filters.level, language) },
    { key: 'type', title: t.format, label: filters.type === 'all' ? '' : t[filters.type] },
    { key: 'modality', title: t.participationLabel, label: filters.modality === 'all' ? '' : filters.modality === 'DOBLES' ? t.doubles : t.single },
  ].filter(tag => tag.label);
  const selected = selectedId !== null && detail.data?.id === selectedId && !detail.loading && !detail.error ? detail.data : null;

  async function openWebsite(url = 'https://1-padel.com/') {
    try { await Linking.openURL(url); } catch { Alert.alert('1‑Padel', t.linkError); }
  }

  function resourceContent() {
    if (resource.loading || (selectedId !== null && detail.data !== null && detail.data.id !== selectedId)) return <View style={styles.state}>
      <ActivityIndicator color={palette.orange} /><Text accessibilityLiveRegion="polite" style={styles.stateBody}>{selectedId === null ? t.loading : t.loadingDetail}</Text>
    </View>;
    if (resource.error) {
      const missing = resource.error.kind === 'not_found';
      return <View style={styles.infoCard}>
        <Text accessibilityRole="header" style={styles.cardTitle}>{missing ? t.notFound : t.errorTitle}</Text>
        <Text accessibilityLiveRegion="polite" style={styles.stateBody}>{missing ? t.notFoundBody : resource.error.kind === 'network' ? t.network : t.error}</Text>
        {!missing && <Action title={t.retry} onPress={resource.retry} />}
        <Action title={t.website} secondary onPress={() => openWebsite()} />
      </View>;
    }
    if (selected) {
      const event = selected;
      const dates = dateParts(event, language);
      const unit = event.capacityUnit === 'PAIRS' ? t.pairs : t.players;
      return <>
        <View style={styles.detailHero}>
          <Text accessibilityRole="header" style={styles.title}>{t[event.type]}</Text>
          <Text style={styles.audience}>{t[event.gender]}{event.level ? ` · ${levelLabel(event.level, language)}` : ''}</Text>
          <Availability event={event} language={language} />
        </View>
        <View style={styles.infoCard}>
          <Text style={styles.caption}>{t.when}</Text>
          <Text style={styles.detailDate}>{dates.fullDate}</Text>
          <Text style={styles.detailTime}>{dates.time}</Text>
          <View style={styles.divider} />
          <Text style={styles.caption}>{t.where}</Text>
          <Text style={styles.clubTitle}>{event.club.name}</Text>
          <Text style={styles.address}>{event.club.address || t.addressMissing}</Text>
          <View style={styles.detailGrid}>
            <View style={styles.gridCell}><Fact title={t.entry} value={event.modality === 'DOBLES' ? t.doubles : t.single} /></View>
            {event.duration && <View style={styles.gridCell}><Fact title={t.duration} value={durationLabel(event.duration, language)} /></View>}
          </View>
          <Fact title={t.availability} value={`${event.occupied} / ${event.capacity} ${unit}`} />
          {event.waitlistCount > 0 && <Fact title={t.reserve} value={String(event.waitlistCount)} />}
          {event.cancellationDeadline && <View style={styles.deadline}>
            <Text style={styles.caption}>{t.cancellation}</Text>
            <Text style={styles.deadlineText}>{eventDate(event.cancellationDeadline, event.timeZone, language)}</Text>
          </View>}
        </View>
        {event.description && <View style={styles.infoCard}>
          <Text style={styles.sectionTitle}>{t.about}</Text>
          <Text numberOfLines={descriptionExpanded ? undefined : 5} style={styles.description}>{event.description}</Text>
          {event.description.length > 200 && <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded: descriptionExpanded }}
            onPress={() => setDescriptionExpanded(value => !value)} style={styles.readMore}>
            <Text style={styles.link}>{descriptionExpanded ? t.readLess : t.readMore}</Text>
          </TouchableOpacity>}
        </View>}
      </>;
    }
    if (list.data?.length === 0) return <View style={styles.infoCard}>
      <Text style={styles.cardTitle}>{t.empty}</Text><Text style={styles.stateBody}>{t.emptyBody}</Text>
      <Action title={t.refresh} onPress={list.retry} />
      <Action title={t.website} secondary onPress={() => openWebsite()} />
    </View>;
    return <>
      <View style={styles.filters}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={t.filtersTitle}
          accessibilityState={{ expanded: filterVisible }} onPress={() => { setDraft({ ...filters }); setFilterVisible(true); }} style={[styles.formatButton, filterTags.length > 0 && styles.filterSelected]}>
          <Text numberOfLines={1} style={styles.filterText}>{t.filtersTitle}{filterTags.length ? ` · ${filterTags.length}` : ''}</Text>
          <Text style={styles.downArrow}>⌄</Text>
        </TouchableOpacity>
        <TouchableOpacity accessibilityRole="checkbox" accessibilityLabel={t.availableOnly} accessibilityState={{ checked: filters.availableOnly }}
          onPress={() => setFilters(value => ({ ...value, availableOnly: !value.availableOnly }))} style={[styles.spotsButton, filters.availableOnly && styles.spotsSelected]}>
          <View style={[styles.checkbox, filters.availableOnly && styles.checkboxSelected]}>{filters.availableOnly && <Text style={styles.checkmark}>✓</Text>}</View>
          <Text style={[styles.spotsText, filters.availableOnly && { color: palette.green }]}>{t.availableOnly}</Text>
        </TouchableOpacity>
      </View>
      {filterTags.length > 0 && <View style={styles.appliedFilters}>
        {filterTags.map(tag => <TouchableOpacity key={tag.key} accessibilityRole="button"
          accessibilityLabel={`${t.removeFilter}: ${tag.title}, ${tag.label}`}
          onPress={() => setFilters(value => ({ ...value, [tag.key]: 'all' }))} style={styles.appliedTag}>
          <Text style={styles.appliedTagText}>{tag.label}</Text><Text style={styles.appliedTagClose}>×</Text>
        </TouchableOpacity>)}
      </View>}
      <View style={styles.listHeading}><Text style={styles.sectionLabel}>{t.nextEvents}</Text><Text style={styles.count}>{filtered.length}</Text></View>
      {filtered.length === 0 && <View style={styles.infoCard}>
        <Text style={styles.cardTitle}>{t.noMatch}</Text><Text style={styles.stateBody}>{t.noMatchBody}</Text>
        <Action title={t.resetFilters} onPress={() => setFilters({ ...defaultFilters })} />
      </View>}
      {filtered.map(event => {
        const dates = dateParts(event, language);
        return <TouchableOpacity key={event.id} accessibilityRole="button"
          accessibilityLabel={`${t[event.type]}, ${t[event.gender]}${event.level ? `, ${levelLabel(event.level, language)}` : ''}, ${eventDate(event.startsAt, event.timeZone, language)}`}
          onPress={() => { setDescriptionExpanded(false); setSelectedId(event.id); }} style={styles.eventCard}>
          <View style={styles.eventMain}>
            <View style={styles.dateBlock}>
              <Text style={styles.dateDay}>{dates.day}</Text><Text style={styles.dateMonth}>{dates.month}</Text><Text style={styles.dateWeekday}>{dates.weekday}</Text>
            </View>
            <View style={styles.eventInfo}>
              <View style={styles.eventTitleRow}><Text accessibilityRole="header" style={styles.eventTitle}>{t[event.type]}</Text><Text style={styles.chevron}>›</Text></View>
              <Text style={styles.audience}>{t[event.gender]}{event.level ? ` · ${levelLabel(event.level, language)}` : ''}</Text>
              <Text style={styles.eventTime}>{dates.time}{event.duration ? `  ·  ${durationLabel(event.duration, language)}` : ''}</Text>
              <Text style={styles.club}>{event.club.name}{event.modality === 'DOBLES' ? ` · ${t.doubles}` : ''}</Text>
            </View>
          </View>
          <View style={styles.eventFooter}><Text style={styles.price}>{eventPrice(event, language)}</Text><Availability event={event} language={language} /></View>
        </TouchableOpacity>;
      })}
    </>;
  }

  return <View style={styles.screen}>
    <ScrollView ref={scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"
      scrollEventThrottle={32} onScroll={event => { if (selectedId === null) listOffset.current = event.nativeEvent.contentOffset.y; }}
      refreshControl={<RefreshControl tintColor={palette.orange} refreshing={resource.loading} onRefresh={resource.retry} />}>
      {selectedId === null ? <View style={styles.intro}>
        <View style={styles.introCopy}><Text accessibilityRole="header" style={styles.title}>{t.title}</Text><Text style={styles.subtitle}>{t.subtitle}</Text></View>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={t.refresh} onPress={list.retry} style={styles.refreshButton}><Text style={styles.refreshIcon}>↻</Text></TouchableOpacity>
      </View> : <TouchableOpacity accessibilityRole="button" onPress={() => setSelectedId(null)} style={styles.back}><Text style={styles.link}>{t.back}</Text></TouchableOpacity>}
      {isFixture && <View style={styles.notice}><Text style={styles.noticeTitle}>{t.fixture}</Text><Text style={styles.stateBody}>{t.fixtureNote}</Text></View>}
      {resourceContent()}
    </ScrollView>
    {selected && <View style={styles.bookingBar}>
      <View style={styles.bookingInner}>
        <View style={styles.bookingRow}>
          <View style={styles.bookingPrice}><Text style={styles.caption}>{t.priceFrom}</Text><Text style={styles.detailPrice}>{eventPrice(selected, language)}</Text></View>
          <View style={styles.bookingAction}><Action title={selected.registrationOpen ? selected.available > 0 ? t.book : t.waitlist : t.openEvent}
            disabled={isFixture} onPress={() => openWebsite(selected.websiteUrl)} /></View>
        </View>
        <Text style={styles.bookingNote}>{t.siteNote}</Text>
      </View>
    </View>}
    <Modal visible={filterVisible} transparent animationType="slide" onRequestClose={() => setFilterVisible(false)}>
      <View style={styles.modalOverlay}>
        <Pressable accessibilityRole="button" accessibilityLabel={t.close} onPress={() => setFilterVisible(false)} style={StyleSheet.absoluteFill} />
        <SafeAreaView edges={['bottom']} style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeading}><Text accessibilityRole="header" style={styles.sheetTitle}>{t.filtersTitle}</Text>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={t.close} onPress={() => setFilterVisible(false)} style={styles.closeButton}><Text style={styles.closeIcon}>×</Text></TouchableOpacity>
          </View>
          <ScrollView bounces={false} contentContainerStyle={styles.filterScroll}>
            <FilterChoices title={t.genderLabel} value={draft.gender}
              options={['all', 'MASCULINO', 'FEMENINO', 'MIXTO'].map(value => ({ value, label: value === 'all' ? t.all : t[value as PublicTournament['gender']] }))}
              onChange={gender => setDraft(value => ({ ...value, gender: gender as ScheduleFilters['gender'], level: gender === value.gender ? value.level : 'all' }))} />
            <FilterChoices title={t.levelLabel} value={draft.level}
              options={[{ value: 'all', label: t.all }, ...availableLevels(events, draft.gender).map(value => ({ value, label: levelLabel(value, language) }))]}
              onChange={level => setDraft(value => ({ ...value, level }))} />
            <Text style={styles.filterHint}>{t.allLevelsHint}</Text>
            <FilterChoices title={t.format} value={draft.type}
              options={[{ value: 'all', label: t.all }, ...tournamentTypes.map(value => ({ value, label: t[value] }))]}
              onChange={type => setDraft(value => ({ ...value, type: type as ScheduleFilters['type'] }))} />
            <FilterChoices title={t.participationLabel} value={draft.modality}
              options={[{ value: 'all', label: t.all }, { value: 'INDIVIDUAL', label: t.single }, { value: 'DOBLES', label: t.doubles }]}
              onChange={modality => setDraft(value => ({ ...value, modality: modality as ScheduleFilters['modality'] }))} />
          </ScrollView>
          <View style={styles.filterFooter}>
            <TouchableOpacity accessibilityRole="button" onPress={() => setDraft({ ...defaultFilters, availableOnly: filters.availableOnly })} style={styles.resetButton}><Text style={styles.link}>{t.resetFilters}</Text></TouchableOpacity>
            <View style={styles.filterApply}><Action title={`${t.showEvents} · ${draftCount}`} onPress={() => { setFilters({ ...draft }); setFilterVisible(false); listOffset.current = 0; scroll.current?.scrollTo({ y: 0, animated: false }); }} /></View>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 20, width: '100%', maxWidth: 640, alignSelf: 'center' },
  intro: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 20 },
  introCopy: { flex: 1 }, title: { color: palette.ink, fontSize: 29, lineHeight: 35, fontWeight: '800', letterSpacing: -0.9, marginBottom: 6 },
  subtitle: { color: palette.muted, fontSize: 13, lineHeight: 19 },
  refreshButton: { width: 44, height: 44, borderRadius: 14, backgroundColor: palette.white, borderWidth: 1, borderColor: palette.line, justifyContent: 'center', alignItems: 'center' },
  refreshIcon: { color: palette.ink, fontSize: 26, lineHeight: 30 },
  filters: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  appliedFilters: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 16 },
  appliedTag: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 36, paddingHorizontal: 10, borderRadius: 10, backgroundColor: '#E5EBE4' },
  appliedTagText: { color: palette.ink, fontSize: 11, fontWeight: '700' }, appliedTagClose: { color: palette.muted, fontSize: 17 },
  formatButton: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 46, borderRadius: 13, backgroundColor: palette.white, borderWidth: 1, borderColor: palette.line, paddingHorizontal: 12 },
  filterSelected: { borderColor: palette.ink }, filterText: { flex: 1, color: palette.ink, fontWeight: '700', fontSize: 13 }, downArrow: { color: palette.muted, fontSize: 21, marginTop: -5 },
  spotsButton: { flexDirection: 'row', gap: 7, alignItems: 'center', minHeight: 46, borderRadius: 13, paddingHorizontal: 11, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.white },
  spotsSelected: { borderColor: palette.green, backgroundColor: palette.greenPale }, spotsText: { fontSize: 12, color: palette.muted, fontWeight: '700' },
  checkbox: { height: 16, width: 16, borderRadius: 5, borderWidth: 1, borderColor: palette.muted, alignItems: 'center', justifyContent: 'center' },
  checkboxSelected: { backgroundColor: palette.green, borderColor: palette.green }, checkmark: { fontSize: 12, lineHeight: 14, color: palette.white, fontWeight: '800' },
  listHeading: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }, sectionLabel: { color: palette.muted, fontWeight: '700', fontSize: 12 },
  count: { color: palette.ink, fontSize: 11, fontWeight: '800', backgroundColor: '#E5EBE4', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7 },
  eventCard: { borderRadius: 19, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.white, padding: 15, marginBottom: 12 },
  eventMain: { flexDirection: 'row', gap: 13 }, eventInfo: { flex: 1, minWidth: 0 },
  dateBlock: { width: 51, alignSelf: 'flex-start', alignItems: 'center', borderRadius: 12, backgroundColor: palette.greenPale, paddingVertical: 9 },
  dateDay: { fontSize: 25, lineHeight: 28, fontWeight: '800', letterSpacing: -1, color: palette.ink },
  dateMonth: { fontSize: 10, lineHeight: 15, fontWeight: '800', textTransform: 'uppercase', color: palette.ink },
  dateWeekday: { fontSize: 10, lineHeight: 14, color: palette.muted },
  eventTitleRow: { flexDirection: 'row', gap: 5, alignItems: 'flex-start' },
  eventTitle: { flex: 1, fontSize: 20, lineHeight: 25, fontWeight: '800', color: palette.ink, letterSpacing: -0.5 }, chevron: { color: '#8D9E92', fontSize: 25, lineHeight: 25 },
  audience: { color: palette.muted, fontSize: 12, lineHeight: 19, marginTop: 3 },
  eventTime: { color: palette.ink, fontSize: 13, lineHeight: 20, fontWeight: '700', marginTop: 7 }, club: { color: palette.muted, fontSize: 12, lineHeight: 19 },
  eventFooter: { borderTopWidth: 1, borderColor: '#EDF0EB', paddingTop: 12, marginTop: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  price: { color: palette.ink, fontSize: 15, lineHeight: 21, fontWeight: '800', letterSpacing: -0.3 },
  availability: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: palette.greenPale, borderRadius: 8, paddingVertical: 5, paddingHorizontal: 8, alignSelf: 'flex-start', flexShrink: 1 },
  availabilityText: { color: palette.green, fontWeight: '700', fontSize: 11, lineHeight: 16, flexShrink: 1 }, statusDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: palette.green },
  scarce: { backgroundColor: palette.amberPale }, unavailable: { backgroundColor: '#F0F2EF' },
  state: { alignItems: 'center', paddingVertical: 36, gap: 10 }, stateBody: { color: palette.muted, fontSize: 14, lineHeight: 22, marginBottom: 12 },
  link: { color: palette.ink, fontWeight: '700', fontSize: 13 }, back: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start', marginBottom: 10 },
  infoCard: { backgroundColor: palette.white, borderRadius: 19, borderWidth: 1, borderColor: palette.line, padding: 18, marginBottom: 14 },
  cardTitle: { fontSize: 20, lineHeight: 27, color: palette.ink, fontWeight: '800', marginBottom: 10 },
  detailHero: { gap: 4, marginBottom: 20 }, detailDate: { color: palette.ink, fontSize: 16, lineHeight: 23, fontWeight: '700', marginTop: 6 },
  detailTime: { color: palette.ink, fontSize: 31, lineHeight: 39, fontWeight: '800', letterSpacing: -0.9 }, divider: { height: 1, backgroundColor: palette.line, marginVertical: 17 },
  caption: { color: palette.muted, fontSize: 11, lineHeight: 16 }, clubTitle: { color: palette.ink, fontSize: 18, lineHeight: 25, fontWeight: '800', marginTop: 5 },
  address: { color: palette.muted, fontSize: 13, lineHeight: 21, marginTop: 3 },
  detailGrid: { flexDirection: 'row', gap: 10, marginTop: 13 }, gridCell: { flex: 1 }, fact: { paddingVertical: 10 },
  factValue: { color: palette.ink, fontSize: 14, fontWeight: '700', marginTop: 3, lineHeight: 21 },
  deadline: { borderTopWidth: 1, borderColor: palette.line, marginTop: 8, paddingTop: 13 }, deadlineText: { color: palette.muted, fontSize: 12, lineHeight: 19, marginTop: 2 },
  sectionTitle: { color: palette.ink, fontWeight: '800', fontSize: 17, marginBottom: 12 }, description: { color: palette.muted, fontSize: 13, lineHeight: 22 }, readMore: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  bookingBar: { backgroundColor: palette.white, borderTopWidth: 1, borderColor: palette.line, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10 },
  bookingInner: { width: '100%', maxWidth: 608, alignSelf: 'center' }, bookingRow: { flexDirection: 'row', gap: 12, alignItems: 'center', flexWrap: 'wrap' },
  bookingPrice: { flexGrow: 1 }, detailPrice: { color: palette.ink, fontSize: 17, lineHeight: 24, fontWeight: '800', marginTop: 2 }, bookingAction: { flexGrow: 1 },
  bookingNote: { color: palette.muted, fontSize: 10, lineHeight: 15, marginTop: 8 },
  action: { minHeight: 48, backgroundColor: palette.orange, paddingVertical: 12, paddingHorizontal: 13, justifyContent: 'center', alignItems: 'center', borderRadius: 13 },
  actionText: { color: palette.white, fontWeight: '800', fontSize: 12, lineHeight: 18, textAlign: 'center' }, secondary: { backgroundColor: palette.white, borderWidth: 1, borderColor: palette.line, marginTop: 8 },
  notice: { backgroundColor: palette.pale, borderRadius: 13, padding: 16, marginBottom: 18 }, noticeTitle: { fontWeight: '800', color: palette.ink, marginBottom: 6 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15, 36, 27, 0.38)' },
  sheet: { maxHeight: '85%', backgroundColor: palette.white, borderTopLeftRadius: 25, borderTopRightRadius: 25, paddingHorizontal: 20, paddingBottom: 16, width: '100%', maxWidth: 640, alignSelf: 'center' },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: palette.line, marginTop: 10, marginBottom: 4, alignSelf: 'center' },
  sheetHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 }, sheetTitle: { color: palette.ink, fontSize: 20, fontWeight: '800' },
  closeButton: { height: 44, width: 44, alignItems: 'center', justifyContent: 'center' }, closeIcon: { color: palette.muted, fontSize: 27 },
  filterScroll: { paddingBottom: 8 }, filterSection: { marginTop: 16 },
  filterSectionTitle: { color: palette.ink, fontSize: 14, fontWeight: '800', marginBottom: 10 },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  choice: { minHeight: 40, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 11, borderWidth: 1, borderColor: palette.line, justifyContent: 'center', backgroundColor: palette.white },
  choiceActive: { borderColor: palette.ink, backgroundColor: palette.ink },
  choiceText: { color: palette.muted, fontSize: 12, lineHeight: 19, fontWeight: '600' }, choiceTextActive: { color: palette.white, fontWeight: '700' },
  filterHint: { color: palette.muted, fontSize: 11, lineHeight: 17, marginTop: 10, marginBottom: 2 },
  filterFooter: { flexDirection: 'row', alignItems: 'center', gap: 16, borderTopWidth: 1, borderColor: palette.line, paddingTop: 12, marginTop: 10 },
  resetButton: { minHeight: 48, justifyContent: 'center' }, filterApply: { flex: 1 },
});
