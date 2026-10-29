import assert from 'node:assert/strict';
import test from 'node:test';
import { applySecurityHeaders, handleContact } from '../../worker/index';

type ContactEnvironment = Parameters<typeof handleContact>[1];
const origin = 'https://staging.example.com';

function request(body: unknown = {}, headers: Record<string, string> = {}) {
  return new Request(`${origin}/api/contact`, {
    method: 'POST',
    headers: {
      Origin: origin,
      'Content-Type': 'application/json',
      'CF-Connecting-IP': '203.0.113.7',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

test('contact fails closed with missing configuration', async () => {
  let calls = 0;
  const fetcher = (async () => {
    calls++;
    throw new Error('Unexpected external call');
  }) as typeof fetch;
  const response = await handleContact(
    request(),
    {} as ContactEnvironment,
    fetcher,
  );
  assert.equal(response.status, 503);
  assert.equal(calls, 0);
});

test('contact only accepts POST', async () => {
  const response = await handleContact(
    new Request(`${origin}/api/contact`),
    {} as ContactEnvironment,
  );
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('Allow'), 'POST');
});

test('security headers protect asset responses', () => {
  const response = applySecurityHeaders(new Response('asset'));
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.ok(
    response.headers
      .get('Content-Security-Policy')
      ?.includes("frame-ancestors 'none'"),
  );
  assert.ok(response.headers.get('Referrer-Policy'));
});

const validSubmission = {
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  category: 'project',
  message: 'Please help us build an accessible internal reporting workflow.',
  website: '',
  'cf-turnstile-response': 'fresh-test-token',
};
function environment(
  overrides: Partial<ContactEnvironment> = {},
): ContactEnvironment {
  return {
    CONTACT_ENABLED: 'true',
    CONTACT_DELIVERY_VERIFIED: 'true',
    ALLOWED_ORIGIN: origin,
    TURNSTILE_HOSTNAME: 'staging.example.com',
    CONTACT_FROM: 'site@example.com',
    CONTACT_TO: 'hello@example.com',
    TURNSTILE_SECRET: 'unit-test-secret',
    RESEND_API_KEY: 'unit-test-provider-key',
    CONTACT_RATE_LIMITER: { limit: async () => ({ success: true }) },
    ...overrides,
  } as ContactEnvironment;
}
function providerMock(
  verdict: unknown = {
    success: true,
    action: 'contact',
    hostname: 'staging.example.com',
  },
  receipt: unknown = { id: 'accepted-test-message' },
  mailStatus = 200,
) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url === 'https://challenges.cloudflare.com/turnstile/v0/siteverify')
      return Response.json(verdict);
    assert.equal(url, 'https://api.resend.com/emails');
    return Response.json(receipt, { status: mailStatus });
  }) as typeof fetch;
  return { fetcher, calls };
}
async function rejected(response: Response, status: number) {
  assert.equal(response.status, status);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal((await response.json()).ok, false);
}

