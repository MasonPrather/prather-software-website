import assert from 'node:assert/strict';
import test from 'node:test';
import { runMonitor } from '../../scripts/monitor.mjs';

const site = 'https://prathersoftware.com';
const api =
  'https://api.github.com/repos/MasonPrather/prather-software-website';
const productionMarker = '<!-- prather-website-monitor:production:v1 -->';
const testMarker = '<!-- prather-website-monitor:self-test:v1 -->';
const token = 'a'.repeat(64);
const env = {
  GITHUB_TOKEN: 'unit-github-token',
  WEBSITE_HEALTHCHECK_TOKEN: token,
  GITHUB_REPOSITORY: 'MasonPrather/prather-software-website',
  GITHUB_SERVER_URL: 'https://github.com',
  GITHUB_ACTIONS: 'true',
  GITHUB_REF: 'refs/heads/main',
  GITHUB_EVENT_NAME: 'workflow_dispatch',
  GITHUB_RUN_ID: '1234',
};

function fixture() {
  const calls: {
    url: string;
    method: string;
    headers: Headers;
    body?: unknown;
  }[] = [];
  const issues: any[] = [];
  const comments: { issue: number; body: string }[] = [];
  const faults = new Map<string, () => Response>();
  let nextIssue = 1;
  let nextComment = 1;
  const fetcher = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const method = init.method ?? 'GET';
    assert.equal(init.redirect, 'manual');
    assert.ok(init.signal instanceof AbortSignal);
    calls.push({
      url: url.href,
      method,
      headers: new Headers(init.headers),
      body: init.body,
    });
    const fault = faults.get(method + ' ' + url.href);
    if (fault) return fault();
    if (url.origin === site) {
      assert.equal(url.search, '');
      if (url.pathname === '/')
        return new Response(
          '<title>Prather Software</title><h1>Engineering</h1>',
        );
      if (url.pathname === '/contact/')
        return new Response(
          '<form id="contact-form" data-enabled="true" data-sitekey="0x4AAAAAAFsABGQE4Na23nbs"><fieldset></fieldset></form>',
        );
      assert.equal(url.pathname, '/api/health');
      return Response.json(
        method === 'GET' ? { ok: true, contactAvailable: true } : { ok: true },
      );
    }
    assert.equal(url.origin, 'https://api.github.com');
    assert.ok(url.href.startsWith(api + '/issues'));
    const suffix = url.pathname.slice(new URL(api).pathname.length);
    if (method === 'GET') {
      assert.equal(suffix, '/issues');
      const page = Number(url.searchParams.get('page'));
      assert.equal(url.searchParams.get('labels'), 'website-monitor');
      return Response.json(
        issues
          .filter(
            (issue) =>
              issue.state === 'open' &&
              issue.labels.includes('website-monitor'),
          )
          .slice((page - 1) * 100, page * 100),
      );
    }
    const body = JSON.parse(init.body as string);
    if (method === 'POST' && suffix === '/issues') {
      const issue = {
        ...body,
        number: nextIssue++,
        state: 'open',
        user: { login: 'github-actions[bot]' },
        assignees: body.assignees.map((login: string) => ({ login })),
      };
      issues.push(issue);
      return Response.json(issue, { status: 201 });
    }
    const number = Number(suffix.split('/')[2]);
    const issue = issues.find((item) => item.number === number);
    assert.ok(issue, 'Only existing fixed-repository issues may be changed');
    if (method === 'PATCH') {
      Object.assign(issue, body);
      return Response.json(issue);
    }
    assert.equal(method, 'POST');
    assert.equal(suffix, `/issues/${number}/comments`);
    comments.push({ issue: number, body: body.body });
    return Response.json({ id: nextComment++ }, { status: 201 });
  }) as typeof fetch;
  return { calls, issues, comments, faults, fetcher };
}
const mutations = (calls: ReturnType<typeof fixture>['calls']) =>
  calls.filter((call) => call.url.startsWith(api) && call.method !== 'GET');

test('healthy monitoring checks only fixed public paths and one authenticated non-mail probe', async () => {
  const mock = fixture();
  const result = await runMonitor({ fetcher: mock.fetcher, env });
  assert.deepEqual(result, {
    ok: true,
    selfTest: false,
    failures: [],
    notification: 'healthy',
  });
  const siteCalls = mock.calls.filter((call) => call.url.startsWith(site));
  assert.equal(siteCalls.length, 4);
  for (const call of siteCalls) {
    assert.notEqual(new URL(call.url).pathname, '/api/contact');
    assert.equal(
      call.headers.get('Authorization'),
      call.method === 'POST' ? 'Bearer ' + token : null,
    );
    assert.equal(call.body, undefined);
  }
  assert.equal(mutations(mock.calls).length, 0);
});

