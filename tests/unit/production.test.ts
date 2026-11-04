import assert from 'node:assert/strict';
import test from 'node:test';
import worker, {
  applySecurityHeaders,
  canonicalRedirect,
} from '../../worker/index';

test('indexing stays disabled unless explicitly enabled, including errors', () => {
  assert.equal(
    applySecurityHeaders(new Response('staging')).headers.get('X-Robots-Tag'),
    'noindex, nofollow',
  );
  assert.equal(
    applySecurityHeaders(new Response('production'), true).headers.get(
      'X-Robots-Tag',
    ),
    null,
  );
  assert.equal(
    applySecurityHeaders(
      new Response('missing', { status: 404 }),
      true,
    ).headers.get('X-Robots-Tag'),
    'noindex, nofollow',
  );
  assert.equal(
    applySecurityHeaders(
      new Response('upstream', { headers: { 'X-Robots-Tag': 'noindex' } }),
      true,
    ).headers.get('X-Robots-Tag'),
    'noindex',
  );
});

test('canonical redirects preserve path and query without redirecting other hosts', () => {
  for (const origin of [
    'http://prathersoftware.com',
    'http://www.prathersoftware.com',
    'https://www.prathersoftware.com',
    'https://www.prathersoftware.com:8443',
  ]) {
    const response = canonicalRedirect(
      new Request(origin + '/products/software/?view=all'),
    );
    assert.equal(response?.status, 308);
    assert.equal(
      response?.headers.get('Location'),
      'https://prathersoftware.com/products/software/?view=all',
    );
  }
  for (const origin of [
    'https://prathersoftware.com',
    'https://privacy.prathersoftware.com',
    'http://localhost:8787',
    'https://unrelated.example',
  ]) {
    assert.equal(canonicalRedirect(new Request(origin)), null);
  }
});

test('production enables page indexing while API responses remain nonindexable', async () => {
  const env = {
    SITE_INDEXING: 'enabled',
    CONTACT_ENABLED: 'false',
    CONTACT_DELIVERY_VERIFIED: 'false',
    ASSETS: { fetch: async () => new Response('page') },
  } as unknown as Env;
  const response = await worker.fetch(
    new Request('https://prathersoftware.com/'),
    env,
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('X-Robots-Tag'), null);
  const unavailable = await worker.fetch(
    new Request('https://prathersoftware.com/api/contact', { method: 'POST' }),
    env,
  );
  assert.equal(unavailable.status, 503);
  assert.equal(unavailable.headers.get('X-Robots-Tag'), 'noindex, nofollow');
  const redirect = await worker.fetch(
    new Request('https://www.prathersoftware.com/services/'),
    env,
  );
  assert.equal(redirect.status, 308);
  const staging = await worker.fetch(
    new Request('https://www.prathersoftware.com/'),
    { ...env, SITE_INDEXING: 'disabled' },
  );
  assert.equal(staging.status, 200);
  assert.equal(staging.headers.get('X-Robots-Tag'), 'noindex, nofollow');
});
