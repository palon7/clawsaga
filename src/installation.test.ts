import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { npmGlobalExecutable } from './installation.js';

const originalEntry = process.argv[1];
const temporary: string[] = [];
afterEach(async () => {
  process.argv[1] = originalEntry!;
  await Promise.all(
    temporary
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

it('locates the running CLI in a custom npm prefix through its bin link', async () => {
  const root = await mkdtemp(join(tmpdir(), 'clawsaga-npm-'));
  temporary.push(root);
  const modules = join(root, 'lib/node_modules');
  const entry = join(modules, '@clawsaga/cli/bin/clawsaga.mjs');
  await mkdir(dirname(entry), { recursive: true });
  await writeFile(entry, '');
  await mkdir(join(root, 'bin'));
  await symlink(entry, join(root, 'bin/clawsaga'));
  process.argv[1] = join(root, 'bin/clawsaga');
  const runNpm = vi.fn(() => Promise.resolve({ stdout: `${modules}\n` }));

  expect(await npmGlobalExecutable(runNpm)).toBe(entry);
  expect(runNpm).toHaveBeenCalledWith(['root', '-g']);
});

it('does not replace a development copy with an unrelated global installation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'clawsaga-unmanaged-'));
  temporary.push(root);
  process.argv[1] = join(root, 'source.mjs');
  await writeFile(process.argv[1], '');
  await expect(
    npmGlobalExecutable(() => Promise.resolve({ stdout: root })),
  ).rejects.toMatchObject({ code: 'UPDATE_FAILED' });
});
