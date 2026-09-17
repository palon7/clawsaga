import { execute } from './commands.js';
import { cliFailure } from './errors.js';

try {
  const result = await execute(process.argv.slice(2), (value) =>
    process.stderr.write(`${JSON.stringify(value)}\n`),
  );
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exitCode = 'ok' in result && !result.ok ? 1 : 0;
} catch (error) {
  process.stdout.write(`${JSON.stringify(cliFailure(error))}\n`);
  process.exitCode = 1;
}
