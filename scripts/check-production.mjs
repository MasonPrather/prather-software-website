import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

// Run manually after an authorized deployment, never in local/PR verification.
// The one empty POST below verifies that contact collection remains disabled.
const origin = 'https://prathersoftware.com';
const digest = (body) => createHash('sha256').update(body).digest('hex');
const get = (url, init = {}) =>
  fetch(url, {
    ...init,
    redirect: 'manual',
    signal: AbortSignal.timeout(20_000),
  });
function security(response) {
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(response.headers.get('X-Frame-Options'), 'DENY');
  assert.ok(
    response.headers
      .get('Content-Security-Policy')
      ?.includes("frame-ancestors 'none'"),
  );
}
const sitemap = await readFile('dist/sitemap.xml', 'utf8');
const routes = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
  (match) => new URL(match[1]),
);
assert.ok(routes.length > 0, 'Build the site before running production checks');
for (const url of routes) {
  assert.equal(url.origin, origin);
  const response = await get(url);
  assert.equal(response.status, 200, url.href);
  security(response);
  assert.equal(response.headers.get('X-Robots-Tag'), null, url.href);
  const html = await response.text();
  const expected = await readFile(
    path.join('dist', url.pathname, 'index.html'),
    'utf8',
  );
  assert.equal(
    digest(html),
    digest(expected),
    `Deployed HTML differs from this build: ${url.href}`,
  );
  assert.ok(
    html.includes(`href="${url.href}"`),
    `Missing canonical URL: ${url.href}`,
  );
  if (url.pathname === '/contact/')
    assert.match(html, /<fieldset[^>]*disabled/);
}
let assets = 0;
for (const file of await readdir('dist', { recursive: true })) {
  const local = path.join('dist', file);
  if (!(await stat(local)).isFile() || file.endsWith('.html')) continue;
  const response = await get(new URL(file, origin + '/'));
  assert.equal(response.status, 200, file);
  security(response);
  assert.equal(
    digest(Buffer.from(await response.arrayBuffer())),
    digest(await readFile(local)),
    `Asset differs: ${file}`,
  );
  assets++;
}
for (const host of [
  'http://prathersoftware.com',
  'http://www.prathersoftware.com',
  'https://www.prathersoftware.com',
]) {
  const response = await get(host + '/services/?source=launch-check');
  assert.equal(response.status, 308, host);
  assert.equal(
    response.headers.get('Location'),
    origin + '/services/?source=launch-check',
  );
}
const missing = await get(origin + '/launch-check-missing-page/');
assert.equal(missing.status, 404);
assert.equal(missing.headers.get('X-Robots-Tag'), 'noindex, nofollow');
assert.match(await missing.text(), /Let's get you back on track/);
const method = await get(origin + '/api/contact');
assert.equal(method.status, 405);
const unavailable = await get(origin + '/api/contact', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: origin },
  body: '{}',
});
assert.equal(unavailable.status, 503);
assert.equal(unavailable.headers.get('Cache-Control'), 'no-store');
assert.equal(unavailable.headers.get('X-Robots-Tag'), 'noindex, nofollow');
assert.equal((await unavailable.json()).ok, false);
const privacy = await fetch('https://privacy.prathersoftware.com/', {
  signal: AbortSignal.timeout(20_000),
});
assert.equal(privacy.status, 200);
console.log(
  JSON.stringify({
    privacyURL: privacy.url,
    privacySHA256: digest(Buffer.from(await privacy.arrayBuffer())),
  }),
);
console.log(
  `Verified ${routes.length} live pages and ${assets} assets against this build, HTTPS/www redirects, indexing/security headers, branded 404, disabled contact, and existing privacy availability.`,
);
