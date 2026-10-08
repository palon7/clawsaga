import assert from 'node:assert/strict';
import console from 'node:console';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const temporary = mkdtempSync(join(tmpdir(), 'clawsaga-npm-'));
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
try {
  const packed = JSON.parse(
    execFileSync('npm', ['pack', '--json', '--pack-destination', temporary], {
      cwd: root,
      encoding: 'utf8',
    }),
  )[0];
  const prefix = join(temporary, 'prefix');
  execFileSync(
    'npm',
    [
      'install',
      '--global',
      '--prefix',
      prefix,
      '--cache',
      join(temporary, 'cache'),
      '--offline',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      join(temporary, packed.filename),
    ],
    { cwd: temporary, stdio: 'pipe' },
  );
  const env = {
    ...process.env,
    PATH: `${join(prefix, 'bin')}${delimiter}${process.env.PATH}`,
  };
  const run = (...args) =>
    JSON.parse(
      execFileSync('clawsaga', args, {
        cwd: temporary,
        env,
        encoding: 'utf8',
      }),
    );
  assert.deepEqual(run('--version'), { ok: true, version: pkg.version });
  assert.equal(run('--help').ok, true);
  console.log(
    'Packed CLI installs offline and runs as clawsaga outside the source directory.',
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
