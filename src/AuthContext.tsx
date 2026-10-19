import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { AuthError, createAuthClient } from './auth';
import type { Profile } from './auth';

const secureKey = 'onepadel.refresh.v1';
export const secureAuthContext = Platform.OS !== 'web' || (typeof window !== 'undefined' && (window.location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(window.location.hostname)));
const store = {
  async get() { return Platform.OS === 'web' ? null : SecureStore.getItemAsync(secureKey); },
  async set(token: string | null) {
    if (Platform.OS === 'web') return; // Браузерные токены только в памяти текущей вкладки.
    if (token) await SecureStore.setItemAsync(secureKey, token, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
    else await SecureStore.deleteItemAsync(secureKey);
  },
};
function base64url(bytes: Uint8Array) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += alphabet[n >>> 18] + alphabet[n >>> 12 & 63];
    if (i + 1 < bytes.length) out += alphabet[n >>> 6 & 63];
    if (i + 2 < bytes.length) out += alphabet[n & 63];
  }
  return out.replace(/\+/g, '-').replace(/\//g, '_');
}
type Auth = { profile: Profile | null; restoring: boolean; restoreError: string | null; googleCode: string | null;
  login: (email: string, password: string) => Promise<void>; google: () => Promise<void>; cancelGoogle: () => void;
  logout: () => Promise<void>; retryRestore: () => Promise<void>; client: ReturnType<typeof createAuthClient> };
const Context = createContext<Auth | null>(null);
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [googleCode, setGoogleCode] = useState<string | null>(null);
  const attempt = useRef(0);
  const client = useMemo(() => createAuthClient({ store, baseUrl: Platform.OS === 'web' && typeof window !== 'undefined' && window.location.protocol === 'https:' && ['1-padel.com', 'www.1-padel.com'].includes(window.location.hostname) ? window.location.origin : 'https://1-padel.com', onExpired: () => setProfile(null) }), []);
  const retryRestore = useCallback(async () => {
    setRestoring(true); setRestoreError(null);
    try { setProfile(await client.restore()); }
    catch (error) { if (error instanceof AuthError && !['SESSION_EXPIRED', 'ACCOUNT_UNAVAILABLE', 'CANCELLED'].includes(error.code)) setRestoreError(error.code); }
    finally { setRestoring(false); }
  }, [client]);
  useEffect(() => { void retryRestore(); return () => { attempt.current++; }; }, [retryRestore]);
  const cancelGoogle = useCallback(() => { attempt.current++; client.cancelPending(); setGoogleCode(null); }, [client]);
  async function google() {
    if (!secureAuthContext) throw new AuthError('INSECURE');
    // Открываем вкладку синхронно с нажатием, иначе Safari блокирует popup.
    const popup = Platform.OS === 'web' ? window.open('about:blank', '_blank') : null;
    const current = ++attempt.current;
    try {
      if (Platform.OS === 'web' && !popup) throw new AuthError('POPUP_BLOCKED');
      const verifier = base64url(await Crypto.getRandomBytesAsync(32));
      const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, { encoding: Crypto.CryptoEncoding.BASE64 });
      const challenge = digest.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      const start = await client.startGoogle(challenge);
      if (current !== attempt.current) throw new AuthError('CANCELLED');
      setGoogleCode(start.requestId.slice(0, 8));
      if (popup) { popup.opener = null; popup.location.href = start.browserUrl; }
      else await Linking.openURL(start.browserUrl);
      const deadline = Date.now() + start.expiresIn * 1000;
      while (Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 3000));
        if (current !== attempt.current) throw new AuthError('CANCELLED');
        const next = await client.exchangeGoogle(start.requestId, verifier);
        if (current !== attempt.current) throw new AuthError('CANCELLED');
        if (next) { setProfile(next); return; }
        if (popup?.closed) throw new AuthError('CANCELLED');
      }
      throw new AuthError('LOGIN_REQUEST_EXPIRED');
    } finally { if (current === attempt.current) setGoogleCode(null); if (popup && !popup.closed) popup.close(); }
  }
  async function login(email: string, password: string) {
    if (!secureAuthContext) throw new AuthError('INSECURE');
    cancelGoogle(); setRestoreError(null); setProfile(await client.login(email, password));
  }
  async function logout() { cancelGoogle(); await client.logout(); setProfile(null); }
  return <Context.Provider value={{ profile, restoring, restoreError, googleCode, login, google, cancelGoogle, logout, retryRestore, client }}>{children}</Context.Provider>;
}
export function useAuth() { const value = useContext(Context); if (!value) throw new Error('AuthProvider required'); return value; }