for (const [label, override] of [
  ['disabled contact', { CONTACT_ENABLED: 'false' }],
  ['unverified delivery', { CONTACT_DELIVERY_VERIFIED: 'false' }],
  ['missing Turnstile secret', { TURNSTILE_SECRET: '' }],
  ['missing email key', { RESEND_API_KEY: '' }],
  ['missing rate binding', { CONTACT_RATE_LIMITER: undefined }],
] as const) {
  test(`${label} prevents all external calls`, async () => {
    const mock = providerMock();
    await rejected(
      await handleContact(
        request(validSubmission),
        environment(override as Partial<ContactEnvironment>),
        mock.fetcher,
      ),
      503,
    );
    assert.equal(mock.calls.length, 0);
  });
}
for (const [label, headers] of [
  ['foreign origin', { Origin: 'https://attacker.example.com' }],
  ['missing origin', { Origin: '' }],
  ['cross-site fetch', { 'Sec-Fetch-Site': 'cross-site' }],
] as const) {
  test(`${label} is rejected before verification or delivery`, async () => {
    const mock = providerMock();
    await rejected(
      await handleContact(
        request(validSubmission, headers),
        environment(),
        mock.fetcher,
      ),
      403,
    );
    assert.equal(mock.calls.length, 0);
  });
}
test('invalid deployment origin fails closed', async () => {
  const mock = providerMock();
  await rejected(
    await handleContact(
      request(validSubmission),
      environment({ ALLOWED_ORIGIN: 'invalid' }),
      mock.fetcher,
    ),
    503,
  );
  assert.equal(mock.calls.length, 0);
});
test('unsupported content type is rejected', async () => {
  await rejected(
    await handleContact(
      request(validSubmission, { 'Content-Type': 'text/plain' }),
      environment(),
    ),
    415,
  );
});
test('rate-limited requests include Retry-After', async () => {
  const env = environment({
    CONTACT_RATE_LIMITER: {
      limit: async () => ({ success: false }),
    } as ContactEnvironment['CONTACT_RATE_LIMITER'],
  });
  const response = await handleContact(request(validSubmission), env);
  assert.equal(response.headers.get('Retry-After'), '60');
  await rejected(response, 429);
});
test('failed rate limiter prevents delivery', async () => {
  const env = environment({
    CONTACT_RATE_LIMITER: {
      limit: async () => {
        throw new Error('offline');
      },
    } as ContactEnvironment['CONTACT_RATE_LIMITER'],
  });
  await rejected(await handleContact(request(validSubmission), env), 503);
});
test('limiter key does not contain the raw visitor IP', async () => {
  let captured = '';
  const env = environment({
    CONTACT_RATE_LIMITER: {
      limit: async ({ key }: { key: string }) => {
        captured = key;
        return { success: false };
      },
    } as ContactEnvironment['CONTACT_RATE_LIMITER'],
  });
  await handleContact(request(validSubmission), env);
  assert.match(captured, /^[a-f0-9]{64}$/);
  assert.ok(!captured.includes('203.0.113.7'));
});
for (const [label, changes, status] of [
  ['invalid category', { category: 'arbitrary-recipient' }, 422],
  ['CRLF email', { email: 'ada@example.com\r\nBcc: other@example.com' }, 422],
  ['CRLF name', { name: 'Ada\r\nInjected' }, 422],
  ['short message', { message: 'Hi' }, 422],
  ['missing token', { 'cf-turnstile-response': '' }, 422],
  ['oversized token', { 'cf-turnstile-response': 'x'.repeat(2049) }, 422],
  ['honeypot', { website: 'https://spam.example.com' }, 400],
] as const) {
  test(`${label} never reaches external services`, async () => {
    const mock = providerMock();
    await rejected(
      await handleContact(
        request({ ...validSubmission, ...changes }),
        environment(),
        mock.fetcher,
      ),
      status,
    );
    assert.equal(mock.calls.length, 0);
  });
}
test('malformed JSON is rejected', async () => {
  const req = request();
  const malformed = new Request(req.url, {
    method: 'POST',
    headers: req.headers,
    body: '{bad json',
  });
  await rejected(await handleContact(malformed, environment()), 400);
});
test('body byte cap cannot be bypassed by a false content length', async () => {
  const mock = providerMock();
  await rejected(
    await handleContact(
      request(
        { ...validSubmission, message: 'x'.repeat(17000) },
        { 'Content-Length': '1' },
      ),
      environment(),
      mock.fetcher,
    ),
    413,
  );
  assert.equal(mock.calls.length, 0);
});
test('declared oversized body is rejected', async () => {
  await rejected(
    await handleContact(
      request(validSubmission, { 'Content-Length': '20000' }),
      environment(),
    ),
    413,
  );
});
for (const [label, verdict] of [
  ['failed or replayed token', { success: false }],
  [
    'wrong action',
    { success: true, action: 'login', hostname: 'staging.example.com' },
  ],
  [
    'wrong hostname',
    { success: true, action: 'contact', hostname: 'attacker.example.com' },
  ],
  [
    'nonboolean success',
    { success: 'true', action: 'contact', hostname: 'staging.example.com' },
  ],
] as const) {
  test(`${label} prevents email`, async () => {
    const mock = providerMock(verdict);
    await rejected(
      await handleContact(
        request(validSubmission),
        environment(),
        mock.fetcher,
      ),
      403,
    );
    assert.equal(mock.calls.length, 1);
  });
}
test('Turnstile network failure cannot produce success', async () => {
  const fetcher = (async () => {
    throw new Error('network failure');
  }) as typeof fetch;
  await rejected(
    await handleContact(request(validSubmission), environment(), fetcher),
    502,
  );
});
for (const [label, receipt, status] of [
  ['provider rejection', { message: 'Rejected' }, 429],
  ['missing provider id', {}, 200],
  ['blank provider id', { id: ' ' }, 200],
] as const) {
  test(`${label} is not reported as accepted`, async () => {
    const mock = providerMock(undefined, receipt, status);
    await rejected(
      await handleContact(
        request(validSubmission),
        environment(),
        mock.fetcher,
      ),
      502,
    );
    assert.equal(mock.calls.length, 2);
  });
}
test('success requires verification and a real-shaped provider acceptance receipt', async () => {
  const mock = providerMock();
  const response = await handleContact(
    request(validSubmission),
    environment(),
    mock.fetcher,
  );
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.ok, true);
  assert.match(result.message, /accepted by our email service/);
  assert.doesNotMatch(result.message, /delivered to|inbox/i);
  assert.equal(mock.calls.length, 2);
  const verification = new URLSearchParams(
    mock.calls[0]!.init!.body as URLSearchParams,
  );
  assert.equal(
    verification.get('response'),
    validSubmission['cf-turnstile-response'],
  );
  const mail = JSON.parse(mock.calls[1]!.init!.body as string);
  assert.deepEqual(mail.to, ['hello@example.com']);
  assert.equal(mail.reply_to, 'ada@example.com');
  assert.equal(mail.subject, 'Website inquiry: Project consultation');
  assert.ok(mail.text.includes(validSubmission.message));
  assert.equal(mail.html, undefined);
});