test('one persistent failure creates one assigned incident and stays quiet on unchanged runs', async () => {
  const mock = fixture();
  mock.faults.set(
    'GET ' + site + '/',
    () => new Response('private response contents', { status: 503 }),
  );
  const first = await runMonitor({ fetcher: mock.fetcher, env });
  assert.equal(first.ok, false);
  assert.equal(first.notification, 'created');
  assert.equal(mock.issues.length, 1);
  assert.ok(mock.issues[0].body.includes(productionMarker));
  assert.deepEqual(mock.issues[0].assignees, [{ login: 'MasonPrather' }]);
  const count = mutations(mock.calls).length;
  const second = await runMonitor({
    fetcher: mock.fetcher,
    env: { ...env, GITHUB_RUN_ID: '9999' },
  });
  assert.equal(second.notification, 'unchanged');
  assert.equal(mutations(mock.calls).length, count);
  assert.equal(mock.comments.length, 0);
  assert.doesNotMatch(mock.issues[0].body, /private response contents/);
});

test('a changed failure set updates the incident once without unchanged-state comments', async () => {
  const mock = fixture();
  mock.faults.set(
    'GET ' + site + '/',
    () => new Response(null, { status: 503 }),
  );
  await runMonitor({ fetcher: mock.fetcher, env });
  mock.faults.set(
    'GET ' + site + '/contact/',
    () => new Response('<form id="contact-form" data-enabled="false"></form>'),
  );
  const changed = await runMonitor({ fetcher: mock.fetcher, env });
  assert.equal(changed.notification, 'updated');
  assert.equal(mock.issues.length, 1);
  assert.equal(
    mutations(mock.calls).filter((call) => call.method === 'PATCH').length,
    1,
  );
  assert.match(mock.issues[0].body, /contact-page: unexpected-content/);
  assert.equal(mock.comments.length, 0);
  assert.equal(
    (await runMonitor({ fetcher: mock.fetcher, env })).notification,
    'unchanged',
  );
});

test('recovery comments and closes only the owned incident, then stays quiet', async () => {
  const mock = fixture();
  mock.faults.set('POST ' + site + '/api/health', () =>
    Response.json({ ok: false }, { status: 503 }),
  );
  await runMonitor({ fetcher: mock.fetcher, env });
  mock.faults.clear();
  const result = await runMonitor({ fetcher: mock.fetcher, env });
  assert.equal(result.ok, true);
  assert.equal(result.notification, 'recovered');
  assert.equal(mock.issues[0].state, 'closed');
  assert.equal(mock.comments.length, 1);
  const count = mutations(mock.calls).length;
  assert.equal(
    (await runMonitor({ fetcher: mock.fetcher, env })).notification,
    'healthy',
  );
  assert.equal(mutations(mock.calls).length, count);
});

test('untrusted or unrelated issues cannot be modified by a healthy monitor', async () => {
  const mock = fixture();
  for (const changes of [
    { user: { login: 'attacker' } },
    { body: testMarker },
    { assignees: [] },
    { pull_request: {} },
  ]) {
    mock.issues.push({
      number: 100 + mock.issues.length,
      state: 'open',
      body: productionMarker,
      user: { login: 'github-actions[bot]' },
      assignees: [{ login: 'MasonPrather' }],
      labels: ['website-monitor'],
      ...changes,
    });
  }
  const result = await runMonitor({ fetcher: mock.fetcher, env });
  assert.equal(result.notification, 'healthy');
  assert.equal(mutations(mock.calls).length, 0);
  assert.ok(mock.issues.every((issue) => issue.state === 'open'));
});

test('a failed incident close cannot spam recovery comments on repeated healthy runs', async () => {
  const mock = fixture();
  mock.faults.set(
    'GET ' + site + '/',
    () => new Response(null, { status: 503 }),
  );
  await runMonitor({ fetcher: mock.fetcher, env });
  mock.faults.clear();
  mock.faults.set(
    'PATCH ' + api + '/issues/1',
    () => new Response('private failure', { status: 500 }),
  );
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await runMonitor({ fetcher: mock.fetcher, env });
    assert.equal(result.ok, false);
    assert.equal(result.notification, 'failed');
  }
  assert.equal(mock.comments.length, 0);
  assert.equal(mock.issues[0].state, 'open');
});

