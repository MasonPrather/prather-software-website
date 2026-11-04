import assert from 'node:assert/strict';
import { timingSafeEqual } from 'node:crypto';
import test from 'node:test';
import { handleHealth, type HealthEnvironment } from '../../worker/health';
import worker, { handleContact } from '../../worker/index';

// Node lacks this Workers extension; the production runtime is checked separately.
if (!('timingSafeEqual' in crypto.subtle)) {
  Object.defineProperty(crypto.subtle, 'timingSafeEqual', {
    configurable: true,
    value: (left: ArrayBuffer, right: ArrayBuffer) =>
      timingSafeEqual(Buffer.from(left), Buffer.from(right)),
  });
}
const token = 'a'.repeat(64);
const origin = 'https://staging.example.com';
const tokenURL = 'https://oauth2.googleapis.com/token';

function memoryState() {
  const values = new Map<string, string>();
  const operations: string[] = [];
  const namespace = {
    get: async (key: string) => {
      operations.push('get:' + key);
      return values.get(key) ?? null;
    },
    put: async (key: string, value: string) => {
      operations.push('put:' + key);
      values.set(key, value);
    },
    delete: async (key: string) => {
      operations.push('delete:' + key);
      values.delete(key);
    },
  } as HealthEnvironment['MONITORING_STATE'];
  return { values, operations, namespace };
}

function environment(
  overrides: Partial<HealthEnvironment> = {},
): HealthEnvironment {
  return {
    CONTACT_ENABLED: 'true',
    CONTACT_DELIVERY_VERIFIED: 'true',
    ALLOWED_ORIGIN: origin,
    TURNSTILE_HOSTNAME: 'staging.example.com',
    CONTACT_FROM: 'site@example.com',
    CONTACT_TO: 'hello@example.com',
    TURNSTILE_SECRET: 'unit-turnstile-secret',
    GMAIL_CLIENT_ID: 'unit-client-id',
    GMAIL_CLIENT_SECRET: 'unit-client-secret',
    GMAIL_REFRESH_TOKEN: 'unit-refresh-token',
    HEALTHCHECK_TOKEN: token,
    MONITORING_STATE: memoryState().namespace,
    CONTACT_RATE_LIMITER: { limit: async () => ({ success: true }) },
    ...overrides,
  } as HealthEnvironment;
}

function probe(changes: RequestInit = {}, route = '/api/health') {
  return new Request(origin + route, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token },
    ...changes,
  });
}

function upstream(
  makeResponse: () => Response = () =>
    Response.json({
      access_token: 'unit-access-token',
      token_type: 'Bearer',
      scope: 'https://www.googleapis.com/auth/gmail.send',
    }),
) {
  const calls: { input: RequestInfo | URL; init?: RequestInit }[] = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });
    assert.equal(
      String(input),
      tokenURL,
      'A health probe must never send email',
    );
    return makeResponse();
  }) as typeof fetch;
  return { calls, fetcher };
}

test('public health reports coarse contact availability without contacting Google', async () => {
  for (const [env, available] of [
    [environment(), true],
    [environment({ CONTACT_ENABLED: 'false' }), false],
  ] as const) {
    const mock = upstream();
    const response = await handleHealth(
      new Request(origin + '/api/health'),
      env,
      mock.fetcher,
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      ok: true,
      contactAvailable: available,
    });
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.equal(response.headers.get('X-Robots-Tag'), 'noindex, nofollow');
    assert.equal(mock.calls.length, 0);
  }
});

test('public health never reads private incident state', async () => {
  const state = memoryState();
  state.values.set('contact:delivery', 'a private incident marker');
  const mock = upstream();
  const response = await handleHealth(
    new Request(origin + '/api/health'),
    environment({ MONITORING_STATE: state.namespace }),
    mock.fetcher,
  );
  assert.deepEqual(await response.json(), { ok: true, contactAvailable: true });
  assert.deepEqual(state.operations, []);
  assert.equal(mock.calls.length, 0);
});

test('health route uses Worker security headers and never falls through to static assets', async () => {
  for (const route of ['/api/health', '/api/health/']) {
    let assets = 0;
    const response = await worker.fetch(new Request(origin + route), {
      ...environment(),
      SITE_INDEXING: 'enabled',
      ASSETS: {
        fetch: () => {
          assets++;
          return new Response('unexpected');
        },
      },
    } as unknown as Env);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('X-Robots-Tag'), 'noindex, nofollow');
    assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
    assert.equal(assets, 0);
  }
});

