import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import http from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const port = 8789;
const origin = `http://127.0.0.1:${port}`;
const directory = await mkdtemp(
  path.join(tmpdir(), 'prather-contact-runtime-'),
);
let server;
try {
  // Fail rather than accidentally testing a stale process on the chosen port.
  const probe = net.createServer();
  await new Promise((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(port, '127.0.0.1', resolve);
  });
  await new Promise((resolve) => probe.close(resolve));
  const config = path.join(directory, 'wrangler.json');
  await writeFile(
    config,
    JSON.stringify({
      name: 'prather-contact-runtime-fixture',
      main: path.join(root, 'tests/fixtures/contact-worker.ts'),
      compatibility_date: '2026-10-29',
      workers_dev: false,
      preview_urls: false,
      observability: { enabled: false },
    }),
  );
  // Run from the empty temporary directory, with no application bindings,
  // routes, secrets, local env files, or inherited Cloudflare credentials.
  server = spawn(
    process.execPath,
    [
      path.join(root, 'node_modules/wrangler/bin/wrangler.js'),
      'dev',
      '--config',
      config,
      '--local',
      '--infer-origin-from-routes=false',
      '--ip',
      '127.0.0.1',
      '--port',
      String(port),
      '--inspector-port',
      '0',
      '--persist-to',
      path.join(directory, 'state'),
      '--log-level',
      'none',
    ],
    {
      cwd: directory,
      stdio: 'ignore',
      env: {
        PATH: process.env.PATH,
        ...(process.env.TMPDIR ? { TMPDIR: process.env.TMPDIR } : {}),
        CI: 'true',
        WRANGLER_SEND_METRICS: 'false',
        WRANGLER_WRITE_LOGS: 'false',
        WRANGLER_LOG_SANITIZE: 'true',
        CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false',
      },
    },
  );
  let startupError = false;
  server.on('error', () => {
    startupError = true;
  });
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    assert.ok(
      !startupError && server.exitCode === null,
      'Local contact runtime exited before readiness.',
    );
    try {
      const response = await fetch(`${origin}/health`, {
        redirect: 'manual',
        signal: AbortSignal.timeout(500),
      });
      if (
        response.status === 204 &&
        response.headers.get('X-Contact-Fixture') === 'workerd-runtime'
      ) {
        ready = true;
        break;
      }
    } catch {}
    await delay(250);
  }
  assert.ok(ready, 'Local contact runtime did not become ready.');
  for (const [scenario, status, calls] of [
    ['accepted', 200, 3],
    ['verification-redirect', 502, 1],
    ['refresh-redirect', 502, 2],
    ['send-redirect', 502, 3],
    ['health-public', 200, 0],
    ['health-authorized', 200, 1],
    ['health-denied', 401, 0],
    ['health-incident', 503, 0],
    ['health-refresh-redirect', 503, 1],
    ['health-state-unavailable', 503, 0],
  ]) {
    const response = await fetch(`${origin}/case/${scenario}`, {
      redirect: 'manual',
      signal: AbortSignal.timeout(5000),
    });
    assert.equal(response.status, 200, `${scenario}: fixture response`);
    assert.deepEqual(
      await response.json(),
      { status, calls, endpointsMatch: true, manualRedirects: true },
      `${scenario}: native workerd Request options and fixed upstream sequence`,
    );
    console.log(`${scenario}: status ${status}, upstream calls ${calls}.`);
  }

  async function expectIncoming(label, response, status, calls) {
    assert.equal(response.status, 200, `${label}: fixture HTTP response`);
    assert.deepEqual(
      await response.json(),
      { status, calls, endpointsMatch: true, manualRedirects: true },
      `${label}: real incoming HTTP body`,
    );
    console.log(`${label}: status ${status}, upstream calls ${calls}.`);
  }
  const authorization = 'Bearer ' + 'a'.repeat(64); // Inert local fixture only.
  await expectIncoming(
    'incoming POST without body',
    await fetch(`${origin}/incoming-health`, {
      method: 'POST',
      headers: { Authorization: authorization },
      signal: AbortSignal.timeout(5000),
    }),
    200,
    1,
  );
  await expectIncoming(
    'incoming POST empty string',
    await fetch(`${origin}/incoming-health`, {
      method: 'POST',
      headers: { Authorization: authorization },
      body: '',
      signal: AbortSignal.timeout(5000),
    }),
    200,
    1,
  );
  await expectIncoming(
    'incoming POST nonempty body',
    await fetch(`${origin}/incoming-health`, {
      method: 'POST',
      headers: { Authorization: authorization },
      body: 'x',
      signal: AbortSignal.timeout(5000),
    }),
    400,
    0,
  );
  for (const [label, headers, payload, stalled] of [
    [
      'incoming native Content-Length zero',
      { 'Content-Length': '0' },
      undefined,
      false,
    ],
    [
      'incoming empty chunked body',
      { 'Transfer-Encoding': 'chunked' },
      undefined,
      false,
    ],
    [
      'incoming nonempty chunked body',
      { 'Transfer-Encoding': 'chunked' },
      'x',
      false,
    ],
    [
      'incoming stalled chunked body',
      { 'Transfer-Encoding': 'chunked' },
      undefined,
      true,
    ],
  ]) {
    const response = await new Promise((resolve, reject) => {
      const request = http.request(
        `${origin}/incoming-health`,
        {
          method: 'POST',
          headers: { Authorization: authorization, ...headers },
        },
        (response) => {
          const chunks = [];
          response.on('data', (chunk) => chunks.push(chunk));
          response.on('end', () => {
            resolve(
              new Response(Buffer.concat(chunks), {
                status: response.statusCode,
              }),
            );
            request.destroy();
          });
          response.on('error', reject);
        },
      );
      request.setTimeout(5000, () =>
        request.destroy(new Error('Local fixture request timed out.')),
      );
      request.on('error', reject);
      if (stalled) request.flushHeaders();
      else request.end(payload);
    });
    const rejected = Boolean(payload || stalled);
    await expectIncoming(
      label,
      response,
      rejected ? 400 : 200,
      rejected ? 0 : 1,
    );
  }
  console.log(
    'Verified ten local workerd scenarios and seven real incoming HTTP health requests; no external requests or emails.',
  );
} finally {
  if (server?.pid && server.exitCode === null && server.signalCode === null) {
    const exited = once(server, 'exit');
    server.kill('SIGTERM');
    const timer = setTimeout(() => server.kill('SIGKILL'), 3000);
    timer.unref();
    await exited;
    clearTimeout(timer);
  }
  await rm(directory, { recursive: true, force: true });
}
