import { expect, test, type Page } from '@playwright/test';

const poster = '/images/hero-checkerboard.svg';
const animation = '/test-hero.gif';

// Exercise the optional GIF path with the actual production script, without
// putting a test image or alternate homepage in source content or build output.
async function animatedHero(page: Page, broken = false) {
  let requests = 0;
  await page.route(`**${animation}`, (route) => {
    requests++;
    return broken
      ? route.fulfill({ status: 404, body: '' })
      : route.fulfill({
          contentType: 'image/gif',
          body: Buffer.from(
            'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
            'base64',
          ),
        });
  });
  await page.route('http://127.0.0.1:4321/', async (route) => {
    const response = await route.fetch();
    const html = (await response.text()).replace(
      /<div\b([^>]*\bdata-hero-backdrop\b[^>]*)>/,
      (_match, attributes: string) => {
        const scope =
          attributes.match(/data-astro-cid-[\w-]+/g)?.join(' ') ?? '';
        return `<div${attributes} data-motion-src="${animation}"><button ${scope} class="hero-motion-toggle" type="button" hidden>Pause background animation</button>`;
      },
    );
    await route.fulfill({ response, body: html });
  });
  return () => requests;
}

test('the supplied logo loads and the centered headline overlays the blurred placeholder', async ({
  page,
}) => {
  await page.goto('/');
  const logos = page.locator('header img, footer img');
  await expect(logos).toHaveCount(2);
  for (const logo of await logos.all()) {
    await expect(logo).toHaveAttribute(
      'src',
      '/brand/prather-software-logo.jpg',
    );
    expect(
      await logo.evaluate((el: HTMLImageElement) => el.naturalWidth),
    ).toBeGreaterThan(0);
  }
  await expect(
    page
      .locator('header')
      .getByRole('link', { name: 'Prather Software home', exact: true }),
  ).toBeVisible();
  const headline = page.locator('h1');
  const hero = page.locator('.hero');
  await expect(headline).toHaveCSS('text-align', 'center');
  const headingBox = await headline.boundingBox();
  const heroBox = await hero.boundingBox();
  expect(headingBox).not.toBeNull();
  expect(heroBox).not.toBeNull();
  expect(
    Math.abs(
      headingBox!.x + headingBox!.width / 2 - (heroBox!.x + heroBox!.width / 2),
    ),
  ).toBeLessThan(2);
  const background = page.locator('[data-hero-image]');
  await expect(background).toHaveAttribute('src', poster);
  await expect(background).toHaveAttribute('alt', '');
  await expect(background.locator('..')).toHaveAttribute('aria-hidden', 'true');
  expect(
    await background.evaluate((el) => getComputedStyle(el).filter),
  ).toMatch(/blur\([1-9]/);
  const imageBox = await background.boundingBox();
  expect(imageBox!.y).toBeLessThan(headingBox!.y);
  expect(imageBox!.y + imageBox!.height).toBeGreaterThan(
    headingBox!.y + headingBox!.height,
  );
  await expect(
    page.getByRole('button', { name: /background animation/ }),
  ).toHaveCount(0);
});

test('an optional GIF can be paused with the keyboard and respects a motion preference change', async ({
  page,
}) => {
  await animatedHero(page);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  const background = page.locator('[data-hero-image]');
  const backdrop = page.locator('[data-hero-backdrop]');
  const pause = page.getByRole('button', {
    name: 'Pause background animation',
  });
  await expect(background).toHaveAttribute('src', animation);
  await expect(pause).toBeVisible();
  await pause.focus();
  await page.keyboard.press('Enter');
  await expect(background).toHaveAttribute('src', poster);
  await expect(backdrop).toHaveAttribute('data-motion-state', 'paused');
  const play = page.getByRole('button', { name: 'Play background animation' });
  await expect(play).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(background).toHaveAttribute('src', animation);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(background).toHaveAttribute('src', poster);
  await expect(pause).toBeHidden();
});

test('reduced-motion visitors never request the optional GIF', async ({
  page,
}) => {
  const requests = await animatedHero(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('[data-hero-image]')).toHaveAttribute(
    'src',
    poster,
  );
  await expect(page.locator('[data-hero-backdrop]')).toHaveAttribute(
    'data-motion-state',
    'paused',
  );
  await expect(
    page.getByRole('button', { name: /background animation/ }),
  ).toBeHidden();
  expect(requests()).toBe(0);
});

test('without JavaScript the optional GIF remains a static poster', async ({
  browser,
}, testInfo) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: testInfo.project.use.viewport,
  });
  const page = await context.newPage();
  const requests = await animatedHero(page);
  await page.goto('http://127.0.0.1:4321/');
  await expect(page.locator('[data-hero-image]')).toHaveAttribute(
    'src',
    poster,
  );
  await expect(
    page.getByRole('button', { name: /background animation/ }),
  ).toBeHidden();
  expect(requests()).toBe(0);
  await context.close();
});

test('an unavailable GIF returns to the static poster', async ({ page }) => {
  await animatedHero(page, true);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await expect(page.locator('[data-hero-image]')).toHaveAttribute(
    'src',
    poster,
  );
  await expect(page.locator('[data-hero-backdrop]')).toHaveAttribute(
    'data-motion-state',
    'paused',
  );
  await expect(
    page.getByRole('button', { name: /background animation/ }),
  ).toBeHidden();
});
