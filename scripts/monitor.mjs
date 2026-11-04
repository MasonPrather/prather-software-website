import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const SITE = 'https://prathersoftware.com';
const REPOSITORY = 'MasonPrather/prather-software-website';
const OWNER = 'MasonPrather';
const API = `https://api.github.com/repos/${REPOSITORY}`;
const LABEL = 'website-monitor';
const MARKERS = {
  production: '<!-- prather-website-monitor:production:v1 -->',
  test: '<!-- prather-website-monitor:self-test:v1 -->',
};
const TITLES = {
  production: 'Website monitor: public site needs attention',
  test: '[TEST] Website monitor notification check',
};
const metadata = JSON.parse(
  await readFile(
    new URL('../ops/turnstile-widgets.json', import.meta.url),
    'utf8',
  ),
);
const sitekey = metadata.production.sitekey;

async function boundedText(response, limit) {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new Error('response-limit');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

function failure(check, code, status) {
  return {
    check,
    code,
    ...(Number.isInteger(status) && status >= 100 && status <= 599
      ? { status }
      : {}),
  };
}

/** Fixed origins only; callers cannot supply another site or repository. */
export async function runMonitor({
  fetcher = fetch,
  env = process.env,
  selfTest = false,
} = {}) {
  if (
    (env.GITHUB_REPOSITORY && env.GITHUB_REPOSITORY !== REPOSITORY) ||
    (env.GITHUB_SERVER_URL && env.GITHUB_SERVER_URL !== 'https://github.com') ||
    (env.GITHUB_ACTIONS === 'true' &&
      (env.GITHUB_REF !== 'refs/heads/main' ||
        !['schedule', 'workflow_dispatch'].includes(env.GITHUB_EVENT_NAME)))
  )
    throw new Error('Untrusted monitor execution context.');
  const mode = selfTest ? 'test' : 'production';
  const marker = MARKERS[mode];
  const run = /^\d+$/.test(env.GITHUB_RUN_ID ?? '')
    ? `https://github.com/${REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`
    : null;

  async function siteRequest(path, init = {}) {
    if (!['/', '/contact/', '/api/health'].includes(path))
      throw new Error('Invalid monitor route.');
    return fetcher(SITE + path, {
      ...init,
      redirect: 'manual',
      signal: AbortSignal.timeout(15_000),
    });
  }
  async function check(checkName, path, inspect, init = {}) {
    try {
      const response = await siteRequest(path, init);
      if (response.status !== 200) {
        await response.body?.cancel();
        return failure(checkName, 'http', response.status);
      }
      const text = await boundedText(response, 262_144);
      return inspect(text) ? null : failure(checkName, 'unexpected-content');
    } catch {
      return failure(checkName, 'unavailable');
    }
  }
  async function github(path, init = {}) {
    if (
      typeof env.GITHUB_TOKEN !== 'string' ||
      !/^[\x21-\x7e]{1,4096}$/.test(env.GITHUB_TOKEN)
    )
      throw new Error('Notification authorization unavailable.');
    if (
      !/^\/issues(?:\?state=open&labels=website-monitor&per_page=100&page=[1-5]|\/[1-9]\d*(?:\/comments)?)?$/.test(
        path,
      )
    )
      throw new Error('Invalid notification route.');
    const response = await fetcher(API + path, {
      ...init,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: 'Bearer ' + env.GITHUB_TOKEN,
        'X-GitHub-Api-Version': '2026-03-10',
        'Content-Type': 'application/json',
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error('Notification request rejected.');
    }
    return JSON.parse(await boundedText(response, 1_048_576));
  }
  async function incident() {
    const matches = [];
    for (let page = 1; page <= 5; page++) {
      const issues = await github(
        `/issues?state=open&labels=${LABEL}&per_page=100&page=${page}`,
      );
      if (!Array.isArray(issues))
        throw new Error('Notification inventory unavailable.');
      for (const issue of issues) {
        const labels =
          issue.labels?.map((label) =>
            typeof label === 'string' ? label : label.name,
          ) ?? [];
        if (
          !issue.pull_request &&
          issue.state === 'open' &&
          Number.isSafeInteger(issue.number) &&
          issue.number > 0 &&
          ['github-actions[bot]', OWNER].includes(issue.user?.login) &&
          labels.includes(LABEL) &&
          issue.assignees?.some((user) => user.login === OWNER) &&
          typeof issue.body === 'string' &&
          issue.body.includes(marker)
        )
          matches.push(issue);
      }
      if (issues.length < 100) break;
      if (page === 5) throw new Error('Notification inventory incomplete.');
    }
    if (matches.length > 1) throw new Error('Ambiguous notification incident.');
    return matches[0];
  }
  function issueBody(failures) {
    const signature = failures
      .map(
        (item) =>
          `${item.check}:${item.code}${item.status ? ':' + item.status : ''}`,
      )
      .sort()
      .join('|');
    return (
      `${marker}\n<!-- prather-monitor-checks:${signature} -->\n\n` +
      (selfTest
        ? 'This is a deliberate notification test, not a production outage.\n\n'
        : 'The scheduled website checks need attention.\n\n') +
      failures
        .map(
          (item) =>
            `- ${item.check}: ${item.code}${item.status ? ` (HTTP ${item.status})` : ''}`,
        )
        .join('\n') +
      '\n\nNo inquiry was sent or retried by this monitor.' +
      (run ? `\n\n[Workflow run](${run})` : '')
    );
  }
  async function notify(failures) {
    try {
      const existing = await incident();
      if (failures.length) {
        const body = issueBody(failures);
        if (!existing) {
          const created = await github('/issues', {
            method: 'POST',
            body: JSON.stringify({
              title: TITLES[mode],
              body,
              labels: [LABEL],
              assignees: [OWNER],
            }),
          });
          if (!Number.isSafeInteger(created?.number) || created.number <= 0)
            throw new Error('Notification creation was not confirmed.');
          return 'created';
        }
        const signature = body.match(
          /<!-- prather-monitor-checks:[^\n]+ -->/,
        )?.[0];
        if (signature && existing.body.includes(signature)) return 'unchanged';
        const updated = await github(`/issues/${existing.number}`, {
          method: 'PATCH',
          body: JSON.stringify({ body }),
        });
        if (updated?.number !== existing.number)
          throw new Error('Notification update was not confirmed.');
        return 'updated';
      }
      if (!existing) return 'healthy';
      // Close first so a failed close cannot produce another recovery comment
      // on every healthy run. A later comment failure is reported honestly.
      const closed = await github(`/issues/${existing.number}`, {
        method: 'PATCH',
        body: JSON.stringify({ state: 'closed', state_reason: 'completed' }),
      });
      if (closed?.number !== existing.number || closed.state !== 'closed')
        throw new Error('Incident closure was not confirmed.');
      const comment = await github(`/issues/${existing.number}/comments`, {
        method: 'POST',
        body: JSON.stringify({
          body: selfTest
            ? 'Notification self-test completed; the simulated condition is cleared. Production monitoring was not changed.'
            : 'All monitored checks are passing again. No inquiry was sent or retried by this monitor.',
        }),
      });
      if (!Number.isSafeInteger(comment?.id) || comment.id <= 0)
        throw new Error('Recovery comment was not confirmed.');
      return 'recovered';
    } catch {
      return 'failed';
    }
  }

  if (selfTest) {
    const failures = [failure('notification-self-test', 'simulated')];
    const notification = await notify(failures);
    if (notification === 'failed')
      return { ok: false, selfTest: true, failures, notification };
    const recovery = await notify([]);
    return {
      ok: recovery === 'recovered',
      selfTest: true,
      failures: [],
      notification: recovery,
    };
  }
  const secret = env.WEBSITE_HEALTHCHECK_TOKEN;
  const checks = await Promise.all([
    check(
      'homepage',
      '/',
      (text) => text.includes('Prather Software') && /<h1\b/.test(text),
    ),
    check('contact-page', '/contact/', (text) => {
      const form = text.match(/<form\b[^>]*\bid="contact-form"[^>]*>/)?.[0];
      return (
        form?.includes('data-enabled="true"') &&
        form.includes(`data-sitekey="${sitekey}"`) &&
        !/<fieldset\b[^>]*\sdisabled(?:[=\s>])/.test(text)
      );
    }),
    check('public-health', '/api/health', (text) => {
      const value = JSON.parse(text);
      return value?.ok === true && value.contactAvailable === true;
    }),
    typeof secret === 'string' && /^[a-fA-F0-9]{64}$/.test(secret)
      ? check(
          'contact-readiness',
          '/api/health',
          (text) => JSON.parse(text)?.ok === true,
          { method: 'POST', headers: { Authorization: 'Bearer ' + secret } },
        )
      : Promise.resolve(failure('contact-readiness', 'not-configured')),
  ]);
  const failures = checks
    .filter(Boolean)
    .sort((left, right) => left.check.localeCompare(right.check));
  const notification = await notify(failures);
  return {
    ok: failures.length === 0 && notification !== 'failed',
    selfTest: false,
    failures,
    notification,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    if (
      process.argv.length !== 2 ||
      !['true', 'false'].includes(process.env.SELF_TEST ?? 'false')
    )
      throw new Error('Invalid monitor invocation.');
    const result = await runMonitor({
      selfTest: process.env.SELF_TEST === 'true',
    });
    console.log(JSON.stringify(result));
    if (!result.ok) process.exitCode = 1;
  } catch {
    console.error(
      'Website monitoring could not finish safely. No credential or response data was printed.',
    );
    process.exitCode = 1;
  }
}
