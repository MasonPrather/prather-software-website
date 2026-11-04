import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  access,
  mkdtemp,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  checkCallback,
  createSession,
  exchangeCode,
  gmailScope,
  readClient,
  redirectURI,
  tokenEndpoint,
  writeCredentials,
} from '../../scripts/lib/google-oauth.mjs';

// These credentials and authorization codes are inert unit-test fixtures.
const client = {
  id: 'unit-test-client.apps.googleusercontent.com',
  secret: 'unit-test-client-secret',
};
const credentials = {
  GMAIL_CLIENT_ID: client.id,
  GMAIL_CLIENT_SECRET: client.secret,
  GMAIL_REFRESH_TOKEN: 'unit-test-refresh-token',
};
const granted = {
  access_token: 'unit-test-access-token',
  refresh_token: credentials.GMAIL_REFRESH_TOKEN,
  token_type: 'Bearer',
  scope: gmailScope,
};

async function withDirectory(run: (directory: string) => Promise<void>) {
  const directory = await mkdtemp(path.join(tmpdir(), 'prather-google-oauth-'));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function callback(session: ReturnType<typeof createSession>) {
  const url = new URL(redirectURI);
  url.searchParams.set('state', session.state);
  url.searchParams.set('code', 'unit-test-authorization-code');
  return url;
}

test('OAuth client uses the registered Web callback and ignores supplied endpoints', async () => {
  await withDirectory(async (directory) => {
    const file = path.join(directory, 'client.json');
    await writeFile(
      file,
      JSON.stringify({
        web: {
          client_id: client.id,
          client_secret: client.secret,
          redirect_uris: [redirectURI],
          auth_uri: 'https://untrusted.example/authorize',
          token_uri: 'https://untrusted.example/token',
        },
      }),
    );
    assert.deepEqual(await readClient(file), client);
    assert.equal(
      new URL(createSession(client.id).url).origin,
      'https://accounts.google.com',
    );
    assert.equal(tokenEndpoint, 'https://oauth2.googleapis.com/token');
  });
});

test('OAuth client rejects malformed, installed, or mismatched callback credentials', async () => {
  await withDirectory(async (directory) => {
    const file = path.join(directory, 'client.json');
    for (const fixture of [
      null,
      {},
      { installed: { client_id: client.id, client_secret: client.secret } },
      {
        web: {
          client_id: 'unit-test-client',
          client_secret: client.secret,
          redirect_uris: [redirectURI],
        },
      },
      {
        web: {
          client_id: client.id,
          client_secret: '',
          redirect_uris: [redirectURI],
        },
      },
      {
        web: {
          client_id: client.id,
          client_secret: 'unit-test secret',
          redirect_uris: [redirectURI],
        },
      },
      {
        web: {
          client_id: client.id,
          client_secret: client.secret,
          redirect_uris: ['http://localhost:8977/oauth/callback'],
        },
      },
      {
        web: {
          client_id: client.id,
          client_secret: client.secret,
          redirect_uris: [redirectURI + '/'],
        },
      },
    ]) {
      await writeFile(file, JSON.stringify(fixture));
      await assert.rejects(
        readClient(file),
        /Use a Web application OAuth client/,
      );
    }
    await writeFile(file, '{ malformed unit-test JSON');
    await assert.rejects(
      readClient(file),
      /Could not read the Google OAuth client JSON/,
    );
  });
});

test('OAuth authorization requests are send-only, offline, state-bound and PKCE S256', () => {
  const before = Date.now();
  const first = createSession(client.id);
  const second = createSession(client.id);
  const url = new URL(first.url);
  assert.equal(
    url.href.startsWith('https://accounts.google.com/o/oauth2/v2/auth?'),
    true,
  );
  assert.equal(url.searchParams.get('client_id'), client.id);
  assert.equal(url.searchParams.get('redirect_uri'), redirectURI);
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('scope'), gmailScope);
  assert.equal(url.searchParams.get('access_type'), 'offline');
  assert.equal(url.searchParams.get('prompt'), 'consent');
  assert.equal(url.searchParams.get('hd'), 'prathersoftware.com');
  assert.equal(url.searchParams.get('include_granted_scopes'), null);
  assert.equal(url.searchParams.get('client_secret'), null);
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(
    url.searchParams.get('code_challenge'),
    createHash('sha256').update(first.verifier).digest('base64url'),
  );
  assert.match(first.verifier, /^[A-Za-z0-9_-]{43,128}$/);
  assert.ok(Buffer.from(first.state, 'base64url').length >= 32);
  assert.equal(url.searchParams.get('state'), first.state);
  assert.notEqual(first.state, second.state);
  assert.notEqual(first.verifier, second.verifier);
  assert.equal(first.used, false);
  assert.ok(first.expiresAt >= before + 600_000);
  assert.ok(first.expiresAt <= Date.now() + 600_000);
});

