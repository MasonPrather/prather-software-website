import { expect, test } from '@playwright/test';

const retiredRoutes = [
  '/work/',
  '/work/collaborative-xr-research/',
  '/work/adaptive-vr-classroom/',
  '/work/programmable-network-telemetry/',
];

test('retired research and personal portfolio URLs return the branded 404', async ({
  page,
}) => {
  for (const route of retiredRoutes) {
    const response = await page.goto(route);
    expect(response?.status(), route).toBe(404);
    await expect(page.locator('h1')).toHaveText("Let's get you back on track.");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      'content',
      /(?:^|,\s*)noindex(?:,|$)/,
    );
    await expect(
      page.getByRole('link', { name: /Back to Home/ }),
    ).toHaveAttribute('href', '/');
  }
});

test('the sitemap contains services and products without retired portfolio routes', async ({
  request,
}) => {
  const response = await request.get('/sitemap.xml');
  expect(response.status()).toBe(200);
  const sitemap = await response.text();
  expect(sitemap).toContain('https://prathersoftware.com/services/');
  expect(sitemap).toContain(
    'https://prathersoftware.com/products/software/quest-theater/',
  );
  expect(sitemap).toContain(
    'https://prathersoftware.com/products/games/promenade/',
  );
  expect(sitemap).not.toContain('https://prathersoftware.com/work/');
});
