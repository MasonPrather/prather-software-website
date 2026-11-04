import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  accountId,
  assertAssets,
  assertSource,
  parseJsonc,
  parseReleaseArgs,
  releaseBuildEnvironment,
  releasePlan,
} from '../../scripts/release.mjs';

const sha = 'a'.repeat(40);
const metadata = {
  accountId,
  staging: {
    worker: 'prather-software-staging',
    expectedHostname: 'staging.prathersoftware.com',
    action: 'contact',
    secretBinding: 'TURNSTILE_SECRET',
    sitekey: '0xStageKey',
  },
  production: {
    worker: 'prather-software-website',
    expectedHostname: 'prathersoftware.com',
    action: 'contact',
    secretBinding: 'TURNSTILE_SECRET',
    sitekey: '0xProductionKey',
  },
};
function config() {
  return {
    account_id: accountId,
    main: 'worker/index.ts',
    assets: { directory: './dist', binding: 'ASSETS', run_worker_first: true },
    name: 'prather-software-staging',
    workers_dev: false,
    preview_urls: false,
    routes: [{ pattern: 'staging.prathersoftware.com', custom_domain: true }],
    vars: {
      SITE_INDEXING: 'disabled',
      ALLOWED_ORIGIN: 'https://staging.prathersoftware.com',
      TURNSTILE_HOSTNAME: 'staging.prathersoftware.com',
    },
    env: {
      production: {
        name: 'prather-software-website',
        workers_dev: false,
        preview_urls: false,
        routes: [
          { pattern: 'prathersoftware.com', custom_domain: true },
          { pattern: 'www.prathersoftware.com', custom_domain: true },
        ],
        vars: {
          SITE_INDEXING: 'enabled',
          ALLOWED_ORIGIN: 'https://prathersoftware.com',
          TURNSTILE_HOSTNAME: 'prathersoftware.com',
        },
      },
    },
  };
}
const options = (environment = 'production', mode = 'dry-run') => ({
  environment,
  sourceSha: sha,
  mode,
});

test('release preparation defaults to dry-run and requires an exact allowed target/source', () => {
  assert.deepEqual(
    parseReleaseArgs(['--environment', 'production', '--source-sha', sha]),
    options(),
  );
  for (const args of [
    ['--environment', 'privacy', '--source-sha', sha],
    ['--environment', 'production', '--source-sha', 'abcd'],
    ['--environment', 'production', '--source-sha', sha, '--name', 'other'],
    [
      '--environment',
      'production',
      '--source-sha',
      sha,
      '--deploy',
      '--dry-run',
    ],
    [
      '--environment',
      'staging',
      '--environment',
      'production',
      '--source-sha',
      sha,
    ],
  ])
    assert.throws(() => parseReleaseArgs(args));
});

test('production cannot accidentally use disabled contact flags, staging key, or name overrides', () => {
  const plan = releasePlan(options('production', 'deploy'), metadata, config());
  assert.deepEqual(plan.buildEnvironment, {
    PUBLIC_CONTACT_ENABLED: 'true',
    PUBLIC_TURNSTILE_SITE_KEY: '0xProductionKey',
    PUBLIC_WEB_ANALYTICS_ENABLED: 'true',
  });
  assert.ok(plan.wranglerArguments.includes('CONTACT_ENABLED:true'));
  assert.ok(plan.wranglerArguments.includes('CONTACT_DELIVERY_VERIFIED:true'));
  assert.ok(plan.wranglerArguments.includes('production'));
  assert.ok(!plan.wranglerArguments.includes('--name'));
  assert.ok(!plan.wranglerArguments.includes('--dry-run'));
});

