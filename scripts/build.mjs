import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import backend from '../config/backend.cjs';

const platform = process.argv[2] || 'web';
if (!['web', 'all'].includes(platform)) throw new Error('Use web or all');
const root = fileURLToPath(new URL('..', import.meta.url));
const apiBaseUrl = backend.resolveBackend({ apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL }).apiBaseUrl;
const webBasePath = process.env.PADEL_WEB_BASE_PATH || '';
if (webBasePath && !/^\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(webBasePath)) throw new Error('Invalid PADEL_WEB_BASE_PATH');
const result = spawnSync(process.execPath, [path.join(root, 'node_modules/expo/bin/cli'), 'export', '--platform', platform, '--output-dir', 'dist'], {
  cwd: root, stdio: 'inherit',
  env: { ...process.env, EXPO_NO_DOTENV: '1', EXPO_PUBLIC_API_BASE_URL: apiBaseUrl },
});
if (result.status !== 0) process.exit(result.status ?? 1);
writeFileSync(path.join(root, 'dist/build-info.json'), JSON.stringify({ apiBaseUrl, webBasePath, platform }, null, 2));
