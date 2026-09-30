import { execute } from './commands.js';
import { cliFailure } from './errors.js';

// client.tsが版を検査済みなので、エージェントへ出す出力には含めない。
function print(stream: NodeJS.WriteStream, value: object) {
  const output: Record<string, unknown> = { ...value };
  delete output.schema_version;
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