test('OAuth callback accepts only the matching live session and exact return endpoint', () => {
  const session = createSession(client.id);
  assert.deepEqual(checkCallback(callback(session), session), {
    code: 'unit-test-authorization-code',
    denied: false,
  });
  for (const endpoint of [
    'https://127.0.0.1:8977/oauth/callback',
    'http://127.0.0.1:8978/oauth/callback',
    'http://localhost:8977/oauth/callback',
    'http://127.0.0.1:8977/unrelated',
  ]) {
    const url = new URL(endpoint);
    url.search = callback(session).search;
    assert.throws(() => checkCallback(url, session), /Invalid or expired/);
  }
});

test('OAuth callback rejects missing, duplicated and mismatched state before code use', () => {
  const session = createSession(client.id);
  for (const states of [
    [],
    [''],
    ['unit-test-wrong-state'],
    [session.state, session.state],
  ]) {
    const url = callback(session);
    url.searchParams.delete('state');
    for (const value of states) url.searchParams.append('state', value);
    assert.throws(() => checkCallback(url, session), /state did not match/);
    assert.equal(session.used, false);
  }
});

test('OAuth callback rejects missing, duplicated and malformed authorization codes', () => {
  const session = createSession(client.id);
  for (const codes of [
    [],
    [''],
    ['unit-test code'],
    ['unit-test\ncode'],
    ['x'.repeat(4097)],
    ['unit-test-first', 'unit-test-second'],
  ]) {
    const url = callback(session);
    url.searchParams.delete('code');
    for (const value of codes) url.searchParams.append('code', value);
    assert.throws(() => checkCallback(url, session), /authorization code/);
  }
});

test('OAuth callback rejects expired and already consumed sessions', () => {
  const session = createSession(client.id);
  assert.throws(
    () => checkCallback(callback(session), session, session.expiresAt),
    /expired/,
  );
  assert.throws(
    () => checkCallback(callback(session), session, session.expiresAt + 1),
    /expired/,
  );
  session.used = true;
  assert.throws(
    () => checkCallback(callback(session), session),
    /Invalid or expired/,
  );
});

test('OAuth denied consent is distinct from a grant and ambiguous errors fail closed', () => {
  const session = createSession(client.id);
  const denied = callback(session);
  denied.searchParams.delete('code');
  denied.searchParams.set('error', 'access_denied');
  assert.deepEqual(checkCallback(denied, session), { denied: true });
  const ambiguous = new URL(denied);
  ambiguous.searchParams.set('code', 'unit-test-authorization-code');
  assert.throws(() => checkCallback(ambiguous, session), /Ambiguous/);
  denied.searchParams.append('error', 'unit-test-second-error');
  assert.throws(() => checkCallback(denied, session), /Ambiguous/);
});

test('OAuth exchange uses fixed Google endpoint, PKCE, exact redirect and protected POST fields', async () => {
  let calls = 0;
  const fetcher = (async (input, init) => {
    calls++;
    assert.equal(input, tokenEndpoint);
    assert.equal(init?.method, 'POST');
    assert.equal(init?.redirect, 'error');
    assert.equal(
      new Headers(init?.headers).get('Content-Type'),
      'application/x-www-form-urlencoded',
    );
    assert.ok(init?.signal instanceof AbortSignal);
    assert.equal(init.signal.aborted, false);
    const body = new URLSearchParams(String(init.body));
    assert.deepEqual(Object.fromEntries(body), {
      client_id: client.id,
      client_secret: client.secret,
      code: 'unit-test-authorization-code',
      code_verifier: 'unit-test-code-verifier',
      redirect_uri: redirectURI,
      grant_type: 'authorization_code',
    });
    return Response.json(granted);
  }) as typeof fetch;
  assert.deepEqual(
    await exchangeCode(
      client,
      'unit-test-authorization-code',
      'unit-test-code-verifier',
      fetcher,
    ),
    credentials,
  );
  assert.equal(calls, 1);
});

test('OAuth exchange does not retry HTTP failure or expose returned provider data', async () => {
  let calls = 0;
  const fetcher = (async () => {
    calls++;
    return new Response('unit-test-provider-error-with-secret', {
      status: 400,
    });
  }) as typeof fetch;
  await assert.rejects(
    exchangeCode(client, 'unit-test-code', 'unit-test-verifier', fetcher),
    (error: Error) => {
      assert.match(error.message, /HTTP 400/);
      assert.equal(
        error.message.includes('unit-test-provider-error-with-secret'),
        false,
      );
      return true;
    },
  );
  assert.equal(calls, 1);
});

