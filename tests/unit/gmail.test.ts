import assert from 'node:assert/strict';
import test from 'node:test';
import { handleContact } from '../../worker/index';

type ContactEnvironment = Parameters<typeof handleContact>[1];
const origin = 'https://staging.example.com';
const tokenURL = 'https://oauth2.googleapis.com/token';
const sendURL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
const verificationURL =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const submission = {
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  category: 'general',
  message: 'Please help us plan a reliable application for our business.',
  website: '',
  'cf-turnstile-response': 'fresh-unit-token',
};
function environment(
  overrides: Partial<ContactEnvironment> = {},
): ContactEnvironment {
  return {
    CONTACT_ENABLED: 'true',
    CONTACT_DELIVERY_VERIFIED: 'true',
    ALLOWED_ORIGIN: origin,
    TURNSTILE_HOSTNAME: 'staging.example.com',
    CONTACT_FROM: 'website@prathersoftware.com',
    CONTACT_TO: 'contact@prathersoftware.com',
    TURNSTILE_SECRET: 'unit-turnstile-secret',
    GMAIL_CLIENT_ID: 'unit-client-id',
    GMAIL_CLIENT_SECRET: 'unit-client-secret',
    GMAIL_REFRESH_TOKEN: 'unit-refresh-token',
    CONTACT_RATE_LIMITER: { limit: async () => ({ success: true }) },
    ...overrides,
  } as ContactEnvironment;
}
function request(changes: Record<string, unknown> = {}) {
  return new Request(origin + '/api/contact', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...submission, ...changes }),
  });
}
type MockOptions = {
  oauth?: () => Response;
  delivery?: () => Response;
};
function mock(options: MockOptions = {}) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url === verificationURL)
      return Response.json({
        success: true,
        action: 'contact',
        hostname: 'staging.example.com',
      });
    if (url === tokenURL)
      return options.oauth
        ? options.oauth()
        : Response.json({
            access_token: 'unit-access-token',
            token_type: 'Bearer',
            expires_in: 3600,
          });
    assert.equal(
      url,
      sendURL,
      'Visitor input must never choose an upstream URL',
    );
    return options.delivery
      ? options.delivery()
      : Response.json({ id: 'accepted-unit-message', threadId: 'unit-thread' });
  }) as typeof fetch;
  return { calls, fetcher };
}
async function rejected(response: Response) {
  assert.equal(response.status, 502);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  const result = await response.json();
  assert.equal(result.ok, false);
  assert.doesNotMatch(
    result.message,
    /unit-(?:client|refresh|access)|inbox|delivered|accepted by/i,
  );
}
function decodedMail(call: { init?: RequestInit }) {
  const body = JSON.parse(call.init!.body as string);
  assert.deepEqual(Object.keys(body), ['raw']);
  assert.match(body.raw, /^[A-Za-z0-9_-]+$/);
  const mime = Buffer.from(body.raw, 'base64url').toString('utf8');
  const separator = mime.indexOf('\r\n\r\n');
  assert.ok(separator > 0, 'MIME headers and body require a CRLF separator');
  const headers = mime.slice(0, separator);
  const encodedText = mime.slice(separator + 4);
  return {
    mime,
    headers,
    encodedText,
    text: Buffer.from(encodedText, 'base64').toString('utf8'),
  };
}

test('Gmail refresh and send use fixed endpoints, POST, no redirects and one bounded signal', async () => {
  const upstream = mock();
  const response = await handleContact(
    request(),
    environment(),
    upstream.fetcher,
  );
  assert.equal(response.status, 200);
  assert.deepEqual(
    upstream.calls.map((call) => call.url),
    [verificationURL, tokenURL, sendURL],
  );
  const [grant, send] = upstream.calls.slice(1);
  for (const call of [grant!, send!]) {
    assert.equal(call.init?.method, 'POST');
    assert.equal(call.init?.redirect, 'error');
    assert.ok(call.init?.signal instanceof AbortSignal);
    assert.equal(call.init?.signal?.aborted, false);
  }
  assert.equal(
    grant!.init?.signal,
    send!.init?.signal,
    'The Gmail phase must share one deadline',
  );
  assert.equal(
    new Headers(send!.init?.headers).get('Authorization'),
    'Bearer unit-access-token',
  );
  const fields = new URLSearchParams(grant!.init?.body as URLSearchParams);
  assert.equal(fields.get('grant_type'), 'refresh_token');
  assert.equal(fields.get('client_id'), 'unit-client-id');
  assert.equal(fields.get('client_secret'), 'unit-client-secret');
  assert.equal(fields.get('refresh_token'), 'unit-refresh-token');
});

