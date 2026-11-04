import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const files = [
  ...new Set(
    execFileSync(
      'git',
      ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
      { encoding: 'utf8' },
    )
      .split('\0')
      .filter(Boolean),
  ),
];
const patterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{50,}\b/,
  /\bAKIA[A-Z0-9]{16}\b/,
  /\bre_[A-Za-z0-9]{30,}\b/,
];
const problems = [];
for (const file of files) {
  if (
    /^(?:.*\/)?(?:\.env(?:\..*)?|\.dev\.vars(?:\..*)?)$/.test(file) &&
    !file.endsWith('.example')
  )
    problems.push(`${file}: private environment file must not be tracked`);
  if (
    /\.(?:png|jpg|jpeg|webp|ico|woff2?)$/.test(file) ||
    file === 'package-lock.json'
  )
    continue;
  let content;
  try {
    content = await readFile(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') continue;
    throw error;
  }
  if (patterns.some((pattern) => pattern.test(content)))
    problems.push(`${file}: possible credential detected`);
}
assert.deepEqual(problems, [], problems.join('\n'));
console.log(
  `Checked ${files.length} repository files for private env files and common secret patterns (not a complete credential audit).`,
);
