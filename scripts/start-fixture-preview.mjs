import { spawn } from 'node:child_process';
import { networkInterfaces } from 'node:os';

const address = Object.values(networkInterfaces()).flat().find(item => item && item.family === 'IPv4' && !item.internal)?.address || '127.0.0.1';
const fixturePort = process.env.PADEL_FIXTURE_PORT || '8787';
const fixture = spawn(process.execPath, ['scripts/fixture-api.mjs'], { stdio: 'inherit' });
const expo = spawn(process.execPath, ['node_modules/expo/bin/cli', 'start', '--lan', '--port', '8082'], {
  stdio: 'inherit', env: { ...process.env, PADEL_API_UPSTREAM: `http://127.0.0.1:${fixturePort}`,
    EXPO_PUBLIC_API_BASE_URL: `http://${address}:${fixturePort}`, EXPO_PUBLIC_PREVIEW_MODE: 'fixtures' },
});
const stop = () => { fixture.kill(); expo.kill(); };
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, stop);
expo.on('exit', code => { fixture.kill(); process.exitCode = code || 0; });
fixture.on('exit', code => { if (code) { expo.kill(); process.exitCode = code; } });
