import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import metadata from '../package.json' with { type: 'json' };

// 同じリリースの公開物は版をそろえる。利用者の導入済みCLIとスキルは独立して更新できる。
it('keeps the skill version in step with the package version', async () => {
  const skill = await readFile(
    new URL('../skills/clawsaga/SKILL.md', import.meta.url),
    'utf8',
  );
  const version =
    /^metadata:\n(?:.*\n)*?[ \t]+version:[ \t]*'?([^'\n]+)'?$/m.exec(
      skill,
    )?.[1];
  expect(version).toBe(metadata.version);
});

// 公開処理はこの節を公開PRとReleaseの本文に使い、節がなければ公開を止める。
it('has a changelog section for the package version', async () => {
  const changelog = await readFile(
    new URL('../CHANGELOG.md', import.meta.url),
    'utf8',
  );
  expect(changelog.split('\n')).toContain(`## ${metadata.version}`);
});
