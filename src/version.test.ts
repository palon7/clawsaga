import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import metadata from '../package.json' with { type: 'json' };

// 更新案内はpackage.jsonの版で判定し、インストーラはSKILL.mdの版で更新を探す。
// ずれると「更新を促すのに更新できない」状態になるため、ここで一致を固定する。
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
