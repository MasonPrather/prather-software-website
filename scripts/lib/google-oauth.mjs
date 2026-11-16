import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile, open } from 'node:fs/promises';

export const gmailScope = 'https://www.googleapis.com/auth/gmail.send';
export const redirectURI = 'http://127.0.0.1:8977/oauth/callback';
export const tokenEndpoint = 'https://oauth2.googleapis.com/token';
const opaque = (value) =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= 16384 &&
  !/[\u0000-\u0020\u007f]/.test(value);
export async function readClient(file) {
  let data;
  try {
    data = JSON.parse(await readFile(file, 'utf8'));
  } catch {
    throw new Error('Could not read the Google OAuth client JSON.');
  }
  const client = data?.web;
  if (
    !client ||
    !opaque(client.client_id) ||
    !client.client_id.endsWith('.apps.googleusercontent.com') ||
    !opaque(client.client_secret) ||
    !Array.isArray(client.redirect_uris) ||
    !client.redirect_uris.includes(redirectURI)
  )
    throw new Error(
      `Use a Web application OAuth client with the exact redirect URI ${redirectURI}.`,
    );
  return { id: client.client_id, secret: client.client_secret };
}
export function createSession(clientId) {
  const verifier = randomBytes(48).toString('base64url');
  const state = randomBytes(32).toString('base64url');
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectURI,
    response_type: 'code',
    scope: gmailScope,
    access_type: 'offline',
    prompt: 'consent',
    state,
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
    hd: 'prathersoftware.com',
  }).toString();
  return {
    verifier,
    state,
    url: url.href,
    expiresAt: Date.now() + 600_000,
    used: false,
  };
}
export function checkCallback(url, session, now = Date.now()) {
  if (
    url.origin !== new URL(redirectURI).origin ||
    url.pathname !== new URL(redirectURI).pathname ||
    session.used ||
    now >= session.expiresAt
  )
    throw new Error('Invalid or expired authorization callback.');
  const states = url.searchParams.getAll('state');
  const expected = Buffer.from(session.state);
  const actual = Buffer.from(states[0] ?? '');
  if (
    states.length !== 1 ||
    actual.length !== expected.length ||
    !timingSafeEqual(actual, expected)
  )
    throw new Error('Authorization state did not match.');
  const codes = url.searchParams.getAll('code');
  const errors = url.searchParams.getAll('error');
  if (errors.length) {
    if (errors.length !== 1 || codes.length)
      throw new Error('Ambiguous authorization callback.');
    return { denied: true };
  }
  if (codes.length !== 1 || !opaque(codes[0]) || codes[0].length > 4096)
    throw new Error('Missing or ambiguous authorization code.');
  return { code: codes[0], denied: false };
}
export async function exchangeCode(client, code, verifier, fetcher = fetch) {
  const response = await fetcher(tokenEndpoint, {
    method: 'POST',
    redirect: 'error',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: client.id,
      client_secret: client.secret,
      code,
      code_verifier: verifier,
      redirect_uri: redirectURI,
      grant_type: 'authorization_code',
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok)
    throw new Error(
      `Google did not accept the authorization exchange (HTTP ${response.status}).`,
    );
  if (!response.body)
    throw new Error('Google returned an unexpected authorization response.');
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 65536) {
        await reader.cancel();
        throw new Error(
          'Google returned an unexpected authorization response.',
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const text = Buffer.concat(chunks).toString('utf8');
  let token;
  try {
    token = JSON.parse(text);
  } catch {
    throw new Error('Google returned an unexpected authorization response.');
  }
  const scopes =
    typeof token?.scope === 'string'
      ? token.scope.split(/\s+/).filter(Boolean)
      : [];
  if (
    !opaque(token?.access_token) ||
    !opaque(token?.refresh_token) ||
    typeof token?.token_type !== 'string' ||
    token.token_type.toLowerCase() !== 'bearer' ||
    scopes.length !== 1 ||
    scopes[0] !== gmailScope
  )
    throw new Error(
      'Google did not grant the expected offline, send-only authorization.',
    );
  return {
    GMAIL_CLIENT_ID: client.id,
    GMAIL_CLIENT_SECRET: client.secret,
    GMAIL_REFRESH_TOKEN: token.refresh_token,
  };
}
export async function writeCredentials(file, credentials) {
  const lines = Object.entries(credentials).map(([key, value]) => {
    if (
      ![
        'GMAIL_CLIENT_ID',
        'GMAIL_CLIENT_SECRET',
        'GMAIL_REFRESH_TOKEN',
      ].includes(key) ||
      !opaque(value)
    )
      throw new Error('Invalid credential data.');
    return `${key}=${JSON.stringify(value)}`;
  });
  if (lines.length !== 3) throw new Error('Incomplete credential data.');
  const handle = await open(file, 'wx', 0o600);
  try {
    await handle.writeFile(lines.join('\n') + '\n');
  } finally {
    await handle.close();
  }
}
