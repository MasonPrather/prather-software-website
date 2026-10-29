import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const origin = 'http://127.0.0.1:8788';
const server = spawn(
  process.execPath,
  [
    path.resolve('node_modules/wrangler/bin/wrangler.js'),
    'dev',
    '--local',
    '--ip',
    '127.0.0.1',
    '--port',
    '8788',
    '--inspector-port',
    '0',
  ],
  {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, CI: 'true', WRANGLER_SEND_METRICS: 'false' },
  },
);
let output = '';
for (const stream of [server.stdout, server.stderr])
  stream.on('data', (chunk) => {
    output = (output + chunk).slice(-12000);
  });
try {
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    if (server.exitCode !== null) throw new Error(output);
    try {
      if (
        (await fetch(origin, { signal: AbortSignal.timeout(500) })).status ===
        200
      ) {
        ready = true;
        break;
      }
    } catch {}
    await delay(250);
  }
  assert.ok(ready, 'Worker did not start: ' + output);
  for (const route of [
    '/',
    '/services/',
    '/work/',
    '/products/software/',
    '/contact/',
  ]) {
    const response = await fetch(origin + route);
    assert.equal(response.status, 200, route);
    assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
    assert.equal(response.headers.get('X-Robots-Tag'), 'noindex, nofollow');
    assert.ok(
      response.headers
        .get('Content-Security-Policy')
        ?.includes("frame-ancestors 'none'"),
    );
  }
  assert.equal((await fetch(origin + '/missing-route/')).status, 404);
  assert.equal((await fetch(origin + '/api/missing')).status, 404);
  assert.equal((await fetch(origin + '/api/contact')).status, 405);
  const response = await fetch(origin + '/api/contact', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: '{}',
  });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).ok, false);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  const robots = await (await fetch(origin + '/robots.txt')).text();
  assert.ok(robots.includes('\nDisallow: /api/\n'));
  console.log(
    'Verified local Worker static routes, branded 404, API methods, disabled submissions, robots, and security headers.',
  );
} catch (error) {
  console.error(output);
  throw error;
} finally {
  server.kill('SIGTERM');
}