for (const [label, payload] of [
  ['null response', null],
  ['missing access token', {}],
  ['empty access token', { access_token: '' }],
  ['whitespace access token', { access_token: '  ' }],
  ['non-string access token', { access_token: true }],
  [
    'header-injecting access token',
    { access_token: 'token\r\nX-Injected: yes' },
  ],
] as const) {
  test(`Gmail OAuth ${label} cannot reach the sending endpoint`, async () => {
    const upstream = mock({ oauth: () => Response.json(payload) });
    await rejected(
      await handleContact(request(), environment(), upstream.fetcher),
    );
    assert.deepEqual(
      upstream.calls.map((call) => call.url),
      [verificationURL, tokenURL],
    );
  });
}
for (const [label, oauth] of [
  [
    'revoked refresh token',
    () => Response.json({ error: 'invalid_grant' }, { status: 400 }),
  ],
  [
    'redirect',
    () =>
      Response.json(
        {},
        { status: 302, headers: { Location: 'https://attacker.example.com/' } },
      ),
  ],
  ['empty success response', () => new Response(null, { status: 204 })],
  ['malformed JSON', () => new Response('{invalid')],
  [
    'oversized response',
    () =>
      Response.json({
        access_token: 'unit-access-token',
        padding: 'x'.repeat(33_000),
      }),
  ],
  [
    'network failure',
    () => {
      throw new Error('unit-client-secret must never appear in the response');
    },
  ],
  [
    'timeout',
    () => {
      throw new DOMException(
        'unit-refresh-token must not leak',
        'TimeoutError',
      );
    },
  ],
] as const) {
  test(`Gmail OAuth ${label} fails closed without retrying or sending`, async () => {
    const upstream = mock({ oauth });
    await rejected(
      await handleContact(request(), environment(), upstream.fetcher),
    );
    assert.equal(
      upstream.calls.filter((call) => call.url === tokenURL).length,
      1,
    );
    assert.equal(
      upstream.calls.filter((call) => call.url === sendURL).length,
      0,
    );
  });
}
for (const [label, delivery] of [
  [
    'permission rejection',
    () => Response.json({ error: 'forbidden' }, { status: 403 }),
  ],
  ['quota rejection', () => Response.json({}, { status: 429 })],
  ['provider failure', () => Response.json({}, { status: 500 })],
  [
    'redirect',
    () =>
      Response.json(
        {},
        { status: 307, headers: { Location: 'https://attacker.example.com/' } },
      ),
  ],
  ['null receipt', () => Response.json(null)],
  ['non-string receipt id', () => Response.json({ id: 12 })],
  [
    'wrong receipt field',
    () => Response.json({ messageId: 'not-a-gmail-receipt' }),
  ],
  ['malformed receipt', () => new Response('{invalid')],
  [
    'oversized receipt',
    () =>
      Response.json({
        id: 'accepted-unit-message',
        padding: 'x'.repeat(33_000),
      }),
  ],
  [
    'uncertain network failure',
    () => {
      throw new Error('unit-access-token must not leak');
    },
  ],
] as const) {
  test(`Gmail ${label} cannot produce success or retry delivery`, async () => {
    const upstream = mock({ delivery });
    await rejected(
      await handleContact(request(), environment(), upstream.fetcher),
    );
    assert.equal(
      upstream.calls.filter((call) => call.url === tokenURL).length,
      1,
    );
    assert.equal(
      upstream.calls.filter((call) => call.url === sendURL).length,
      1,
    );
  });
}
for (const [label, overrides] of [
  [
    'injected sender header',
    { CONTACT_FROM: 'site@example.com\r\nBcc: attacker@example.com' },
  ],
  [
    'injected recipient header',
    { CONTACT_TO: 'contact@example.com\r\nBcc: attacker@example.com' },
  ],
  ['invalid sender mailbox', { CONTACT_FROM: 'invalid-mailbox' }],
  ['invalid recipient mailbox', { CONTACT_TO: 'invalid-mailbox' }],
] as const) {
  test(`Gmail ${label} fails before any external request`, async () => {
    const upstream = mock();
    const response = await handleContact(
      request(),
      environment(overrides),
      upstream.fetcher,
    );
    assert.equal(response.status, 503);
    assert.equal(upstream.calls.length, 0);
  });
}

