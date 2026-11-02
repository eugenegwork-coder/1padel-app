const PRODUCTION = 'https://1-padel.com';
const productionOrigins = [PRODUCTION, 'https://www.1-padel.com'];

function apiOrigin(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('EXPO_PUBLIC_API_BASE_URL must be an HTTPS origin without credentials, path, query or fragment');
  }
  return url.origin;
}

function resolveBackend({ apiBaseUrl, platform, webOrigin, localScheduleProxy = false } = {}) {
  const origin = apiOrigin(apiBaseUrl?.trim() || (productionOrigins.includes(webOrigin) ? webOrigin : PRODUCTION));
  let localWeb = false;
  if (platform === 'web' && webOrigin) {
    const url = new URL(webOrigin);
    localWeb = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  }
  // Keep existing production sessions; isolate test-server tokens from production.
  const sessionKey = productionOrigins.includes(origin) ? 'onepadel.refresh.v1'
    : 'onepadel.refresh.v1.' + Array.from(origin).map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
  return {
    apiBaseUrl: origin,
    scheduleBaseUrl: platform === 'web' && (webOrigin === origin || (localWeb && localScheduleProxy)) ? '' : origin,
    sessionKey,
    // The current server returns Google to /app/, not an arbitrary web/native client.
    googleAvailable: platform === 'web' && webOrigin === origin && productionOrigins.includes(origin),
  };
}

module.exports = { apiOrigin, resolveBackend };