test('staging remains separate, disabled, and dry-run by default', () => {
  const plan = releasePlan(options('staging'), metadata, config());
  assert.equal(plan.worker, 'prather-software-staging');
  assert.equal(plan.buildEnvironment.PUBLIC_CONTACT_ENABLED, 'false');
  assert.equal(plan.buildEnvironment.PUBLIC_WEB_ANALYTICS_ENABLED, 'false');
  assert.equal(plan.buildEnvironment.PUBLIC_TURNSTILE_SITE_KEY, '0xStageKey');
  assert.ok(plan.wranglerArguments.includes('--env='));
  assert.ok(plan.wranglerArguments.includes('CONTACT_ENABLED:false'));
  assert.ok(plan.wranglerArguments.includes('CONTACT_DELIVERY_VERIFIED:false'));
  assert.ok(plan.wranglerArguments.includes('--dry-run'));
});

test('build tooling cannot receive global Cloudflare keys or other private deployment variables', () => {
  const plan = releasePlan(options(), metadata, config());
  const environment = releaseBuildEnvironment(
    {
      PATH: '/inert/test/bin',
      CI: 'true',
      CLOUDFLARE_API_KEY: 'unit-global-key',
      CLOUDFLARE_API_TOKEN: 'unit-deployment-token',
      CLOUDFLARE_EMAIL: 'fixture@example.com',
      CF_API_KEY: 'unit-legacy-key',
      CF_ACCOUNT_ID: 'unit-account',
      GITHUB_TOKEN: 'unit-github-token',
      GMAIL_REFRESH_TOKEN: 'unit-refresh-token',
      CONTACT_FROM: 'fixture@example.com',
      PUBLIC_CONTACT_ENABLED: 'false',
      PUBLIC_WEB_ANALYTICS_ENABLED: 'false',
    },
    plan,
  );
  assert.deepEqual(environment, {
    PATH: '/inert/test/bin',
    CI: 'true',
    ...plan.buildEnvironment,
  });
  assert.equal(environment.PUBLIC_CONTACT_ENABLED, 'true');
  assert.equal(environment.PUBLIC_WEB_ANALYTICS_ENABLED, 'true');
  assert.equal(environment.PUBLIC_TURNSTILE_SITE_KEY, '0xProductionKey');
});

test('optional manual analytics metadata stays on the exact approved production host', () => {
  const analytics = {
    account_id: accountId,
    hostname: 'prathersoftware.com',
    site_token: '1'.repeat(32),
    auto_install: false,
    mode: 'manual',
    script_url: 'https://static.cloudflareinsights.com/beacon.min.js',
    collection_origin: 'https://cloudflareinsights.com',
    respects_do_not_track: true,
  };
  const plan = releasePlan(options(), metadata, config(), analytics);
  assert.equal(plan.buildEnvironment.PUBLIC_WEB_ANALYTICS_ENABLED, 'true');
  assert.equal(
    releasePlan(options('staging'), metadata, config(), analytics)
      .buildEnvironment.PUBLIC_WEB_ANALYTICS_ENABLED,
    'false',
  );
  for (const changes of [
    { hostname: 'staging.prathersoftware.com' },
    { account_id: 'other-account' },
    { auto_install: true },
    { site_token: 'not-a-public-token' },
    { script_url: 'https://unapproved.example/beacon.js' },
    { respects_do_not_track: false },
  ])
    assert.throws(() =>
      releasePlan(options(), metadata, config(), { ...analytics, ...changes }),
    );
});

test('release target guards reject account, Worker, entrypoint, asset, route, and widget drift', () => {
  for (const change of [
    (c) => {
      c.account_id = 'other-account';
    },
    (c) => {
      c.main = 'tests/fixtures/contact-worker.ts';
    },
    (c) => {
      c.assets.directory = './.wrangler/contact-verification-test';
    },
    (c) => {
      c.env.production.name = 'prather-software-privacy';
    },
    (c) => {
      c.env.production.routes.push({
        pattern: 'privacy.prathersoftware.com',
        custom_domain: true,
      });
    },
    (c) => {
      c.env.production.workers_dev = true;
    },
    (c) => {
      Object.assign(c.env.production, {
        main: 'tests/fixtures/contact-worker.ts',
      });
    },
    (c) => {
      Object.assign(c.env.production, {
        assets: { directory: './dist', binding: 'OTHER' },
      });
    },
    (c) => {
      c.env.production.vars.SITE_INDEXING = 'disabled';
    },
  ]) {
    const altered = config();
    change(altered);
    assert.throws(() => releasePlan(options(), metadata, altered));
  }
  assert.throws(() =>
    releasePlan(options(), { ...metadata, accountId: 'other' }, config()),
  );
  assert.throws(() =>
    releasePlan(
      options(),
      {
        ...metadata,
        production: { ...metadata.production, sitekey: '0xStageKey' },
      },
      config(),
    ),
  );
});