for (const [label, request, env, status] of [
  ['missing authorization', probe({ headers: {} }), environment(), 401],
  [
    'wrong authorization',
    probe({ headers: { Authorization: 'Bearer ' + 'b'.repeat(64) } }),
    environment(),
    401,
  ],
  [
    'different length',
    probe({ headers: { Authorization: 'Bearer short' } }),
    environment(),
    401,
  ],
  [
    'wrong scheme',
    probe({ headers: { Authorization: 'Basic ' + token } }),
    environment(),
    401,
  ],
  [
    'oversized authorization',
    probe({ headers: { Authorization: 'Bearer ' + 'x'.repeat(1024) } }),
    environment(),
    401,
  ],
  [
    'missing configured token',
    probe(),
    environment({ HEALTHCHECK_TOKEN: undefined }),
    503,
  ],
  [
    'weak configured token',
    probe(),
    environment({ HEALTHCHECK_TOKEN: 'short' }),
    503,
  ],
  [
    'disabled collection',
    probe(),
    environment({ CONTACT_ENABLED: 'false' }),
    503,
  ],
  [
    'unverified collection',
    probe(),
    environment({ CONTACT_DELIVERY_VERIFIED: 'false' }),
    503,
  ],
  [
    'missing Gmail credential',
    probe(),
    environment({ GMAIL_REFRESH_TOKEN: undefined }),
    503,
  ],
  [
    'missing Turnstile credential',
    probe(),
    environment({ TURNSTILE_SECRET: undefined }),
    503,
  ],
  [
    'missing monitoring store',
    probe(),
    environment({ MONITORING_STATE: undefined }),
    503,
  ],
  [
    'request body',
    probe({ body: 'must not be parsed or forwarded' }),
    environment(),
    400,
  ],
  [
    'query parameters',
    probe({}, '/api/health?token=must-not-be-used'),
    environment(),
    400,
  ],
  ['wrong method', probe({ method: 'DELETE' }), environment(), 405],
] as const) {
  test(`health ${label} never reaches an upstream`, async () => {
    const mock = upstream();
    const response = await handleHealth(request, env, mock.fetcher);
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), { ok: false });
    assert.equal(mock.calls.length, 0);
    if (status === 405)
      assert.equal(response.headers.get('Allow'), 'GET, POST');
  });
}

test('authenticated health confirms send-only authorization with one bounded refresh and no email', async () => {
  const mock = upstream();
  const response = await handleHealth(probe(), environment(), mock.fetcher);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(mock.calls.length, 1);
  const call = mock.calls[0]!;
  assert.equal(call.init?.method, 'POST');
  assert.equal(call.init?.redirect, 'manual');
  assert.ok(call.init?.signal instanceof AbortSignal);
  const form = new URLSearchParams(call.init?.body as URLSearchParams);
  assert.deepEqual([...form.keys()].sort(), [
    'client_id',
    'client_secret',
    'grant_type',
    'refresh_token',
  ]);
  assert.equal(form.get('grant_type'), 'refresh_token');
});

test('authenticated zero-byte request streams are accepted rather than mistaken for payloads', async () => {
  for (const body of [
    '',
    new ReadableStream({
      start(controller) {
        controller.close();
      },
    }),
  ]) {
    const mock = upstream();
    const response = await handleHealth(
      probe({ body, duplex: 'half' } as RequestInit),
      environment(),
      mock.fetcher,
    );
    assert.equal(response.status, 200);
    assert.equal(mock.calls.length, 1);
  }
});

test('actual payload bytes are rejected even with a declared zero length', async () => {
  const mock = upstream();
  const response = await handleHealth(
    probe({
      headers: { Authorization: 'Bearer ' + token, 'Content-Length': '0' },
      body: 'x',
    }),
    environment(),
    mock.fetcher,
  );
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { ok: false });
  assert.equal(mock.calls.length, 0);
});

test('an authenticated stalled body is canceled by a bounded deadline without reaching Google', async () => {
  let canceled = false;
  const body = new ReadableStream({
    cancel() {
      canceled = true;
    },
  });
  const mock = upstream();
  const started = performance.now();
  const response = await handleHealth(
    probe({ body, duplex: 'half' } as RequestInit),
    environment(),
    mock.fetcher,
  );
  assert.equal(response.status, 400);
  assert.equal(canceled, true);
  assert.ok(
    performance.now() - started < 2500,
    'Stalled request exceeded its body deadline',
  );
  assert.equal(mock.calls.length, 0);
});

