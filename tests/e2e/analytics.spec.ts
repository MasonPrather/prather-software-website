import { expect, test, type BrowserContext } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const analytics = JSON.parse(
  await readFile(path.join(root, 'ops/web-analytics.json'), 'utf8'),
);
const production = 'https://prathersoftware.com';
let fixtureRoot: string;
test.describe.configure({ mode: 'default' });

test.beforeAll(async ({}, testInfo) => {
  // Build the actual enabled integration in an isolated directory. The normal
  // CI build stays disabled; no test state or page is added to production dist.
  fixtureRoot = path.join(
    root,
    '.test-dist',
    `analytics-${testInfo.project.name}-${process.pid}`,
  );
  execFileSync(
    process.execPath,
    [
      path.join(root, 'node_modules/astro/bin/astro.mjs'),
      'build',
      '--outDir',
      fixtureRoot,
    ],
    {
      cwd: root,
      env: {
        ...process.env,
        PUBLIC_WEB_ANALYTICS_ENABLED: 'true',
        PUBLIC_CONTACT_ENABLED: 'false',
      },
      stdio: 'pipe',
      timeout: 60_000,
    },
  );
});

test.afterAll(async () => {
  if (fixtureRoot) await rm(fixtureRoot, { recursive: true, force: true });
});

async function serveFixture(
  context: BrowserContext,
  origin: string,
  duplicateLoader = false,
) {
  let beaconRequests = 0;
  const unexpectedOrigins: string[] = [];
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.href === analytics.script_url) {
      beaconRequests++;
      // Exercise the real loader without sending any analytics to Cloudflare.
      await route.fulfill({
        contentType: 'text/javascript',
        body: `window.__pratherAnalyticsFixtureLoaded =
          document.currentScript?.getAttribute('data-cf-beacon') ?? null;`,
      });
      return;
    }
    if (url.origin !== origin) {
      unexpectedOrigins.push(url.origin);
      await route.abort();
      return;
    }
    try {
      let file = path.resolve(
        fixtureRoot,
        '.' + decodeURIComponent(url.pathname),
      );
      if (!file.startsWith(fixtureRoot + path.sep) && file !== fixtureRoot)
        throw new Error('Fixture path outside build');
      if ((await stat(file)).isDirectory())
        file = path.join(file, 'index.html');
      const extension = path.extname(file);
      const types: Record<string, string> = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.svg': 'image/svg+xml',
        '.jpg': 'image/jpeg',
        '.png': 'image/png',
      };
      let body = await readFile(file);
      if (duplicateLoader && extension === '.html') {
        const html = body.toString('utf8');
        const loader = html.match(
          /<script\b[^>]*\bdata-prather-analytics-loader\b[^>]*>[\s\S]*?<\/script>/,
        )?.[0];
        if (!loader) throw new Error('Missing enabled analytics loader');
        body = Buffer.from(html.replace('</body>', loader + '</body>'));
      }
      await route.fulfill({
        contentType: types[extension] ?? 'application/octet-stream',
        body,
      });
    } catch {
      await route.fulfill({ status: 404, body: '' });
    }
  });
  return { requests: () => beaconRequests, unexpectedOrigins };
}

test('the default verification build has no analytics loader or beacon', async ({
  page,
}) => {
  await page.goto('/privacy/');
  await expect(
    page.locator('script[data-prather-analytics-loader]'),
  ).toHaveCount(0);
  await expect(
    page.locator('script[src*="cloudflareinsights.com"]'),
  ).toHaveCount(0);
  await expect(page.locator('.privacy-copy')).toContainText(
    'does not include advertising trackers or analytics scripts',
  );
});

test('the enabled production integration loads only the recorded public beacon', async ({
  browser,
}) => {
  const context = await browser.newContext();
  try {
    const fixture = await serveFixture(context, production);
    const page = await context.newPage();
    await page.goto(production + '/privacy/');
    const beacon = page.locator('script[data-prather-web-analytics]');
    await expect(beacon).toHaveCount(1);
    await expect(beacon).toHaveAttribute('src', analytics.script_url);
    expect(await beacon.getAttribute('type')).toBeNull();
    await expect(beacon).toHaveJSProperty('defer', true);
    expect(JSON.parse((await beacon.getAttribute('data-cf-beacon'))!)).toEqual({
      token: analytics.site_token,
    });
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (
              window as Window & {
                __pratherAnalyticsFixtureLoaded?: string | null;
              }
            ).__pratherAnalyticsFixtureLoaded,
        ),
      )
      .toBe(JSON.stringify({ token: analytics.site_token }));
    await expect(page.locator('.privacy-copy')).toContainText(
      'uses Cloudflare Web Analytics',
    );
    await expect(page.locator('.privacy-copy')).not.toContainText(
      'does not include advertising trackers or analytics scripts',
    );
    expect(fixture.requests()).toBe(1);
    expect(fixture.unexpectedOrigins).toEqual([]);
  } finally {
    await context.close();
  }
});

test('repeated loader markup does not add a second beacon', async ({
  browser,
}) => {
  const context = await browser.newContext();
  try {
    const fixture = await serveFixture(context, production, true);
    const page = await context.newPage();
    await page.goto(production + '/');
    await expect(
      page.locator('script[data-prather-web-analytics]'),
    ).toHaveCount(1);
    expect(fixture.requests()).toBe(1);
    expect(fixture.unexpectedOrigins).toEqual([]);
  } finally {
    await context.close();
  }
});

test('production assets never load analytics outside the exact HTTPS apex', async ({
  browser,
}) => {
  for (const origin of [
    'http://localhost:4321',
    'https://staging.prathersoftware.com',
    'https://privacy.prathersoftware.com',
    'https://www.prathersoftware.com',
    'http://prathersoftware.com',
    'https://prathersoftware.com:8443',
    'https://prathersoftware.com.attacker.invalid',
  ]) {
    const context = await browser.newContext();
    try {
      const fixture = await serveFixture(context, origin);
      const page = await context.newPage();
      await page.goto(origin + '/');
      await expect(
        page.locator('script[data-prather-analytics-loader]'),
      ).toHaveCount(1);
      await expect(
        page.locator('script[data-prather-web-analytics]'),
      ).toHaveCount(0);
      expect(fixture.requests()).toBe(0);
      expect(fixture.unexpectedOrigins).toEqual([]);
    } finally {
      await context.close();
    }
  }
});

test('Do Not Track prevents even the beacon download', async ({ browser }) => {
  const context = await browser.newContext();
  try {
    await context.addInitScript(() =>
      Object.defineProperty(navigator, 'doNotTrack', { value: '1' }),
    );
    const fixture = await serveFixture(context, production);
    const page = await context.newPage();
    await page.goto(production + '/');
    await expect(
      page.locator('script[data-prather-web-analytics]'),
    ).toHaveCount(0);
    expect(fixture.requests()).toBe(0);
    expect(fixture.unexpectedOrigins).toEqual([]);
  } finally {
    await context.close();
  }
});

test('without JavaScript the enabled build does not load analytics', async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const fixture = await serveFixture(context, production);
    const page = await context.newPage();
    await page.goto(production + '/');
    await expect(
      page.locator('script[data-prather-web-analytics]'),
    ).toHaveCount(0);
    expect(fixture.requests()).toBe(0);
    expect(fixture.unexpectedOrigins).toEqual([]);
  } finally {
    await context.close();
  }
});
