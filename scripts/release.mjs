import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
export const accountId = '901d7b0a79a15aaa0f84fbca1bbb2ad5';
const targets = {
  staging: {
    worker: 'prather-software-staging',
    hostname: 'staging.prathersoftware.com',
    routes: ['staging.prathersoftware.com'],
  },
  production: {
    worker: 'prather-software-website',
    hostname: 'prathersoftware.com',
    routes: ['prathersoftware.com', 'www.prathersoftware.com'],
  },
};

export function parseReleaseArgs(args) {
  const values = new Map();
  let mode;
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === '--deploy' || argument === '--dry-run') {
      assert.equal(mode, undefined, 'Choose exactly one release mode.');
      mode = argument === '--deploy' ? 'deploy' : 'dry-run';
    } else {
      assert.ok(
        ['--environment', '--source-sha'].includes(argument),
        'Unknown release argument.',
      );
      assert.ok(!values.has(argument), 'Duplicate release argument.');
      const value = args[++index];
      assert.ok(value && !value.startsWith('--'), 'Missing release value.');
      values.set(argument, value);
    }
  }
  const environment = values.get('--environment');
  assert.ok(
    Object.hasOwn(targets, environment),
    'Choose staging or production.',
  );
  const sourceSha = values.get('--source-sha');
  assert.match(sourceSha ?? '', /^[a-f0-9]{40}$/, 'Use a full commit SHA.');
  return { environment, sourceSha, mode: mode ?? 'dry-run' };
}

/** Parse only JSON with comments/trailing commas, without evaluating code. */
export function parseJsonc(source) {
  let result = '';
  let quoted = false;
  let escaped = false;
  for (let index = 0; index < source.length; index++) {
    const character = source[index];
    if (quoted) {
      result += character;
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') quoted = false;
    } else if (character === '"') {
      quoted = true;
      result += character;
    } else if (character === '/' && source[index + 1] === '/') {
      while (index < source.length && source[index] !== '\n') index++;
      result += '\n';
    } else if (character === '/' && source[index + 1] === '*') {
      const end = source.indexOf('*/', index + 2);
      assert.ok(end >= 0, 'Unterminated configuration comment.');
      index = end + 1;
      result += ' ';
    } else if (character === ',' && /^\s*[}\]]/.test(source.slice(index + 1))) {
      // A trailing comma may precede a comment, handled by the second pass.
    } else result += character;
  }
  // Comments have been removed. Repeat the quoted-string-aware comma pass.
  let normalized = '';
  quoted = false;
  escaped = false;
  for (let index = 0; index < result.length; index++) {
    const character = result[index];
    if (quoted) {
      normalized += character;
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') quoted = false;
    } else if (character === '"') {
      quoted = true;
      normalized += character;
    } else if (
      character !== ',' ||
      !/^\s*[}\]]/.test(result.slice(index + 1))
    ) {
      normalized += character;
    }
  }
  return JSON.parse(normalized);
}

