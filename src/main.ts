import { execute } from './commands.js';
import { cliFailure } from './errors.js';
import type { AgentHint } from './protocol.js';
import { announcedCliUpdate } from './client.js';
import { recoverUpdate, updateAnnouncedCli } from './update.js';

// 出力の先頭だけを読むエージェントがいる。読み手が存在を予期できない項目を
// `data`より前に、判断に使わない時刻を最後に置く。
// client.tsが版を検査済みなので、エージェントへ出す出力には含めない。
function print(stream: NodeJS.WriteStream, value: object) {
  const { ok, error, hints, attention, server_time, ...rest } = value as Record<
    string,
    unknown
  >;

  delete rest.schema_version;
  const output = { ok, error, hints, attention, ...rest, server_time };
  stream.write(`${JSON.stringify(output)}\n`);
}

function printNote(note: string) {
  print(process.stderr, { hints: [{ note }] });
}

function printResult(
  value: object & { hints?: AgentHint[] | undefined; attention?: unknown },
) {
  for (const hint of value.hints ?? []) {
    if (hint.note !== undefined) process.stderr.write(`Hint: ${hint.note}\n`);
  }

  if (value.attention !== undefined) {
    process.stderr.write(`Attention: ${JSON.stringify(value.attention)}\n`);
  }

  print(process.stdout, value);
}

try {
  const result = await execute(process.argv.slice(2), (value) =>
    print(process.stderr, value as object),
  );

  printResult(result);
  process.exitCode = 'ok' in result && !result.ok ? 1 : 0;

  const announced = announcedCliUpdate();
  if (announced) await updateAnnouncedCli(announced, printNote);
} catch (error) {
  printResult(cliFailure(await recoverUpdate(error, printNote)));
  process.exitCode = 1;
}
