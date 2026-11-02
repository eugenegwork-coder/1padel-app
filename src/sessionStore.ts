// Хранилище refresh-токена, вынесено из AuthContext.tsx (JSX-файл не тестируется текущим раннером,
// node --test не умеет JSX) — LFPT-0646. На native (SecureStore) поведение не изменилось,
// на вебе refresh-токен теперь переживает закрытие/повторное открытие вкладки (localStorage),
// а не живёт только в памяти текущей сессии, как раньше.
export type Store = { get: () => Promise<string | null>; set: (token: string | null) => Promise<void> };

type WebStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

type SecureStoreLike = {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string, options?: unknown): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
};

export function createNativeSessionStore(secureStore: SecureStoreLike, key: string, keychainAccessible?: unknown): Store {
  return {
    get() { return secureStore.getItemAsync(key); },
    async set(token) {
      if (token) await secureStore.setItemAsync(key, token, keychainAccessible === undefined ? undefined : { keychainAccessible });
      else await secureStore.deleteItemAsync(key);
    },
  };
}

// storage === null — хранение недоступно (гейт secureAuthContext не прошёл: не HTTPS/localhost).
// Исключения из storage (приватный режим Safari и т.п.) не должны ронять вход/выход — сессия
// в этом случае просто не переживает закрытие вкладки, как и раньше.
export function createWebSessionStore(storage: WebStorage | null, key: string): Store {
  return {
    async get() {
      if (!storage) return null;
      try { return storage.getItem(key); } catch { return null; }
    },
    async set(token) {
      if (!storage) return;
      try { if (token) storage.setItem(key, token); else storage.removeItem(key); } catch { /* приватный режим браузера — не блокируем вход/выход */ }
    },
  };
}
