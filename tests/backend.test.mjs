import test from 'node:test';
import assert from 'node:assert/strict';
import backend from '../config/backend.cjs';

test('standalone web loads the real API instead of its own hosting origin', () => {
  const c = backend.resolveBackend({ platform: 'web', webOrigin: 'https://app.example.test' });
  assert.equal(c.apiBaseUrl, 'https://1-padel.com');
  assert.equal(c.scheduleBaseUrl, c.apiBaseUrl);
  assert.equal(c.googleAvailable, false);
});
test('production retains its existing session and Google redirect', () => {
  const c = backend.resolveBackend({ platform: 'web', webOrigin: 'https://1-padel.com' });
  assert.equal(c.sessionKey, 'onepadel.refresh.v1'); assert.equal(c.googleAvailable, true);
  assert.equal(c.scheduleBaseUrl, '');
});
test('custom HTTPS backend applies to native and web; tokens cannot cross environments', () => {
  for (const platform of ['ios', 'android', 'web']) {
    const c = backend.resolveBackend({ apiBaseUrl: 'https://test.example.test/', platform, webOrigin: 'http://localhost:8081' });
    assert.equal(c.apiBaseUrl, 'https://test.example.test'); assert.equal(c.scheduleBaseUrl, c.apiBaseUrl);
    assert.notEqual(c.sessionKey, 'onepadel.refresh.v1'); assert.match(c.sessionKey, /^[\w.-]+$/);
    assert.equal(c.googleAvailable, false);
  }
  assert.notEqual(backend.resolveBackend({ apiBaseUrl: 'https://a-b.test' }).sessionKey, backend.resolveBackend({ apiBaseUrl: 'https://a.b.test' }).sessionKey);
});
test('reject unsafe or ambiguous API origins', () => {
  for (const apiBaseUrl of ['http://1-padel.com', 'https://user:password@example.test', 'https://example.test/api', 'https://example.test/?key=a', 'https://example.test/#token=a', 'wrong']) {
    assert.throws(() => backend.resolveBackend({ apiBaseUrl }));
  }
});
test('read-only local proxy is explicit and never used by native/LAN hosts', () => {
  assert.equal(backend.resolveBackend({ platform: 'web', webOrigin: 'http://localhost:8081', localScheduleProxy: true }).scheduleBaseUrl, '');
  for (const platform of ['ios', 'android', 'web']) assert.equal(backend.resolveBackend({ platform, webOrigin: 'http://192.168.0.2:8081', localScheduleProxy: true }).scheduleBaseUrl, 'https://1-padel.com');
});