test('self-test creates and recovers a separate TEST incident without checking or touching production', async () => {
  const mock = fixture();
  mock.faults.set(
    'GET ' + site + '/',
    () => new Response(null, { status: 503 }),
  );
  await runMonitor({ fetcher: mock.fetcher, env });
  const start = mock.calls.length;
  const result = await runMonitor({
    fetcher: mock.fetcher,
    env,
    selfTest: true,
  });
  assert.deepEqual(result, {
    ok: true,
    selfTest: true,
    failures: [],
    notification: 'recovered',
  });
  assert.equal(mock.issues[0].state, 'open');
  assert.equal(mock.issues[1].state, 'closed');
  assert.match(mock.issues[1].title, /^\[TEST\]/);
  assert.match(mock.issues[1].body, /not a production outage/);
  assert.ok(mock.issues[1].body.includes(testMarker));
  assert.ok(mock.calls.slice(start).every((call) => call.url.startsWith(api)));
  assert.equal(mock.comments[0]?.issue, mock.issues[1].number);
});

test('notification failures cannot make failed probes successful or expose response data', async () => {
  const mock = fixture();
  mock.faults.set('POST ' + site + '/api/health', () => {
    throw new Error('unit-github-token ' + token + ' private@example.com');
  });
  mock.faults.set(
    'GET ' +
      api +
      '/issues?state=open&labels=website-monitor&per_page=100&page=1',
    () =>
      new Response('unit-github-token private@example.com', { status: 500 }),
  );
  const result = await runMonitor({ fetcher: mock.fetcher, env });
  assert.equal(result.ok, false);
  assert.equal(result.notification, 'failed');
  assert.deepEqual(result.failures, [
    { check: 'contact-readiness', code: 'unavailable' },
  ]);
  assert.doesNotMatch(
    JSON.stringify(result),
    /unit-github|a{64}|private@example/,
  );
});

test('missing notification token is reported as unsuccessful even on a healthy website', async () => {
  const mock = fixture();
  const result = await runMonitor({
    fetcher: mock.fetcher,
    env: { ...env, GITHUB_TOKEN: '' },
  });
  assert.equal(result.ok, false);
  assert.equal(result.notification, 'failed');
  assert.equal(mock.calls.filter((call) => call.url.startsWith(api)).length, 0);
});

test('missing private probe token never sends an unauthenticated deep probe', async () => {
  const mock = fixture();
  const result = await runMonitor({
    fetcher: mock.fetcher,
    env: { ...env, WEBSITE_HEALTHCHECK_TOKEN: '' },
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.failures, [
    { check: 'contact-readiness', code: 'not-configured' },
  ]);
  assert.equal(
    mock.calls.filter(
      (call) => call.url.startsWith(site) && call.method === 'POST',
    ).length,
    0,
  );
});

test('redirects never forward either credential to a supplied location', async () => {
  const mock = fixture();
  mock.faults.set(
    'GET ' + site + '/',
    () =>
      new Response(null, {
        status: 302,
        headers: { Location: 'https://attacker.example.com/' },
      }),
  );
  const result = await runMonitor({ fetcher: mock.fetcher, env });
  assert.equal(result.ok, false);
  assert.deepEqual(result.failures, [
    { check: 'homepage', code: 'http', status: 302 },
  ]);
  assert.ok(
    mock.calls.every((call) =>
      [site, 'https://api.github.com'].includes(new URL(call.url).origin),
    ),
  );
});

test('oversized or malformed response content never enters incident descriptions', async () => {
  const mock = fixture();
  mock.faults.set(
    'GET ' + site + '/',
    () => new Response('private@example.com'.repeat(20_000)),
  );
  mock.faults.set(
    'GET ' + site + '/api/health',
    () => new Response('private@example.com {bad-json'),
  );
  const result = await runMonitor({ fetcher: mock.fetcher, env });
  assert.equal(result.ok, false);
  assert.doesNotMatch(JSON.stringify(result), /private@example|bad-json/);
  assert.doesNotMatch(mock.issues[0].body, /private@example|bad-json/);
});

test('untrusted repository, server, branch, or event stops before all network calls', async () => {
  for (const changes of [
    { GITHUB_REPOSITORY: 'attacker/fork' },
    { GITHUB_SERVER_URL: 'https://attacker.example.com' },
    { GITHUB_REF: 'refs/heads/feature/test' },
    { GITHUB_EVENT_NAME: 'pull_request' },
  ]) {
    const mock = fixture();
    await assert.rejects(
      runMonitor({ fetcher: mock.fetcher, env: { ...env, ...changes } }),
      /Untrusted monitor execution context/,
    );
    assert.equal(mock.calls.length, 0);
  }
});

test('duplicate trusted markers fail safely instead of changing an arbitrary incident', async () => {
  const mock = fixture();
  for (let number = 100; number < 102; number++)
    mock.issues.push({
      number,
      state: 'open',
      body: productionMarker,
      user: { login: 'github-actions[bot]' },
      assignees: [{ login: 'MasonPrather' }],
      labels: ['website-monitor'],
    });
  const result = await runMonitor({ fetcher: mock.fetcher, env });
  assert.equal(result.ok, false);
  assert.equal(result.notification, 'failed');
  assert.equal(mutations(mock.calls).length, 0);
});
