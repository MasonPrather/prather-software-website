import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function mockTurnstile(page: Page, throws = false) {
  await page.route(
    'https://challenges.cloudflare.com/turnstile/v0/api.js*',
    (route) =>
      route.fulfill({
        contentType: 'application/javascript',
        body: `window.__verification={resets:0,token:'test-token'};window.turnstile={render(element,options){${throws ? "throw new Error('Invalid test key');" : "window.__options=options;setTimeout(()=>options.callback(),0);return 'test-widget';"}},getResponse(){return window.__verification.token;},reset(){window.__verification.resets++;window.__verification.token='fresh-token-'+window.__verification.resets;setTimeout(()=>window.__options.callback(),0);}};`,
      }),
  );
}
async function fillInquiry(page: Page) {
  await page.getByLabel('Your name').fill('Ada Lovelace');
  await page.getByLabel('Email address').fill('ada@example.com');
  await page.getByLabel('Inquiry type').selectOption('project');
  await page
    .getByLabel('How can we help?')
    .fill('Please help us build an accessible internal reporting workflow.');
}

test('active contact announces failure, retains fields, resets verification, then confirms acceptance', async ({
  page,
}) => {
  await mockTurnstile(page);
  let calls = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('http://127.0.0.1:4322/api/contact', async (route) => {
    const payload = route.request().postDataJSON();
    expect(payload.category).toBe('project');
    expect(payload['cf-turnstile-response']).toMatch(/test-token|fresh-token-/);
    calls++;
    await gate;
    await route.fulfill({
      status: calls === 1 ? 503 : 200,
      json: {
        ok: calls > 1,
        message:
          calls === 1
            ? 'Contact submissions are temporarily unavailable. No message was sent.'
            : 'Your inquiry was accepted by our email service. Thank you for getting in touch.',
      },
    });
  });
  await page.goto('http://127.0.0.1:4322/contact/');
  await fillInquiry(page);
  const submit = page.getByRole('button', { name: /Send inquiry/ });
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page.locator('#contact-form')).toHaveAttribute(
    'aria-busy',
    'true',
  );
  release();
  await expect(page.getByRole('alert')).toHaveText(/No message was sent/);
  await expect(page.locator('#contact-status')).toBeFocused();
  await expect(page.getByLabel('Email address')).toHaveValue('ada@example.com');
  await expect(submit).toBeEnabled();
  const audit = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(audit.violations).toEqual([]);
  await submit.click();
  await expect(page.locator('#contact-status')).toHaveText(
    /accepted by our email service/,
  );
  await expect(page.getByLabel('Email address')).toHaveValue('');
  expect(calls).toBe(2);
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { __verification: { resets: number } })
          .__verification.resets,
    ),
  ).toBe(2);
});

test('Turnstile render failure leaves submit disabled with an announced error', async ({
  page,
}) => {
  await mockTurnstile(page, true);
  await page.goto('http://127.0.0.1:4322/contact/');
  await expect(page.getByRole('alert')).toHaveText(
    /Security verification could not load/,
  );
  await expect(
    page.getByRole('button', { name: /Send inquiry/ }),
  ).toBeDisabled();
});

test('native validation rejects incomplete active inquiries before any request', async ({
  page,
}) => {
  await mockTurnstile(page);
  let submitted = false;
  await page.route('http://127.0.0.1:4322/api/contact', (route) => {
    submitted = true;
    return route.abort();
  });
  await page.goto('http://127.0.0.1:4322/contact/');
  await expect(
    page.getByRole('button', { name: /Send inquiry/ }),
  ).toBeEnabled();
  await page.getByRole('button', { name: /Send inquiry/ }).click();
  await expect(page.getByLabel('Your name')).toBeFocused();
  expect(submitted).toBe(false);
});

test('active contact cannot submit without JavaScript verification', async ({
  browser,
}, testInfo) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: testInfo.project.use.viewport,
  });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4322/contact/');
  await expect(
    page.getByRole('button', { name: /Send inquiry/ }),
  ).toBeDisabled();
  await expect(
    page.getByText(
      'JavaScript is required for security verification and online inquiries.',
    ),
  ).toBeVisible();
  await context.close();
});
