import assert from 'node:assert/strict';
import test from 'node:test';
import { createNativeSessionStore, createWebSessionStore } from '../src/sessionStore.ts';

function fakeLocalStorage() {
  const data = new Map();
  return { getItem: key => (data.has(key) ? data.get(key) : null), setItem: (key, value) => { data.set(key, value); }, removeItem: key => { data.delete(key); } };
}
function throwingStorage() {
  return { getItem: () => { throw new Error('SecurityError: storage disabled'); }, setItem: () => { throw new Error('QuotaExceededError'); }, removeItem: () => { throw new Error('SecurityError'); } };
}
function fakeSecureStore() {
  const data = new Map(); const calls = [];
  return { calls, data,
    getItemAsync: async key => (data.has(key) ? data.get(key) : null),
    setItemAsync: async (key, value, options) => { calls.push({ op: 'set', key, value, options }); data.set(key, value); },
    deleteItemAsync: async key => { calls.push({ op: 'delete', key }); data.delete(key); } };
}

test('web store: token survives a new store instance over the same storage (simulated app restart)', async () => {
  const storage = fakeLocalStorage();
  await createWebSessionStore(storage, 'onepadel.refresh.v1').set('refresh-one');
  assert.equal(await createWebSessionStore(storage, 'onepadel.refresh.v1').get(), 'refresh-one');
});

test('web store: storage=null (secureAuthContext gate failed) never persists and never throws', async () => {
  const store = createWebSessionStore(null, 'onepadel.refresh.v1');
  await assert.doesNotReject(store.set('refresh-one'));
  assert.equal(await store.get(), null);
});

test('web store: logout removes the stored token', async () => {
  const storage = fakeLocalStorage();
  const store = createWebSessionStore(storage, 'onepadel.refresh.v1');
  await store.set('refresh-one');
  await store.set(null);
  assert.equal(storage.getItem('onepadel.refresh.v1'), null);
  assert.equal(await store.get(), null);
});

test('web store: storage throwing (private browsing) never breaks login/logout', async () => {
  const store = createWebSessionStore(throwingStorage(), 'onepadel.refresh.v1');
  assert.equal(await store.get(), null);
  await assert.doesNotReject(store.set('refresh-one'));
  await assert.doesNotReject(store.set(null));
});

test('native store: delegates to SecureStore with the keychain option, unchanged from before LFPT-0646', async () => {
  const secureStore = fakeSecureStore();
  const store = createNativeSessionStore(secureStore, 'onepadel.refresh.v1', 'WHEN_UNLOCKED_THIS_DEVICE_ONLY');
  await store.set('refresh-one');
  assert.deepEqual(secureStore.calls[0], { op: 'set', key: 'onepadel.refresh.v1', value: 'refresh-one', options: { keychainAccessible: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY' } });
  assert.equal(await store.get(), 'refresh-one');
  await store.set(null);
  assert.deepEqual(secureStore.calls[1], { op: 'delete', key: 'onepadel.refresh.v1' });
  assert.equal(await store.get(), null);
});
