import { readFile } from 'node:fs/promises';
import path from 'node:path';
import backend from '../config/backend.cjs';

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
export function createPreviewHandler({ root, apiBaseUrl, webBasePath = '', fetchImpl = fetch }) {
  const origin = backend.apiOrigin(apiBaseUrl);
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); return res.end(); }
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
    catch { res.writeHead(400); return res.end(); }
    if (/^\/api\/public\/tournaments(?:\/\d+)?$/.test(pathname)) {
      try {
        // Never forward cookies, authorization, user-supplied query or arbitrary paths.
        const result = await fetchImpl(origin + pathname, {
          headers: { Accept: 'application/json' }, redirect: 'manual', signal: AbortSignal.timeout(12000),
        });
        if (!result.headers.get('content-type')?.includes('application/json') || (result.status >= 300 && result.status < 400)) throw new Error('Not JSON');
        res.writeHead(result.status, { 'Content-Type': 'application/json' });
        const body = await result.text(); return res.end(req.method === 'HEAD' ? undefined : body);
      } catch { res.writeHead(503, { 'Content-Type': 'application/json' }); return res.end('{"code":"SCHEDULE_UNAVAILABLE"}'); }
    }
    if (pathname.startsWith('/api/') || pathname.startsWith('/players/')) { res.writeHead(404); return res.end(); }
    if (webBasePath && pathname === '/') { res.writeHead(302, { Location: webBasePath + '/' }); return res.end(); }
    if (webBasePath && !pathname.startsWith(webBasePath + '/')) { res.writeHead(404); return res.end(); }
    const relative = pathname.slice(webBasePath.length).replace(/^\/+/, '') || 'index.html';
    if (relative.includes('..') || relative.includes('\\') || relative.includes('\0')) { res.writeHead(400); return res.end(); }
    try {
      const data = await readFile(path.join(root, relative));
      res.writeHead(200, { 'Content-Type': mime[path.extname(relative)] || 'application/octet-stream' });
      return res.end(req.method === 'HEAD' ? undefined : data);
    } catch { res.writeHead(404); return res.end(); }
  };
}