export function releasePlan(
  options,
  metadata,
  configuration,
  analyticsMetadata,
) {
  const { environment, sourceSha, mode } = options;
  assert.ok(Object.hasOwn(targets, environment), 'Unknown release target.');
  assert.match(sourceSha, /^[a-f0-9]{40}$/);
  assert.ok(['dry-run', 'deploy'].includes(mode));
  const target = targets[environment];
  const widget = metadata[environment];
  const resolved =
    environment === 'production'
      ? configuration.env?.production
      : configuration;
  assert.equal(
    configuration.account_id,
    accountId,
    'Unexpected Cloudflare account.',
  );
  assert.equal(metadata.accountId, accountId, 'Unexpected widget account.');
  assert.equal(
    resolved?.main ?? configuration.main,
    'worker/index.ts',
    'Unexpected Worker entry point.',
  );
  assert.equal(resolved?.account_id ?? configuration.account_id, accountId);
  const assets = resolved?.assets ?? configuration.assets;
  assert.equal(assets?.directory, './dist', 'Use ordinary dist assets.');
  assert.equal(assets?.binding, 'ASSETS');
  assert.equal(
    assets?.run_worker_first,
    true,
    'Preserve Worker security handling.',
  );
  assert.equal(resolved?.name, target.worker, 'Unexpected Worker target.');
  assert.equal(resolved.workers_dev, false, 'Keep workers.dev disabled.');
  assert.equal(resolved.preview_urls, false, 'Keep preview URLs disabled.');
  assert.equal(resolved.vars?.ALLOWED_ORIGIN, `https://${target.hostname}`);
  assert.equal(resolved.vars?.TURNSTILE_HOSTNAME, target.hostname);
  assert.equal(
    resolved.vars?.SITE_INDEXING,
    environment === 'production' ? 'enabled' : 'disabled',
  );
  assert.deepEqual(
    resolved.routes
      ?.map((route) => {
        assert.equal(route.custom_domain, true);
        return route.pattern;
      })
      .sort(),
    [...target.routes].sort(),
    'Release routing must contain only the approved exact domains.',
  );
  assert.equal(widget?.worker, target.worker);
  assert.equal(widget.expectedHostname, target.hostname);
  assert.equal(widget.action, 'contact');
  assert.equal(widget.secretBinding, 'TURNSTILE_SECRET');
  assert.match(widget.sitekey, /^0x[A-Za-z0-9_-]+$/);
  assert.notEqual(metadata.staging?.sitekey, metadata.production?.sitekey);
  if (analyticsMetadata !== undefined) {
    assert.equal(analyticsMetadata?.account_id, accountId);
    assert.equal(analyticsMetadata.hostname, targets.production.hostname);
    assert.equal(analyticsMetadata.auto_install, false);
    assert.match(analyticsMetadata.site_token ?? '', /^[a-f0-9]{32}$/i);
    assert.equal(analyticsMetadata.mode, 'manual');
    assert.equal(
      analyticsMetadata.script_url,
      'https://static.cloudflareinsights.com/beacon.min.js',
    );
    assert.equal(
      analyticsMetadata.collection_origin,
      'https://cloudflareinsights.com',
    );
    assert.equal(analyticsMetadata.respects_do_not_track, true);
  }
  const active = environment === 'production';
  return {
    ...options,
    accountId,
    worker: target.worker,
    origin: `https://${target.hostname}`,
    sitekey: widget.sitekey,
    buildEnvironment: {
      PUBLIC_CONTACT_ENABLED: String(active),
      PUBLIC_TURNSTILE_SITE_KEY: widget.sitekey,
      PUBLIC_WEB_ANALYTICS_ENABLED: String(active),
    },
    wranglerArguments: [
      'deploy',
      '--config',
      'wrangler.jsonc',
      ...(active ? ['--env', 'production'] : ['--env=']),
      '--assets',
      './dist',
      '--var',
      `CONTACT_ENABLED:${active}`,
      '--var',
      `CONTACT_DELIVERY_VERIFIED:${active}`,
      '--tag',
      sourceSha.slice(0, 12),
      '--message',
      `Website ${environment} release ${sourceSha}`,
      ...(mode === 'dry-run' ? ['--dry-run'] : []),
    ],
  };
}

export function assertSource(options, state) {
  assert.equal(
    state.headSha,
    options.sourceSha,
    'Checkout must match the exact source SHA.',
  );
  assert.ok(
    state.clean,
    'Use a clean working tree before preparing a release.',
  );
  if (options.mode === 'deploy')
    assert.ok(
      state.onMainHistory,
      'Deploy only a reviewed commit merged into main.',
    );
  if (state.githubActions) {
    assert.equal(state.repository, 'MasonPrather/prather-software-website');
    assert.equal(
      state.workflowRef,
      'refs/heads/main',
      'Run the release workflow from main.',
    );
    assert.ok(state.onMainHistory, 'Actions releases must use main history.');
  }
}

const privateEntry = (name) =>
  name === '.git' ||
  name === 'node_modules' ||
  /^\.(?:env|dev\.vars)(?:\.|$)/i.test(name) ||
  /^(?:client[_-]secret|credentials?|secrets?)(?:[._-]|$)/i.test(name) ||
  /^(?:wrangler\.|package(?:-lock)?\.json$|_worker\.)/i.test(name) ||
  /\.(?:pem|key|p12|pfx)$/i.test(name) ||
  /^__(?:contact|CONTACT)/.test(name);

export async function assertAssets(directory, plan) {
  assert.ok(
    !(await lstat(directory)).isSymbolicLink(),
    'Do not release a symlinked build.',
  );
  const walk = async (current) => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      assert.ok(
        !privateEntry(entry.name),
        'Build contains private or test-only files.',
      );
      const filename = path.join(current, entry.name);
      const information = await lstat(filename);
      assert.ok(
        !information.isSymbolicLink(),
        'Do not release build symlinks.',
      );
      if (information.isDirectory()) await walk(filename);
      else assert.ok(information.isFile(), 'Unsupported build entry.');
    }
  };
  await walk(directory);
  const html = await readFile(
    path.join(directory, 'contact/index.html'),
    'utf8',
  );
  const active = plan.environment === 'production';
  assert.ok(
    html.includes(`data-enabled="${active}"`),
    'Unexpected contact build state.',
  );
  assert.ok(
    html.includes(`data-sitekey="${plan.sitekey}"`),
    'Wrong Turnstile build key.',
  );
  const fieldset = html.match(/<fieldset\b[^>]*>/)?.[0];
  assert.ok(fieldset, 'Missing contact fields.');
  assert.equal(/\sdisabled(?:[=\s>])/.test(fieldset), !active);
  assert.ok(
    !/staging-contact-probe|__contact-verification/.test(html),
    'Do not release the staging probe.',
  );
  await readFile(path.join(directory, 'index.html'));
  await readFile(path.join(directory, 'sitemap.xml'));
}

