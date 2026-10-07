import { execute } from './commands.js';
import { cliFailure } from './errors.js';

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

try {
  const result = await execute(process.argv.slice(2), (value) =>
    print(process.stderr, value as object),
  );
  print(process.stdout, result);
  process.exitCode = 'ok' in result && !result.ok ? 1 : 0;
} catch (error) {
  print(process.stdout, cliFailure(error));
  process.exitCode = 1;
}