test('source guards require a clean exact checkout and merged main history for uploads', () => {
  const state = {
    headSha: sha,
    clean: true,
    onMainHistory: false,
    githubActions: false,
  };
  assert.doesNotThrow(() => assertSource(options(), state));
  assert.throws(() => assertSource(options('production', 'deploy'), state));
  assert.throws(() =>
    assertSource(options(), { ...state, headSha: 'b'.repeat(40) }),
  );
  assert.throws(() => assertSource(options(), { ...state, clean: false }));
  assert.throws(() =>
    assertSource(options(), {
      ...state,
      githubActions: true,
      onMainHistory: true,
      repository: 'MasonPrather/prather-software-website',
      workflowRef: 'refs/heads/feature',
    }),
  );
  assert.doesNotThrow(() =>
    assertSource(options('production', 'deploy'), {
      ...state,
      onMainHistory: true,
    }),
  );
});

test('JSONC parsing preserves URL and quoted text while handling comments/trailing commas', () => {
  assert.deepEqual(
    parseJsonc(
      '{"url":"https://example.com/a,}",/* note */"text":"say \\"hi\\"", // line\n"items":[1,/*end*/],}',
    ),
    { url: 'https://example.com/a,}', text: 'say "hi"', items: [1] },
  );
  assert.throws(() => parseJsonc('{"a": 1, /* unfinished'));
});

async function fixture(active = true) {
  const directory = await mkdtemp(path.join(tmpdir(), 'prather-release-test-'));
  await mkdir(path.join(directory, 'contact'));
  await writeFile(path.join(directory, 'index.html'), '<h1>Home</h1>');
  await writeFile(path.join(directory, 'sitemap.xml'), '<urlset/>');
  await writeFile(
    path.join(directory, 'contact/index.html'),
    `<form data-enabled="${active}" data-sitekey="${active ? '0xProductionKey' : '0xStageKey'}"><fieldset${active ? '' : ' disabled'}></fieldset></form>`,
  );
  return directory;
}

test('release asset guards accept ordinary matching builds and reject the wrong form state', async () => {
  const directory = await fixture();
  try {
    await assertAssets(directory, releasePlan(options(), metadata, config()));
    await assert.rejects(
      assertAssets(
        directory,
        releasePlan(options('staging'), metadata, config()),
      ),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
  const staging = await fixture(false);
  try {
    await assertAssets(
      staging,
      releasePlan(options('staging'), metadata, config()),
    );
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
});

for (const name of [
  '.env',
  '.dev.vars.gmail',
  'client_secret.json',
  '__contact-verification.js',
  '_worker.js',
]) {
  test(`release asset guard rejects ${name}`, async () => {
    const directory = await fixture();
    try {
      await writeFile(path.join(directory, name), 'inert-fixture');
      await assert.rejects(
        assertAssets(directory, releasePlan(options(), metadata, config())),
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
}

test('release asset guards reject hidden probe markup and symlink entries', async () => {
  const directory = await fixture();
  try {
    await symlink(
      path.join(directory, 'index.html'),
      path.join(directory, 'linked.html'),
    );
    await assert.rejects(
      assertAssets(directory, releasePlan(options(), metadata, config())),
    );
    await rm(path.join(directory, 'linked.html'));
    await writeFile(
      path.join(directory, 'contact/index.html'),
      '<form data-enabled="true" data-sitekey="0xProductionKey"><fieldset></fieldset><aside id="staging-contact-probe"></aside></form>',
    );
    await assert.rejects(
      assertAssets(directory, releasePlan(options(), metadata, config())),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
