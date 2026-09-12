import { build } from 'esbuild';
import {
  copyFileSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';

const result = await build({
  entryPoints: ['src/main.ts'],
  outfile: 'skills/clawsaga/bin/clawsaga.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22.12',
  metafile: true,
  banner: {
    js: '#!/usr/bin/env node\nimport { createRequire } from "node:module"; const require = createRequire(import.meta.url);',
  },
});

const roots = new Set();
for (const input of Object.keys(result.metafile.inputs)) {
  const absolute = resolve(input).replaceAll('\\', '/');
  const marker = '/node_modules/';
  const boundary = absolute.lastIndexOf(marker);
  if (boundary < 0) continue;
  const segments = absolute.slice(boundary + marker.length).split('/');
  const name = segments[0].startsWith('@')
    ? segments.slice(0, 2).join('/')
    : segments[0];
  roots.add(absolute.slice(0, boundary + marker.length) + name);
}
const licenses = [...roots].sort().map((root) => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const filename = readdirSync(root).find((file) =>
    /^licen[cs]e(?:\.|$)/i.test(file),
  );
  if (!filename) throw new Error(`Missing license for ${pkg.name}`);
  return `${pkg.name} ${pkg.version}\n\n${readFileSync(join(root, filename), 'utf8')}`;
});
writeFileSync(
  'skills/clawsaga/THIRD-PARTY-LICENSES.txt',
  licenses.join('\n\n---\n\n'),
);
copyFileSync('LICENSE', 'skills/clawsaga/LICENSE');
