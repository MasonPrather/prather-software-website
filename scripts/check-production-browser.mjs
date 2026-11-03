import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Manual live check after an authorized release; never submits inquiry data.
const args = process.argv.slice(2);
assert.ok(
  args.length === 0 || (args.length === 1 && args[0] === '--contact-enabled'),
  'Usage: npm run test:production:browser -- [--contact-enabled]',
);
const contactEnabled = args.includes('--contact-enabled');
const productionSiteKey = contactEnabled
  ? JSON.parse(await readFile('ops/turnstile-widgets.json', 'utf8')).production
      .sitekey
  : undefined;
const browser = await chromium.launch();
try {
  for (const width of [375, 768, 1440]) {
    const context = await browser.newContext({
      viewport: { width, height: 960 },
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    for (const route of [
      '/',
      '/products/software/quest-theater/',
      '/contact/',
    ]) {
      const response = await page.goto('https://prathersoftware.com' + route);
      assert.equal(response.status(), 200);
      assert.equal(await page.locator('h1').count(), 1);
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
      const audit = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze();
      assert.deepEqual(audit.violations, [], JSON.stringify(audit.violations));
      assert.equal(
        await page.locator('script[src*="cloudflareinsights.com"]').count(),
        0,
        'Unexpected analytics injection',
      );
      if (route === '/')
        await page.screenshot({ path: `.git/launch-${width}.png` });
      if (route === '/contact/') {
        assert.equal(await page.locator('#name').isDisabled(), !contactEnabled);
        assert.equal(
          await page
            .locator('fieldset')
            .evaluate((element) => element.disabled),
          !contactEnabled,
        );
        await expect(page.locator('#contact-form')).toHaveAttribute(
          'data-enabled',
          String(contactEnabled),
        );
        if (contactEnabled) {
          for (const field of ['#email', '#category', '#message'])
            await expect(page.locator(field)).toBeEnabled();
          assert.ok(productionSiteKey, 'Missing recorded production sitekey');
          await expect(page.locator('#contact-form')).toHaveAttribute(
            'data-sitekey',
            productionSiteKey,
          );
          await expect(page.locator('#turnstile-widget')).toBeVisible();
          await expect(
            page.locator(
              'script[src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"]',
            ),
          ).toHaveCount(1);
          // Inspect only frame origins; never read or submit a challenge token.
          await expect
            .poll(
              () =>
                page.frames().some((frame) => {
                  try {
                    return (
                      new URL(frame.url()).hostname ===
                      'challenges.cloudflare.com'
                    );
                  } catch {
                    return false;
                  }
                }),
              { timeout: 20_000, message: 'Turnstile frame did not load' },
            )
            .toBe(true);
          // Submit can remain disabled while security verification is pending.
          await expect(page.locator('#contact-submit')).toHaveText(
            /Send inquiry/,
          );
        } else {
          assert.equal(
            await page.locator('#contact-submit').isDisabled(),
            true,
          );
        }
      }
    }
    await page.goto('https://prathersoftware.com/');
    if (await page.locator('.menu-toggle').isVisible())
      await page.locator('.menu-toggle').click();
    await page.locator('nav summary').filter({ hasText: 'Products' }).click();
    await page
      .locator('nav')
      .getByRole('link', { name: 'Software', exact: true })
      .click();
    await page.waitForURL('https://prathersoftware.com/products/software/');
    assert.deepEqual(errors, []);
    console.log(
      `Live Chromium ${width}px: layout, automated WCAG checks, product navigation, ${contactEnabled ? 'enabled form and Turnstile (no inquiry sent)' : 'disabled form'}, no analytics injection, and browser errors passed.`,
    );
    await context.close();
  }
} finally {
  await browser.close();
}