for (const key of ['contact:delivery', 'contact:verification']) {
  test(`an active ${key} incident prevents a healthy authorization probe without sending`, async () => {
    const state = memoryState();
    state.values.set(
      key,
      JSON.stringify({ category: key.split(':')[1], at: Date.now() }),
    );
    const mock = upstream();
    const response = await handleHealth(
      probe(),
      environment({ MONITORING_STATE: state.namespace }),
      mock.fetcher,
    );
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { ok: false });
    assert.equal(mock.calls.length, 0);
    assert.equal(
      state.values.size,
      1,
      'Probes must not expire or clear unresolved incidents',
    );
  });
}

test('unavailable monitoring state makes an authenticated probe fail closed', async (context) => {
  context.mock.method(console, 'warn', () => {});
  const state = memoryState();
  state.namespace!.get = async () => {
    throw new Error('private store error');
  };
  const mock = upstream();
  const response = await handleHealth(
    probe(),
    environment({ MONITORING_STATE: state.namespace }),
    mock.fetcher,
  );
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { ok: false });
  assert.equal(mock.calls.length, 0);
});

function contactRequest() {
  return new Request(origin + '/api/contact', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Fixture Inquiry',
      email: 'fixture@example.com',
      category: 'general',
      message: 'Inert local unit test inquiry; no external request is made.',
      website: '',
      'cf-turnstile-response': 'unit-test-token',
    }),
  });
}

function contactUpstream(
  options: {
    verifyStatus?: number;
    verifyValid?: boolean;
    delivery?: () => Response;
    refresh?: () => Response;
  } = {},
) {
  const fetcher = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === 'https://challenges.cloudflare.com/turnstile/v0/siteverify')
      return Response.json(
        {
          success: options.verifyValid ?? true,
          action: 'contact',
          hostname: 'staging.example.com',
        },
        { status: options.verifyStatus ?? 200 },
      );
    if (url === tokenURL)
      return options.refresh
        ? options.refresh()
        : Response.json({ access_token: 'unit-access-token' });
    assert.equal(
      url,
      'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
    );
    return options.delivery
      ? options.delivery()
      : Response.json({ id: 'unit-accepted-message' });
  }) as typeof fetch;
  return fetcher;
}

for (const [label, options, incident] of [
  [
    'delivery rejection',
    { delivery: () => new Response('private provider data', { status: 403 }) },
    'delivery',
  ],
  [
    'uncertain refresh exception',
    {
      refresh: () => {
        throw new Error('private credentials');
      },
    },
    'delivery',
  ],
  ['verification service failure', { verifyStatus: 503 }, 'verification'],
] as const) {
  test(`contact ${label} records only fixed incident metadata`, async (context) => {
    context.mock.method(console, 'warn', () => {});
    const state = memoryState();
    const response = await handleContact(
      contactRequest(),
      environment({ MONITORING_STATE: state.namespace }),
      contactUpstream(options),
    );
    assert.equal(response.status, 502);
    const marker = JSON.parse(state.values.get('contact:' + incident)!);
    assert.deepEqual(Object.keys(marker).sort(), ['at', 'category']);
    assert.equal(marker.category, incident);
    assert.ok(Number.isSafeInteger(marker.at));
    assert.equal(state.values.size, 1);
    assert.doesNotMatch(
      JSON.stringify(marker),
      /fixture|provider|credentials|token|@/,
    );
  });
}

test('ordinary invalid or replayed verification neither records incidents nor clears an existing one', async () => {
  const state = memoryState();
  state.values.set('contact:verification', 'existing incident');
  const response = await handleContact(
    contactRequest(),
    environment({ MONITORING_STATE: state.namespace }),
    contactUpstream({ verifyValid: false }),
  );
  assert.equal(response.status, 403);
  assert.deepEqual(state.operations, []);
  assert.equal(state.values.get('contact:verification'), 'existing incident');
});

test('valid verification clears only its incident; rejected Gmail keeps the delivery incident', async (context) => {
  context.mock.method(console, 'warn', () => {});
  const state = memoryState();
  state.values.set('contact:verification', 'existing incident');
  state.values.set('contact:delivery', 'existing delivery incident');
  const response = await handleContact(
    contactRequest(),
    environment({ MONITORING_STATE: state.namespace }),
    contactUpstream({ delivery: () => Response.json({}) }),
  );
  assert.equal(response.status, 502);
  assert.equal(state.values.has('contact:verification'), false);
  assert.equal(state.values.has('contact:delivery'), true);
});

test('only a confirmed Gmail receipt clears a prior delivery incident', async () => {
  const state = memoryState();
  state.values.set('contact:delivery', 'existing incident');
  const response = await handleContact(
    contactRequest(),
    environment({ MONITORING_STATE: state.namespace }),
    contactUpstream(),
  );
  assert.equal(response.status, 200);
  assert.equal(state.values.has('contact:delivery'), false);
});

