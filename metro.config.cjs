const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const upstream = (process.env.PADEL_API_UPSTREAM || 'https://1-padel.com').replace(/\/+$/, '');

// Только чтение расписания. Куки/токены браузера на внешний сервер не передаются.
config.server.enhanceMiddleware = (middleware) => async (request, response, next) => {
  const path = new URL(request.url, 'http://localhost').pathname;
  if (request.method !== 'GET' || !/^\/api\/public\/tournaments(?:\/\d+)?$/.test(path)) {
    return middleware(request, response, next);
  }
  response.setHeader('Cache-Control', 'no-store');
  try {
    const result = await fetch(upstream + path, {
      headers: { Accept: 'application/json', 'Accept-Language': request.headers['accept-language'] || 'es' },
      redirect: 'manual', signal: AbortSignal.timeout(12000),
    });
    if (!result.headers.get('content-type')?.includes('application/json') || result.status >= 300 && result.status < 400) {
      response.writeHead(503, { 'Content-Type': 'application/json' });
      return response.end(JSON.stringify({ code: 'SCHEDULE_UNAVAILABLE' }));
    }
    response.writeHead(result.status, { 'Content-Type': 'application/json' });
    response.end(await result.text());
  } catch {
    response.writeHead(503, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ code: 'SCHEDULE_UNAVAILABLE' }));
  }
};

module.exports = config;
