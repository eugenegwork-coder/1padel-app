import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const events = JSON.parse(await readFile(new URL('../tests/fixtures/schedule.json', import.meta.url)));
const port = Number(process.env.PADEL_FIXTURE_PORT || 8787);
const server = createServer((request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname;
  response.setHeader('Content-Type', 'application/json');
  response.setHeader('X-Padel-Test-Data', 'true');
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'GET') { response.writeHead(405); return response.end('{"code":"METHOD_NOT_ALLOWED"}'); }
  if (path === '/api/public/tournaments') return response.end(JSON.stringify(events));
  const id = /^\/api\/public\/tournaments\/(\d+)$/.exec(path)?.[1];
  const event = events.find(item => item.id === Number(id));
  if (event) return response.end(JSON.stringify(event));
  response.writeHead(404); response.end('{"code":"TOURNAMENT_NOT_FOUND"}');
});
server.listen(port, '0.0.0.0', () => console.log(`Synthetic schedule API: http://localhost:${port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit()));