test('OAuth exchange rejects absent offline tokens, unexpected scopes and malformed token types', async () => {
  for (const token of [
    null,
    {},
    { ...granted, access_token: '' },
    { ...granted, access_token: 'unit-test token' },
    { ...granted, refresh_token: undefined },
    { ...granted, refresh_token: '' },
    { ...granted, token_type: 'Basic' },
    { ...granted, token_type: 123 },
    { ...granted, token_type: {} },
    { ...granted, scope: undefined },
    { ...granted, scope: 'https://www.googleapis.com/auth/gmail.readonly' },
    {
      ...granted,
      scope: `${gmailScope} https://www.googleapis.com/auth/gmail.readonly`,
    },
    { ...granted, scope: `${gmailScope} ${gmailScope}` },
  ]) {
    await assert.rejects(
      exchangeCode(client, 'unit-test-code', 'unit-test-verifier', (async () =>
        Response.json(token)) as typeof fetch),
      /expected offline, send-only authorization/,
    );
  }
});

test('OAuth exchange rejects non-JSON, oversized and redirected token responses', async () => {
  await assert.rejects(
    exchangeCode(
      client,
      'unit-test-code',
      'unit-test-verifier',
      (async () => new Response('not JSON')) as typeof fetch,
    ),
    /unexpected authorization response/,
  );
  await assert.rejects(
    exchangeCode(
      client,
      'unit-test-code',
      'unit-test-verifier',
      (async () => new Response('x'.repeat(65537))) as typeof fetch,
    ),
    /unexpected authorization response/,
  );
  let calls = 0;
  await assert.rejects(
    exchangeCode(client, 'unit-test-code', 'unit-test-verifier', (async (
      _input,
      init,
    ) => {
      calls++;
      assert.equal(init?.redirect, 'error');
      throw new TypeError('Unit-test redirect blocked');
    }) as typeof fetch),
    /redirect blocked/,
  );
  assert.equal(calls, 1);
});

test('OAuth credentials are stored in a new owner-only environment file', async () => {
  await withDirectory(async (directory) => {
    const file = path.join(directory, '.dev.vars.gmail');
    await writeCredentials(file, credentials);
    assert.equal((await stat(file)).mode & 0o777, 0o600);
    const content = await readFile(file, 'utf8');
    assert.equal(
      content,
      Object.entries(credentials)
        .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
        .join('\n') + '\n',
    );
  });
});

test('OAuth credential storage never overwrites an existing secret file', async () => {
  await withDirectory(async (directory) => {
    const file = path.join(directory, '.dev.vars.gmail');
    await writeFile(file, 'unit-test-existing-secret-store', { mode: 0o600 });
    await assert.rejects(writeCredentials(file, credentials), {
      code: 'EEXIST',
    });
    assert.equal(
      await readFile(file, 'utf8'),
      'unit-test-existing-secret-store',
    );
  });
});

test('OAuth credential storage rejects existing and dangling symlinks', async () => {
  await withDirectory(async (directory) => {
    const file = path.join(directory, '.dev.vars.gmail');
    const target = path.join(directory, 'unit-test-protected-target');
    await writeFile(target, 'unit-test-protected-content', { mode: 0o600 });
    await symlink(target, file);
    await assert.rejects(writeCredentials(file, credentials), {
      code: 'EEXIST',
    });
    assert.equal(await readFile(target, 'utf8'), 'unit-test-protected-content');
    await rm(file);
    await rm(target);
    await symlink(target, file);
    await assert.rejects(writeCredentials(file, credentials), {
      code: 'EEXIST',
    });
    await assert.rejects(access(target), { code: 'ENOENT' });
  });
});

test('OAuth incomplete or unsafe credential data fails before creating a file', async () => {
  await withDirectory(async (directory) => {
    const file = path.join(directory, '.dev.vars.gmail');
    for (const fixture of [
      {},
      { GMAIL_CLIENT_ID: client.id },
      { ...credentials, GMAIL_REFRESH_TOKEN: '' },
      { ...credentials, GMAIL_REFRESH_TOKEN: 'unit-test\nINJECTED=value' },
      { ...credentials, UNSUPPORTED: 'unit-test-extra' },
    ]) {
      await assert.rejects(writeCredentials(file, fixture), /credential data/);
      await assert.rejects(access(file), { code: 'ENOENT' });
    }
  });
});
