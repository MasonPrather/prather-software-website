import assert from 'node:assert/strict';
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
  access,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// Exercise real collection loaders and routes without publishing example products.
const root = process.cwd();
const fixture = await mkdtemp(path.join(tmpdir(), 'prather-content-'));
const astro = path.join(root, 'node_modules/astro/bin/astro.mjs');
function build() {
  return spawnSync(process.execPath, [astro, 'build'], {
    cwd: fixture,
    encoding: 'utf8',
    timeout: 90_000,
    env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1' },
  });
}
try {
  for (const name of ['src', 'public']) {
    try {
      await cp(path.join(root, name), path.join(fixture, name), {
        recursive: true,
      });
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  for (const name of ['package.json', 'astro.config.mjs', 'tsconfig.json'])
    await cp(path.join(root, name), path.join(fixture, name));
  await symlink(
    path.join(root, 'node_modules'),
    path.join(fixture, 'node_modules'),
    'dir',
  );
  const released = (kind, published = true) =>
    `---
 title: "QA ${kind} fixture"
 summary: "Temporary test content, never a real product or public release."
 status: "Released"
 platforms: ["Web"]
 price: "Free"
 storeUrl: "https://example.com/qa-${kind}"
 published: ${published}
---

Temporary release content to exercise the detail template.
`.replace(/^ /gm, '');
  for (const kind of ['software', 'games']) {
    const dir = path.join(fixture, 'src/content', kind);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'qa-release.md'), released(kind));
    await writeFile(path.join(dir, 'qa-draft.md'), released(kind, false));
  }
  let result = build();
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const sitemap = await readFile(
    path.join(fixture, 'dist/sitemap.xml'),
    'utf8',
  );
  for (const kind of ['software', 'games']) {
    const detail = await readFile(
      path.join(fixture, 'dist/products', kind, 'qa-release/index.html'),
      'utf8',
    );
    const catalog = await readFile(
      path.join(fixture, 'dist/products', kind, 'index.html'),
      'utf8',
    );
    assert.ok(detail.includes(`QA ${kind} fixture`));
    assert.ok(detail.includes(`https://example.com/qa-${kind}`));
    assert.ok(catalog.includes(`/products/${kind}/qa-release/`));
    assert.ok(sitemap.includes(`/products/${kind}/qa-release/`));
    assert.ok(!sitemap.includes('qa-draft'));
    await assert.rejects(
      access(path.join(fixture, 'dist/products', kind, 'qa-draft/index.html')),
    );
  }
  const invalid = released('software').replace(
    'storeUrl: "https://example.com/qa-software"\n',
    '',
  );
  await writeFile(
    path.join(fixture, 'src/content/software/qa-release.md'),
    invalid,
  );
  result = build();
  assert.notEqual(
    result.status,
    0,
    'A published Released product without a store URL must fail validation',
  );
  console.log(
    'Verified software/game detail routes, catalog and sitemap publication gates, and invalid release rejection in isolated fixtures.',
  );
} finally {
  await rm(fixture, { recursive: true, force: true });
}
