import { expect, test } from '@playwright/test';

const products = [
  {
    title: 'Quest Theater',
    route: '/products/software/quest-theater/',
    catalog: '/products/software/',
    platforms: 'Meta Quest',
    status: 'Coming soon',
    planned: ['Casting from Android devices'],
  },
  {
    title: 'Promenade',
    route: '/products/games/promenade/',
    catalog: '/products/games/',
    platforms: 'iOS',
    status: 'In development',
    planned: [],
  },
  {
    title: 'Rick Dangerman (& the Cuboids) Remastered',
    route: '/products/games/rick-dangerman-remastered/',
    catalog: '/products/games/',
    platforms: 'PC',
    status: 'In development',
    planned: ['Controller support', 'Console support'],
  },
  {
    title: 'Floor 13',
    route: '/products/games/floor-13/',
    catalog: '/products/games/',
    platforms: 'Meta Quest, PC VR',
    status: 'In development',
    planned: [],
  },
];
for (const product of products) {
  test(`${product.title} preserves platform facts and unreleased availability`, async ({
    page,
  }) => {
    await page.goto(product.catalog);
    await expect(
      page.getByRole('link', {
        name: new RegExp(product.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      }),
    ).toHaveAttribute('href', product.route);
    await page.goto(product.route);
    await expect(page.locator('h1')).toHaveText(product.title);
    const facts = page.locator('dl.facts');
    await expect(
      facts
        .locator('div')
        .filter({ has: page.locator('dt', { hasText: /^Platforms$/ }) })
        .locator('dd'),
    ).toHaveText(product.platforms);
    await expect(
      facts
        .locator('div')
        .filter({ has: page.locator('dt', { hasText: 'Availability' }) })
        .locator('dd'),
    ).toHaveText(product.status);
    await expect(facts.locator('dt', { hasText: /^Price$/ })).toHaveCount(0);
    await expect(
      page.getByRole('link', { name: /Visit official product listing/ }),
    ).toHaveCount(0);
    for (const planned of product.planned)
      await expect(page.locator('.planned-support')).toContainText(planned);
    if (product.planned.length === 0)
      await expect(page.locator('.planned-support')).toHaveCount(0);
    if (product.title === 'Quest Theater')
      await expect(
        facts
          .locator('div')
          .filter({
            has: page.locator('dt', { hasText: 'Planned release week' }),
          })
          .locator('dd'),
      ).toHaveText('November 2–8, 2026');
    if (product.title.startsWith('Rick Dangerman'))
      await expect(page.locator('.planned-support')).toContainText(
        'if the PC release is successful',
      );
    if (product.title === 'Promenade')
      for (const mode of ['solo', 'private multiplayer', 'public multiplayer'])
        await expect(page.locator('.prose')).toContainText(mode);
  });
}
test('homepage features all four owner-confirmed products', async ({
  page,
}) => {
  await page.goto('/');
  for (const product of products)
    await expect(
      page
        .locator('main')
        .getByRole('link')
        .filter({ has: page.locator('h3', { hasText: product.title }) }),
    ).toHaveAttribute('href', product.route);
});
test('client services cover the contracted software offering', async ({
  page,
}) => {
  await page.goto('/services/');
  for (const scope of [
    'Website design',
    'PC and mobile',
    'SaaS',
    'Server support',
    'AI service integrations',
    'Ongoing technical service',
    'contracted software implementations',
  ])
    await expect(page.locator('main')).toContainText(scope);
});
