import { execute } from './commands.js';
import { CliError } from './errors.js';

try {
  const result = await execute(process.argv.slice(2), (value) =>
    process.stderr.write(`${JSON.stringify(value)}\n`),
  );
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exitCode = result.ok ? 0 : 1;
} catch (error) {
  const failure =
    error instanceof CliError ? error : new CliError('CLIENT_ERROR');
  process.stdout.write(
    `${JSON.stringify({ ok: false, error: { code: failure.code, ...failure.detail } })}\n`,
  );
  process.exitCode = 1;
}