for (const email of ['ada@example.com,other.invalid', 'ada@example.com>']) {
  test(`Gmail rejects an ambiguous Reply-To mailbox (${email}) before verification`, async () => {
    const upstream = mock();
    const response = await handleContact(
      request({ email }),
      environment(),
      upstream.fetcher,
    );
    assert.equal(response.status, 422);
    assert.equal(upstream.calls.length, 0);
  });
}

test('Gmail MIME preserves UTF-8 text and isolates header-like visitor content in the encoded body', async () => {
  const upstream = mock();
  const message =
    'Résumé — 東京 👋\r\nBcc: never-a-header@example.com\r\n' +
    'Useful project details. '.repeat(10);
  const response = await handleContact(
    request({ name: 'Zoë 工程', message }),
    environment(),
    upstream.fetcher,
  );
  assert.equal(response.status, 200);
  const mail = decodedMail(upstream.calls[2]!);
  assert.match(mail.headers, /^MIME-Version: 1\.0\r?$/m);
  assert.match(
    mail.headers,
    /^Content-Type: text\/plain;\s*charset=UTF-8\r?$/im,
  );
  assert.match(mail.headers, /^Content-Transfer-Encoding: base64\r?$/im);
  assert.ok(!mail.headers.includes('never-a-header@example.com'));
  assert.ok(mail.text.includes('Zoë 工程'));
  assert.ok(
    mail.text
      .replace(/\r\n/g, '\n')
      .includes(message.trim().replace(/\r\n/g, '\n')),
  );
  for (const line of mail.encodedText.trim().split('\r\n'))
    assert.ok(line.length <= 76);
});

test('Gmail sender, recipient, subject and API destination cannot be overridden by visitor fields', async () => {
  const upstream = mock();
  const response = await handleContact(
    request({
      to: 'attacker@example.com',
      from: 'spoof@example.com',
      cc: 'other@example.com',
      bcc: 'hidden@example.com',
      replyTo: 'fake@example.com',
      subject: 'Injected subject',
      tokenEndpoint: 'https://attacker.example.com/token',
      sendEndpoint: 'https://attacker.example.com/send',
    }),
    environment(),
    upstream.fetcher,
  );
  assert.equal(response.status, 200);
  const mail = decodedMail(upstream.calls[2]!);
  assert.match(mail.headers, /^From: website@prathersoftware\.com\r?$/m);
  assert.match(mail.headers, /^To: contact@prathersoftware\.com\r?$/m);
  assert.match(mail.headers, /^Reply-To: ada@example\.com\r?$/m);
  assert.match(mail.headers, /^Subject: Website inquiry: General inquiry\r?$/m);
  assert.doesNotMatch(
    mail.headers,
    /attacker|spoof|hidden|fake|Injected|^Cc:|^Bcc:/im,
  );
  assert.doesNotMatch(
    mail.mime,
    /unit-(?:client|refresh|access|turnstile)|fresh-unit-token/,
  );
  assert.deepEqual(
    upstream.calls.map((call) => call.url),
    [verificationURL, tokenURL, sendURL],
  );
});
