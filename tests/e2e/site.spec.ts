import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// With default macOS WebKit keyboard settings, Option-Tab includes links.
// https://developer.apple.com/documentation/webkit/wkpreferences/tabfocuseslinks
const tabKey = (browserName: string) =>
  browserName === 'webkit' && process.platform === 'darwin' ? 'Alt+Tab' : 'Tab';

const routes = [
  '/',
  '/services/',
  '/work/',
  '/products/',
  '/products/software/',
  '/products/games/',
  '/products/software/quest-theater/',
  '/products/games/promenade/',
  '/products/games/rick-dangerman-remastered/',
  '/products/games/floor-13/',
  '/about/',
  '/about/team/',
  '/contact/',
  '/privacy/',
  '/work/collaborative-xr-research/',
  '/work/adaptive-vr-classroom/',
  '/work/programmable-network-telemetry/',
];

for (const route of routes) {
  test(`${route} is accessible and fits the viewport`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const response = await page.goto(route);
    expect(response?.status()).toBe(200);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('main')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      'content',
      /.+/,
    );
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      `https://prathersoftware.com${route}`,
    );
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      'content',
      /.+/,
    );
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
      'content',
      'summary_large_image',
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    const accessibility = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(
      accessibility.violations,
      JSON.stringify(accessibility.violations, null, 2),
    ).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test('skip link receives visible keyboard focus and reaches main', async ({
  page,
  browserName,
}) => {
  await page.goto('/');
  await page.keyboard.press(tabKey(browserName));
  const skip = page.getByRole('link', { name: 'Skip to content' });
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
  const outline = await skip.evaluate(
    (el) => getComputedStyle(el).outlineStyle,
  );
  expect(outline).not.toBe('none');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#main$/);
});

test('navigation remains usable without JavaScript', async ({
  browser,
}, testInfo) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: testInfo.project.use.viewport,
  });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4321/');
  const nav = page.getByRole('navigation', { name: 'Primary navigation' });
  await expect(
    nav.getByRole('link', { name: 'Services', exact: true }),
  ).toBeVisible();
  await nav.getByRole('link', { name: 'Services', exact: true }).click();
  await expect(page).toHaveURL(/\/services\/$/);
  await page.goto('http://127.0.0.1:4321/');
  await page
    .locator('.nav-dropdown summary')
    .filter({ hasText: 'Products' })
    .click();
  await page
    .getByRole('navigation', { name: 'Primary navigation' })
    .getByRole('link', { name: 'Software', exact: true })
    .click();
  await expect(page).toHaveURL(/\/products\/software\/$/);
  await context.close();
});

test('contact is clearly unavailable until configuration is verified', async ({
  page,
}) => {
  await page.goto('/contact/');
  await expect(
    page.getByRole('button', {
      name: /coming soon|unavailable|not yet|not available/i,
    }),
  ).toBeDisabled();
  await expect(page.getByLabel(/your name/i)).toBeDisabled();
});

test('reduced motion disables smooth scrolling and animation', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  expect(
    await page.evaluate(
      () => getComputedStyle(document.documentElement).scrollBehavior,
    ),
  ).toBe('auto');
  const animated = await page.evaluate(
    () =>
      [...document.querySelectorAll('*')].filter((el) => {
        const style = getComputedStyle(el);
        return (
          style.animationName !== 'none' &&
          parseFloat(style.animationDuration) > 0.01
        );
      }).length,
  );
  expect(animated).toBe(0);
});

test('dropdowns support keyboard, dismissal, and navigation', async ({
  page,
  browserName,
}) => {
  await page.goto('/');
  const menu = page.getByRole('button', { name: 'Menu', exact: true });
  if (await menu.isVisible()) {
    await menu.click();
    await expect(menu).toHaveAttribute('aria-expanded', 'true');
  }
  const products = page
    .locator('.nav-dropdown')
    .filter({ has: page.locator('summary', { hasText: 'Products' }) });
  const summary = products.locator('summary');
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(products).toHaveAttribute('open', '');
  await page.keyboard.press(tabKey(browserName));
  await expect(products.getByRole('link', { name: 'Software' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(products).not.toHaveAttribute('open', '');
  await expect(summary).toBeFocused();
  await summary.click();
  await page.locator('h1').click();
  await expect(products).not.toHaveAttribute('open', '');
  if (await menu.isVisible()) {
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
    await menu.click();
  }
  await summary.click();
  await products.getByRole('link', { name: 'Software' }).click();
  await expect(page).toHaveURL(/\/products\/software\/$/);
  if (await menu.isVisible()) await menu.click();
  await expect(
    page.locator('#primary-navigation a[aria-current="page"]'),
  ).toHaveText(/Software/);
});

test('small 320px layouts do not overflow', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 812 });
  for (const route of ['/', '/services/', '/contact/']) {
    await page.goto(route);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      route,
    ).toBe(true);
  }
});
