import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  readClient,
  createSession,
  checkCallback,
  exchangeCode,
  writeCredentials,
  redirectURI,
} from './lib/google-oauth.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--client-file') {
  console.error(
    'Usage: npm run gmail:authorize -- --client-file /absolute/path/to/client.json',
  );
  process.exit(1);
}
const credentialFile = path.join(root, '.dev.vars.gmail');
try {
  execFileSync('git', ['check-ignore', '--quiet', credentialFile], {
    cwd: root,
    stdio: 'ignore',
  });
  let exists = false;
  try {
    await access(credentialFile);
    exists = true;
  } catch {}
  if (exists)
    throw new Error(
      'The ignored Gmail credential store already exists. Preserve it and choose an explicit reconnection procedure.',
    );
  const clientFile = path.resolve(args[1]);
  const relativeClient = path.relative(root, clientFile);
  if (!relativeClient.startsWith('..') && !path.isAbsolute(relativeClient)) {
    try {
      execFileSync('git', ['check-ignore', '--quiet', clientFile], {
        cwd: root,
        stdio: 'ignore',
      });
    } catch {
      throw new Error(
        'Keep the downloaded OAuth client JSON outside the repository or in an ignored secret store.',
      );
    }
  }
  const client = await readClient(clientFile);
  const session = createSession(client.id);
  let resolveDone, rejectDone;
  const done = new Promise((resolve, reject) => {
    resolveDone = resolve;
    rejectDone = reject;
  });
  // Attach a handler before the callback can reject, without exposing provider data.
  done.catch(() => {});
  let received = false;
  const server = http.createServer((request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    );
    response.setHeader('Content-Type', 'text/plain; charset=utf-8');
    const expected = new URL(redirectURI);
    if (
      request.method !== 'GET' ||
      request.headers.host !== expected.host ||
      !request.url ||
      request.url.length > 16384
    ) {
      response.writeHead(400).end('Request not accepted.');
      return;
    }
    let url;
    try {
      url = new URL(request.url, expected.origin);
    } catch {
      response.writeHead(400).end('Request not accepted.');
      return;
    }
    if (url.pathname === '/complete' && received) {
      response
        .writeHead(200)
        .end(
          'Google authorization received. Return to Codex for the final connection check.',
        );
      return;
    }
    let callback;
    try {
      callback = checkCallback(url, session);
    } catch {
      response.writeHead(400).end('Authorization callback not recognized.');
      return;
    }
    session.used = true;
    clearTimeout(timer);
    received = true;
    // Remove the code from the address bar before any further UI inspection.
    response.writeHead(303, { Location: '/complete' }).end();
    if (callback.denied) {
      rejectDone(
        new Error(
          'Google authorization was declined. No credentials were saved.',
        ),
      );
      return;
    }
    (async () => {
      const credentials = await exchangeCode(
        client,
        callback.code,
        session.verifier,
      );
      await writeCredentials(credentialFile, credentials);
      resolveDone();
    })().catch(() =>
      rejectDone(
        new Error(
          'Google authorization could not be saved. No credential values were printed.',
        ),
      ),
    );
  });
  const timer = setTimeout(
    () =>
      rejectDone(
        new Error('Google authorization expired. Please run the helper again.'),
      ),
    600_000,
  );
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(8977, '127.0.0.1', resolve);
    });
    console.log(
      'Authorize only the Google Workspace mailbox that owns the approved sender address.',
    );
    console.log(session.url);
    await done;
    console.log(
      'Send-only Google authorization saved to the ignored .dev.vars.gmail file (mode 0600).',
    );
    // Let the immediate clean redirect finish before stopping the loopback listener.
    await new Promise((resolve) => setTimeout(resolve, 1500));
  } finally {
    clearTimeout(timer);
    await new Promise((resolve) => server.close(resolve));
  }
} catch (error) {
  console.error(
    error instanceof Error ? error.message : 'Google authorization failed.',
  );
  process.exitCode = 1;
}
