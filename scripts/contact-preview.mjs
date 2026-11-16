import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
const astro = path.resolve('node_modules/astro/bin/astro.mjs');
// Isolate the active-form build. All network services are intercepted in browser tests.
const built = spawnSync(
  process.execPath,
  [astro, 'build', '--outDir', '.test-dist'],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      PUBLIC_CONTACT_ENABLED: 'true',
      PUBLIC_TURNSTILE_SITE_KEY: 'test-site-key',
      ASTRO_TELEMETRY_DISABLED: '1',
    },
  },
);
if (built.status !== 0) process.exit(built.status ?? 1);
const preview = spawn(
  process.execPath,
  [
    astro,
    'preview',
    '--outDir',
    '.test-dist',
    '--host',
    '127.0.0.1',
    '--port',
    '4322',
    '--ignore-lock',
  ],
  { stdio: 'inherit' },
);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => preview.kill(signal));
preview.on('exit', (code) => {
  process.exitCode = code ?? 0;
});