function command(binary, arguments_, environment) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, arguments_, {
      cwd: root,
      stdio: 'inherit',
      env: environment,
    });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolve();
      else
        reject(
          new Error('Release command failed; no automatic retry was made.'),
        );
    });
  });
}

export function releaseBuildEnvironment(environment, plan) {
  return {
    ...Object.fromEntries(
      Object.entries(environment).filter(
        ([key]) =>
          !/^(?:CLOUDFLARE_|CF_)/i.test(key) &&
          !/(?:TOKEN|SECRET|PASSWORD|GMAIL|^CONTACT_)/i.test(key),
      ),
    ),
    ...plan.buildEnvironment,
  };
}

async function verifyStaging(plan) {
  for (const route of ['/', '/services/', '/contact/', '/privacy/']) {
    const response = await fetch(plan.origin + route, {
      redirect: 'manual',
      signal: AbortSignal.timeout(20_000),
    });
    assert.equal(response.status, 200, `Staging page failed: ${route}`);
    assert.equal(response.headers.get('X-Robots-Tag'), 'noindex, nofollow');
    assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
    const html = await response.text();
    assert.equal(
      html,
      await readFile(path.join(root, 'dist', route, 'index.html'), 'utf8'),
    );
  }
  console.log(
    'Staging pages match this disabled, nonindexable release. No inquiry submitted.',
  );
}

export async function main(args = process.argv.slice(2)) {
  const options = parseReleaseArgs(args);
  const git = (arguments_) =>
    execFileSync('git', arguments_, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  let onMainHistory = false;
  try {
    git([
      'merge-base',
      '--is-ancestor',
      options.sourceSha,
      'refs/remotes/origin/main',
    ]);
    onMainHistory = true;
  } catch {}
  assertSource(options, {
    headSha: git(['rev-parse', 'HEAD']),
    clean: git(['status', '--porcelain', '--untracked-files=all']) === '',
    onMainHistory,
    githubActions: process.env.GITHUB_ACTIONS === 'true',
    repository: process.env.GITHUB_REPOSITORY,
    workflowRef: process.env.GITHUB_REF,
  });
  const metadata = JSON.parse(
    await readFile(path.join(root, 'ops/turnstile-widgets.json'), 'utf8'),
  );
  const configuration = parseJsonc(
    await readFile(path.join(root, 'wrangler.jsonc'), 'utf8'),
  );
  let analyticsMetadata;
  try {
    analyticsMetadata = JSON.parse(
      await readFile(path.join(root, 'ops/web-analytics.json'), 'utf8'),
    );
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const plan = releasePlan(options, metadata, configuration, analyticsMetadata);
  if (process.env.CLOUDFLARE_ACCOUNT_ID)
    assert.equal(
      process.env.CLOUDFLARE_ACCOUNT_ID,
      accountId,
      'Unexpected account override.',
    );
  if (options.mode === 'deploy' && process.env.GITHUB_ACTIONS === 'true')
    assert.ok(
      process.env.CLOUDFLARE_API_TOKEN?.trim(),
      'The selected GitHub environment needs its scoped Cloudflare token.',
    );
  console.log(
    JSON.stringify({
      environment: plan.environment,
      worker: plan.worker,
      source: plan.sourceSha,
      mode: plan.mode,
    }),
  );
  // Build tooling never receives deployment credentials or mailbox secrets.
  const buildEnvironment = releaseBuildEnvironment(process.env, plan);
  await command(
    process.platform === 'win32' ? 'npm.cmd' : 'npm',
    ['run', 'build'],
    buildEnvironment,
  );
  const directory = path.join(root, 'dist');
  assert.equal(
    await realpath(directory),
    directory,
    'Release only the ordinary dist directory.',
  );
  await assertAssets(directory, plan);
  await command(
    process.execPath,
    [
      path.join(root, 'node_modules/wrangler/bin/wrangler.js'),
      ...plan.wranglerArguments,
    ],
    {
      ...process.env,
      CLOUDFLARE_ACCOUNT_ID: accountId,
      WRANGLER_WRITE_LOGS: 'false',
      WRANGLER_LOG_SANITIZE: 'true',
      WRANGLER_SEND_METRICS: 'false',
      CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false',
    },
  );
  if (plan.mode === 'dry-run') {
    console.log('Dry run completed. No Worker was uploaded.');
  } else if (plan.environment === 'production') {
    await command(
      process.execPath,
      ['scripts/check-production.mjs', '--contact-enabled'],
      buildEnvironment,
    );
  } else await verifyStaging(plan);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'Release failed.');
    process.exitCode = 1;
  });
}
