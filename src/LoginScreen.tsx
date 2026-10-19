import React, { useEffect, useRef, useState } from 'react';
import { Image, KeyboardAvoidingView, Linking, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Language } from './schedule';
import { AuthError } from './auth';
import { secureAuthContext, useAuth } from './AuthContext';
import { colors } from './theme';

export const loginCopy = {
  "ru": {
    "navLogin": "Войти",
    "navGames": "Игры",
    "navAccount": "Мои мероприятия",
    "back": "Назад",
    "badge": "Аккаунт сайта",
    "title": "Войти в 1‑Padel",
    "subtitle": "Используйте тот же аккаунт, что и на сайте. Ваши записи появятся здесь.",
    "google": "Продолжить с Google",
    "emailDivider": "или по почте",
    "email": "Почта",
    "password": "Пароль",
    "forgot": "Забыли пароль?",
    "show": "Показать",
    "hide": "Скрыть",
    "signIn": "Войти",
    "busy": "Подключаем…",
    "newAccount": "Ещё нет аккаунта?",
    "createAccount": "Создать аккаунт",
    "guest": "Смотреть игры без входа",
    "emailError": "Укажите почту в формате name@example.com.",
    "passwordError": "Введите пароль от сайта.",
    "note": "Вход в ваш существующий аккаунт 1‑Padel.",
    "insecure": "Для входа откройте защищённую версию приложения. По этой ссылке Wi‑Fi доступен просмотр игр.",
    "secureLink": "Открыть защищённую версию",
    "googleWait": "В открывшейся вкладке выберите Google, сверьте код и подтвердите аккаунт. Затем вернитесь сюда.",
    "cancel": "Отменить вход",
    "restore": "Повторить подключение"
  },
  "es": {
    "navLogin": "Ingresar",
    "navGames": "Juegos",
    "navAccount": "Mis eventos",
    "back": "Volver",
    "badge": "Tu cuenta de la web",
    "title": "Ingresá a 1‑Padel",
    "subtitle": "Usá la misma cuenta que en la web. Tus inscripciones aparecerán acá.",
    "google": "Continuar con Google",
    "emailDivider": "o con tu correo",
    "email": "Correo electrónico",
    "password": "Contraseña",
    "forgot": "¿La olvidaste?",
    "show": "Mostrar",
    "hide": "Ocultar",
    "signIn": "Ingresar",
    "busy": "Conectando…",
    "newAccount": "¿Todavía no tenés cuenta?",
    "createAccount": "Crear cuenta",
    "guest": "Ver juegos sin ingresar",
    "emailError": "Ingresá un correo con el formato name@example.com.",
    "passwordError": "Ingresá tu contraseña de la web.",
    "note": "Acceso a tu cuenta existente de 1‑Padel.",
    "insecure": "Para ingresar, abrí la versión segura de la aplicación. Este enlace Wi‑Fi permite ver los juegos.",
    "secureLink": "Abrir la versión segura",
    "googleWait": "En la pestaña que se abrió, elegí Google, comprobá el código y confirmá tu cuenta. Después volvé acá.",
    "cancel": "Cancelar acceso",
    "restore": "Reintentar conexión"
  },
  "en": {
    "navLogin": "Sign in",
    "navGames": "Games",
    "navAccount": "My events",
    "back": "Back",
    "badge": "Your website account",
    "title": "Sign in to 1‑Padel",
    "subtitle": "Use the same account as on the website. Your registrations will appear here.",
    "google": "Continue with Google",
    "emailDivider": "or use your email",
    "email": "Email",
    "password": "Password",
    "forgot": "Forgot password?",
    "show": "Show",
    "hide": "Hide",
    "signIn": "Sign in",
    "busy": "Connecting…",
    "newAccount": "New to 1‑Padel?",
    "createAccount": "Create an account",
    "guest": "Browse games without signing in",
    "emailError": "Use an email in the format name@example.com.",
    "passwordError": "Enter your website password.",
    "note": "Sign in to your existing 1‑Padel account.",
    "insecure": "Open the secure app to sign in. This Wi‑Fi link is available for browsing games.",
    "secureLink": "Open the secure app",
    "googleWait": "Choose Google in the new tab, check the code and confirm your account. Then return here.",
    "cancel": "Cancel sign-in",
    "restore": "Retry connection"
  }
} satisfies Record<Language, Record<string, string>>;
const errors: Record<Language, Record<string, string>> = {
  "ru": {
    "INVALID_CREDENTIALS": "Неверная почта или пароль.",
    "ACCOUNT_UNAVAILABLE": "Подтвердите почту или проверьте доступ к аккаунту на сайте.",
    "PLAYER_REQUIRED": "Это аккаунт организатора. Для личных записей нужен аккаунт игрока.",
    "SESSION_EXPIRED": "Срок входа истёк. Войдите ещё раз.",
    "LOGIN_REQUEST_EXPIRED": "Время входа через Google истекло. Попробуйте ещё раз.",
    "RATE_LIMIT": "Слишком много попыток. Подождите минуту и повторите.",
    "NETWORK": "Не удалось связаться с сайтом. Проверьте интернет и повторите.",
    "UNAVAILABLE": "Вход пока недоступен. Обновление сервера может ещё выполняться. Повторите позже.",
    "INSECURE": "Откройте защищённую версию приложения для входа.",
    "POPUP_BLOCKED": "Браузер не открыл вкладку Google. Разрешите всплывающие окна и повторите.",
    "STORAGE": "Не удалось сохранить вход на устройстве. Попробуйте ещё раз."
  },
  "es": {
    "INVALID_CREDENTIALS": "Correo o contraseña incorrectos.",
    "ACCOUNT_UNAVAILABLE": "Confirmá tu correo o revisá tu cuenta en la web.",
    "PLAYER_REQUIRED": "Esta es una cuenta de organizador. Necesitás una cuenta de jugador para ver inscripciones personales.",
    "SESSION_EXPIRED": "La sesión venció. Volvé a ingresar.",
    "LOGIN_REQUEST_EXPIRED": "El acceso con Google venció. Intentá de nuevo.",
    "RATE_LIMIT": "Demasiados intentos. Esperá un minuto y volvé a intentar.",
    "NETWORK": "No pudimos conectar con la web. Revisá tu conexión e intentá de nuevo.",
    "UNAVAILABLE": "El acceso no está disponible todavía. El servidor puede estar actualizándose. Intentá más tarde.",
    "INSECURE": "Abrí la versión segura para ingresar.",
    "POPUP_BLOCKED": "Permití las ventanas emergentes y volvé a intentar el acceso con Google.",
    "STORAGE": "No pudimos guardar la sesión en el dispositivo. Intentá de nuevo."
  },
  "en": {
    "INVALID_CREDENTIALS": "Incorrect email or password.",
    "ACCOUNT_UNAVAILABLE": "Confirm your email or check your account on the website.",
    "PLAYER_REQUIRED": "This is an organizer account. Use a player account to view personal registrations.",
    "SESSION_EXPIRED": "Your session expired. Please sign in again.",
    "LOGIN_REQUEST_EXPIRED": "Google sign-in timed out. Try again.",
    "RATE_LIMIT": "Too many attempts. Wait a minute and try again.",
    "NETWORK": "Could not connect to the website. Check your connection and try again.",
    "UNAVAILABLE": "Sign-in is not available yet. The server may still be updating. Try again later.",
    "INSECURE": "Open the secure app to sign in.",
    "POPUP_BLOCKED": "Allow pop-ups and try Google sign-in again.",
    "STORAGE": "Could not save the session on this device. Try again."
  }
};
export function authErrorText(language: Language, code: string) { return errors[language][code] ?? errors[language].UNAVAILABLE; }

