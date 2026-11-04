import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('dist');
async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) =>
        entry.isDirectory()
          ? walk(path.join(dir, entry.name))
          : [path.join(dir, entry.name)],
      ),
    )
  ).flat();
}
const pages = (await walk(root)).filter((file) => file.endsWith('.html'));
let links = 0;
for (const page of pages) {
  const html = await readFile(page, 'utf8');
  assert.match(html, /<html[^>]+lang="en"/, `${page}: language missing`);
  assert.doesNotMatch(
    html,
    /href="\/work(?:\/|")/,
    `${page}: retired portfolio link remains`,
  );
  assert.equal(
    (html.match(/<h1(?:\s|>)/g) ?? []).length,
    1,
    `${page}: expected one h1`,
  );
  const pathname =
    '/' +
    path
      .relative(root, page)
      .replaceAll(path.sep, '/')
      .replace(/index\.html$/, '');
  for (const match of html.matchAll(/(?:href|src)="([^"<>]+)"/g)) {
    const value = match[1].replaceAll('&amp;', '&');
    if (/^(?:https?:|mailto:|tel:|data:|javascript:)/.test(value)) continue;
    const url = new URL(value, 'https://prathersoftware.com' + pathname);
    if (url.pathname === '/api/contact') continue;
    const local = path.join(root, decodeURIComponent(url.pathname));
    let target;
    try {
      target = (await stat(local)).isDirectory()
        ? path.join(local, 'index.html')
        : local;
      await stat(target);
    } catch {
      assert.fail(`${pathname}: broken local reference ${value}`);
    }
    if (url.hash && target.endsWith('.html')) {
      const destination = await readFile(target, 'utf8');
      const id = decodeURIComponent(url.hash.slice(1));
      assert.ok(
        destination.includes(`id="${id}"`),
        `${pathname}: missing fragment ${value}`,
      );
    }
    links++;
  }
}
const sitemap = await readFile(path.join(root, 'sitemap.xml'), 'utf8');
for (const match of sitemap.matchAll(
  /<loc>https:\/\/prathersoftware\.com([^<]*)<\/loc>/g,
)) {
  const file = path.join(root, match[1], 'index.html');
  await stat(file);
}
assert.ok(
  pages.length >= 14,
  'Expected client services, products, and company pages',
);
assert.ok(
  !sitemap.includes('https://prathersoftware.com/work/'),
  'Retired portfolio URLs must not appear in the sitemap',
);
for (const route of [
  'work/index.html',
  'work/collaborative-xr-research/index.html',
  'work/adaptive-vr-classroom/index.html',
  'work/programmable-network-telemetry/index.html',
]) {
  await assert.rejects(
    stat(path.join(root, route)),
    `${route}: retired portfolio output remains`,
  );
}
console.log(
  `Verified ${pages.length} HTML pages, ${links} local references, and sitemap routes.`,
);
