import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createPreviewHandler } from './preview-server.mjs';
import backend from '../config/backend.cjs';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const info = JSON.parse(await readFile(new URL('../dist/build-info.json', import.meta.url), 'utf8'));
if (process.env.EXPO_PUBLIC_API_BASE_URL && backend.apiOrigin(process.env.EXPO_PUBLIC_API_BASE_URL) !== info.apiBaseUrl) {
  throw new Error('API configuration changed: rebuild before previewing');
}
const port = Number(process.env.PORT || 8081);
const server = createServer(createPreviewHandler({ root, ...info }));
server.listen(port, '127.0.0.1', () => console.log(`1Padel preview: http://localhost:${port}${info.webBasePath}/`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