test('failed incident updates never turn an accepted inquiry into a failed response', async (context) => {
  const warning = context.mock.method(console, 'warn', () => {});
  const state = memoryState();
  state.namespace!.delete = async () => {
    throw new Error('private store error fixture@example.com');
  };
  const response = await handleContact(
    contactRequest(),
    environment({ MONITORING_STATE: state.namespace }),
    contactUpstream(),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(
    warning.mock.calls.map((call) => JSON.parse(call.arguments[0] as string)),
    [
      { event: 'contact_monitoring_state_unavailable', operation: 'clear' },
      { event: 'contact_monitoring_state_unavailable', operation: 'clear' },
    ],
  );
});

test('production context owns incident updates without delaying the inquiry response', async () => {
  const state = memoryState();
  const finishDeletes: (() => void)[] = [];
  state.namespace!.delete = () =>
    new Promise<void>((resolve) => {
      finishDeletes.push(resolve);
    });
  const background: Promise<unknown>[] = [];
  const response = await handleContact(
    contactRequest(),
    environment({ MONITORING_STATE: state.namespace }),
    contactUpstream(),
    {
      waitUntil: (task) => {
        background.push(task);
      },
    },
  );
  assert.equal(response.status, 200);
  assert.equal(background.length, 2);
  // Both nonblocking updates can finish once the simulated platform permits I/O.
  for (const finishDelete of finishDeletes) finishDelete();
  await Promise.all(background);
});

for (const [label, makeResponse] of [
  [
    'revoked grant',
    () =>
      Response.json(
        { error: 'invalid_grant', private: 'unit-client-secret' },
        { status: 400 },
      ),
  ],
  [
    'redirect',
    () =>
      new Response(null, {
        status: 302,
        headers: {
          Location: 'https://attacker.example.com/unit-refresh-token',
        },
      }),
  ],
  [
    'missing token',
    () =>
      Response.json({
        token_type: 'Bearer',
        scope: 'https://www.googleapis.com/auth/gmail.send',
      }),
  ],
  [
    'malformed token',
    () =>
      Response.json({
        access_token: 'private\r\nheader',
        token_type: 'Bearer',
        scope: 'https://www.googleapis.com/auth/gmail.send',
      }),
  ],
  [
    'missing scope',
    () =>
      Response.json({
        access_token: 'unit-access-token',
        token_type: 'Bearer',
      }),
  ],
  [
    'wrong scope',
    () =>
      Response.json({
        access_token: 'unit-access-token',
        token_type: 'Bearer',
        scope: 'https://www.googleapis.com/auth/gmail.readonly',
      }),
  ],
  [
    'broader scope',
    () =>
      Response.json({
        access_token: 'unit-access-token',
        token_type: 'Bearer',
        scope:
          'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly',
      }),
  ],
  [
    'wrong token type',
    () =>
      Response.json({
        access_token: 'unit-access-token',
        token_type: 'MAC',
        scope: 'https://www.googleapis.com/auth/gmail.send',
      }),
  ],
  [
    'oversized response',
    () =>
      Response.json({
        access_token: 'unit-access-token',
        padding: 'x'.repeat(33_000),
      }),
  ],
  ['invalid JSON', () => new Response('unit-refresh-token {malformed')],
  [
    'network exception',
    () => {
      throw new Error('unit-client-secret unit-refresh-token');
    },
  ],
] as const) {
  test(`health ${label} fails closed without exposing provider data or retrying`, async (context) => {
    const warning = context.mock.method(console, 'warn', () => {});
    const mock = upstream(makeResponse);
    const response = await handleHealth(probe(), environment(), mock.fetcher);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { ok: false });
    assert.equal(mock.calls.length, 1);
    const entries = warning.mock.calls.map((call) =>
      JSON.parse(call.arguments[0] as string),
    );
    assert.equal(entries.length, 1);
    for (const entry of entries) {
      assert.equal(entry.event, 'contact_authorization_unavailable');
      assert.equal(entry.stage, 'oauth-refresh');
      assert.ok(
        ['http', 'invalid-response', 'exception', 'timeout'].includes(
          entry.reason,
        ),
      );
      assert.ok(
        Object.keys(entry).every((key) =>
          ['event', 'stage', 'reason', 'status'].includes(key),
        ),
      );
    }
    assert.doesNotMatch(
      JSON.stringify(entries),
      /unit-(?:access|client|refresh)|attacker|malformed|readonly/,
    );
  });
}
