import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

// Manual live check after an authorized release; never submits inquiry data.
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
        assert.equal(await page.locator('#name').isDisabled(), true);
        assert.equal(await page.locator('#contact-submit').isDisabled(), true);
        assert.equal(
          await page
            .locator('fieldset')
            .evaluate((element) => element.disabled),
          true,
        );
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
      `Live Chromium ${width}px: layout, automated WCAG checks, product navigation, disabled form, no analytics injection, and browser errors passed.`,
    );
    await context.close();
  }
} finally {
  await browser.close();
}
