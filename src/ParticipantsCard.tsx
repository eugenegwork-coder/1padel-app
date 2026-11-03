import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import type { Language } from './schedule';
import { parseParticipants } from './participants';
import { colors } from './theme';
const copy = {
  ru: { title: 'Участники', reserve: 'Резерв', empty: 'В основном списке пока нет участников', unavailable: 'Список участников пока недоступен в приложении.', website: 'Посмотреть участников на сайте', seeking: 'Ищет партнёра', more: 'Показать всех', less: 'Свернуть' },
  es: { title: 'Participantes', reserve: 'Lista de espera', empty: 'Aún no hay participantes en la lista principal', unavailable: 'La lista de participantes aún no está disponible en la app.', website: 'Ver participantes en el sitio', seeking: 'Busca compañero', more: 'Ver todos', less: 'Ver menos' },
  en: { title: 'Participants', reserve: 'Waitlist', empty: 'No participants in the main list yet', unavailable: 'The participant list is not yet available in the app.', website: 'View participants on the website', seeking: 'Looking for a partner', more: 'Show all', less: 'Show less' },
};
export default function ParticipantsCard({ value, language, onWebsite }: { value: unknown; language: Language; onWebsite: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const roster = parseParticipants(value), t = copy[language];
  return <View style={s.card}>
    <Text accessibilityRole="header" style={s.title}>{t.title}</Text>
    {!roster ? <><Text style={s.muted}>{t.unavailable}</Text><Pressable accessibilityRole="link" onPress={onWebsite} style={s.button}><Text style={s.link}>{t.website}</Text></Pressable></> : <>
      {roster.confirmed.length === 0 && <Text style={s.muted}>{t.empty}</Text>}
      {(['confirmed', 'waitlist'] as const).map(group => <View key={group}>
        {group === 'waitlist' && roster[group].length > 0 && <Text accessibilityRole="header" style={s.subtitle}>{t.reserve}</Text>}
        {(expanded ? roster[group] : roster[group].slice(0, 6)).map((entry, index) => <View key={entry.id} style={s.row}>
          <Text style={s.number}>{index + 1}</Text><View style={s.names}>{entry.names.map((name, i) => <Text key={i} style={s.name}>{name}</Text>)}{entry.seekingPartner && <Text style={s.muted}>{t.seeking}</Text>}</View>
        </View>)}
      </View>)}
      {(roster.confirmed.length > 6 || roster.waitlist.length > 6) && <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded(!expanded)} style={s.button}><Text style={s.link}>{expanded ? t.less : t.more}</Text></Pressable>}
    </>}
  </View>;
}
const s = StyleSheet.create({
  card: { backgroundColor: colors.white, borderColor: colors.line, borderWidth: 1, borderRadius: 24, padding: 22, marginBottom: 16 },
  title: { fontSize: 24, fontWeight: '700', color: colors.ink, marginBottom: 16 },
  subtitle: { fontSize: 18, fontWeight: '600', color: colors.ink, marginTop: 20, marginBottom: 8 },
  muted: { fontSize: 15, lineHeight: 23, color: colors.muted },
  row: { flexDirection: 'row', paddingVertical: 12, borderBottomWidth: 1, borderColor: colors.line, gap: 12 },
  number: { width: 26, color: colors.muted, fontSize: 16 }, names: { flex: 1, gap: 4 },
  name: { fontSize: 17, color: colors.ink, fontWeight: '600' },
  button: { minHeight: 44, justifyContent: 'center', marginTop: 8 }, link: { color: colors.green, fontSize: 16, fontWeight: '600' },
});