export default function LoginScreen({ language, onClose, onBrowse, onSuccess }: { language: Language; onClose: () => void; onBrowse: () => void; onSuccess: () => void }) {
  const t = loginCopy[language];
  const auth = useAuth();
  const insets = useSafeAreaInsets();
  const passwordInput = useRef<TextInput>(null);
  const mounted = useRef(true);
  const running = useRef(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function signIn(google: boolean) {
    if (running.current) return;
    if (!secureAuthContext) { setError('INSECURE'); return; }
    if (!google && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError('email'); return; }
    if (!google && !password) { setError('password'); return; }
    running.current = true; setBusy(true); setError(null);
    const secret = password;
    setPassword('');
    try { if (google) await auth.google(); else await auth.login(email, secret); if (mounted.current) onSuccess(); }
    catch (e) { if (mounted.current && !(e instanceof AuthError && e.code === 'CANCELLED')) setError(e instanceof AuthError ? e.code : 'STORAGE'); }
    finally { running.current = false; if (mounted.current) setBusy(false); }
  }
  const close = (action: () => void) => { auth.cancelGoogle(); setPassword(''); action(); };
  return <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={insets.top + 64}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
      <View style={styles.topRow}>
        <TouchableOpacity accessibilityRole="button" onPress={() => close(onClose)} style={styles.back}><Text style={styles.backText}>‹  {t.back}</Text></TouchableOpacity>
        <View style={styles.previewPill}><Text style={styles.previewText}>{t.badge}</Text></View>
      </View>
      <View style={styles.intro}><Text accessibilityRole="header" style={styles.title}>{t.title}</Text><Text style={styles.subtitle}>{t.subtitle}</Text></View>
      {!secureAuthContext && <View style={styles.feedback}><Text style={styles.feedbackText}>{t.insecure}</Text>
        <TouchableOpacity accessibilityRole="link" onPress={() => Linking.openURL('https://1-padel.com/app/')} style={styles.guest}><Text style={styles.registerLink}>{t.secureLink}  ↗</Text></TouchableOpacity></View>}
      <TouchableOpacity accessibilityRole="button" disabled={busy || auth.restoring || !secureAuthContext} accessibilityState={{ disabled: busy || auth.restoring || !secureAuthContext }} onPress={() => void signIn(true)} style={[styles.provider, !secureAuthContext && { opacity: 0.5 }]}>
        <Image accessible={false} source={require('../assets/auth/google.png')} style={styles.providerIcon} /><Text style={styles.providerText}>{busy ? t.busy : t.google}</Text>
      </TouchableOpacity>
      {auth.googleCode && <View style={styles.feedback}><Text style={styles.feedbackText}>{t.googleWait}</Text><Text selectable style={[styles.title, { fontSize: 24, marginTop: 10, letterSpacing: 3 }]}>{auth.googleCode}</Text>
        <TouchableOpacity accessibilityRole="button" onPress={auth.cancelGoogle} style={styles.guest}><Text style={styles.registerLink}>{t.cancel}</Text></TouchableOpacity></View>}
      <View style={styles.separator}><View style={styles.line} /><Text style={styles.separatorText}>{t.emailDivider}</Text><View style={styles.line} /></View>
      <View>
        <Text style={styles.label}>{t.email}</Text>
        <TextInput accessibilityLabel={t.email} value={email} placeholder="name@example.com" placeholderTextColor="#92A098" editable={secureAuthContext && !busy && !auth.restoring}
          keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" textContentType="username"
          returnKeyType="next" onSubmitEditing={() => passwordInput.current?.focus()} onChangeText={value => { setEmail(value); setError(null); }} style={[styles.input, error === 'email' && styles.inputError]} />
        <View style={styles.passwordLabel}><Text style={styles.label}>{t.password}</Text><TouchableOpacity accessibilityRole="link" onPress={() => Linking.openURL('https://1-padel.com/recuperar-password')} style={styles.forgotButton}><Text style={styles.forgotText}>{t.forgot}</Text></TouchableOpacity></View>
        <View style={[styles.passwordField, error === 'password' && styles.inputError]}>
          <TextInput ref={passwordInput} accessibilityLabel={t.password} value={password} placeholder="••••••••" placeholderTextColor="#92A098" editable={secureAuthContext && !busy && !auth.restoring}
            autoCapitalize="none" autoCorrect={false} autoComplete="current-password" textContentType="password" secureTextEntry={!showPassword}
            returnKeyType="go" onSubmitEditing={() => void signIn(false)} onChangeText={value => { setPassword(value); setError(null); }} style={styles.passwordInput} />
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={showPassword ? `${t.hide}: ${t.password}` : `${t.show}: ${t.password}`} onPress={() => setShowPassword(value => !value)} style={styles.passwordToggle}><Text style={styles.toggleText}>{showPassword ? t.hide : t.show}</Text></TouchableOpacity>
        </View>
        {error && <Text accessibilityRole="alert" style={styles.error}>{error === 'email' ? t.emailError : error === 'password' ? t.passwordError : authErrorText(language, error)}</Text>}
        {auth.restoreError && <TouchableOpacity accessibilityRole="button" onPress={() => void auth.retryRestore()} style={styles.guest}><Text style={styles.guestText}>{t.restore}</Text></TouchableOpacity>}
        <TouchableOpacity accessibilityRole="button" disabled={busy || auth.restoring || !secureAuthContext} accessibilityState={{ disabled: busy || auth.restoring || !secureAuthContext }} onPress={() => void signIn(false)} style={[styles.submit, (busy || auth.restoring || !secureAuthContext) && { opacity: 0.5 }]}><Text style={styles.submitText}>{busy ? t.busy : t.signIn}</Text></TouchableOpacity>
      </View>
      <View style={styles.registerRow}><Text style={styles.registerText}>{t.newAccount}</Text><TouchableOpacity accessibilityRole="link" onPress={() => Linking.openURL('https://1-padel.com/players/registro')} style={styles.registerButton}><Text style={styles.registerLink}>{t.createAccount}</Text></TouchableOpacity></View>
      <TouchableOpacity accessibilityRole="button" onPress={() => close(onBrowse)} style={styles.guest}><Text style={styles.guestText}>{t.guest}  ›</Text></TouchableOpacity>
      <Text style={styles.previewNote}>{t.note}</Text>
    </ScrollView>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: 22, paddingTop: 10, paddingBottom: 24, width: '100%', maxWidth: 440, alignSelf: 'center', flexGrow: 1 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 13 },
  back: { minHeight: 44, justifyContent: 'center', paddingRight: 12 }, backText: { color: colors.ink, fontSize: 13, fontWeight: '700' },
  previewPill: { flexDirection: 'row', gap: 5, alignItems: 'center', backgroundColor: colors.pale, paddingVertical: 5, paddingHorizontal: 9, borderRadius: 8 },
  previewDot: { height: 4, width: 4, borderRadius: 2, backgroundColor: '#B66037' }, previewText: { color: '#98512F', fontSize: 10, fontWeight: '700' },
  intro: { marginBottom: 22 }, title: { color: colors.ink, fontSize: 29, lineHeight: 36, fontWeight: '800', letterSpacing: -0.8 },
  subtitle: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 8, maxWidth: 320 },
  providers: { gap: 10 }, provider: { minHeight: 52, borderRadius: 14, borderWidth: 1, borderColor: '#D9E1DB', backgroundColor: colors.white, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 46, paddingVertical: 12 },
  providerIcon: { width: 25, height: 25, resizeMode: 'contain', position: 'absolute', left: 17 }, providerText: { color: colors.ink, fontSize: 14, lineHeight: 22, fontWeight: '600', textAlign: 'center' },
  apple: { backgroundColor: '#151B18', borderColor: '#151B18' }, appleText: { color: colors.white },
  separator: { flexDirection: 'row', gap: 12, alignItems: 'center', marginVertical: 21 }, line: { flex: 1, height: 1, backgroundColor: colors.line }, separatorText: { color: colors.muted, fontSize: 11, lineHeight: 16 },
  label: { color: colors.ink, fontSize: 12, lineHeight: 18, fontWeight: '700', marginBottom: 7 },
  input: { minHeight: 50, borderWidth: 1, borderColor: colors.line, borderRadius: 13, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: colors.white, color: colors.ink, fontSize: 16 },
  passwordLabel: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 9 }, forgotButton: { minHeight: 38, justifyContent: 'center', paddingLeft: 8 }, forgotText: { color: colors.green, fontSize: 12, fontWeight: '600', marginBottom: 7 },
  passwordField: { minHeight: 50, borderRadius: 13, borderWidth: 1, borderColor: colors.line, flexDirection: 'row', backgroundColor: colors.white },
  passwordInput: { flex: 1, minWidth: 0, color: colors.ink, fontSize: 16, paddingHorizontal: 14, paddingVertical: 12 },
  passwordToggle: { paddingHorizontal: 12, minWidth: 68, minHeight: 48, justifyContent: 'center', alignItems: 'center' }, toggleText: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  submit: { backgroundColor: colors.orange, minHeight: 52, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginTop: 18, padding: 12 }, submitText: { color: colors.white, fontSize: 15, lineHeight: 22, fontWeight: '800' },
  registerRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: 5, marginTop: 12 }, registerText: { color: colors.muted, fontSize: 12 }, registerButton: { minHeight: 40, justifyContent: 'center' }, registerLink: { color: colors.ink, fontWeight: '800', fontSize: 12 },
  guest: { minHeight: 44, justifyContent: 'center', alignItems: 'center', marginTop: 4 }, guestText: { color: colors.green, fontWeight: '700', fontSize: 12, lineHeight: 19, textAlign: 'center' },
  previewNote: { color: colors.muted, fontSize: 10, lineHeight: 16, textAlign: 'center', marginTop: 12, paddingHorizontal: 15 },
  feedback: { borderRadius: 11, backgroundColor: colors.pale, padding: 12, marginTop: 12 }, feedbackText: { color: '#83512F', fontSize: 12, lineHeight: 19 },
  inputError: { borderColor: '#B4503F' }, error: { color: '#A13F31', fontSize: 11, lineHeight: 17, marginTop: 6 },
});
