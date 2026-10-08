import { realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { CliError } from './errors.js';

type RunNpm = (args: string[]) => Promise<{ stdout: string }>;

/**
 * Path of the running CLI inside npm's global root, including a custom prefix.
 * Rejects with UPDATE_FAILED for a source checkout or any other installation,
 * so an update never replaces a copy npm does not own.
 */
export async function npmGlobalExecutable(runNpm: RunNpm): Promise<string> {
  try {
    const executable = join(
      (await runNpm(['root', '-g'])).stdout.trim(),
      '@clawsaga/cli/bin/clawsaga.mjs',
    );
    const running = await realpath(process.argv[1] ?? '');
    if ((await realpath(executable)) === running) return executable;
  } catch {
    // Without npm or the global package, npm does not own this installation.
  }
  throw new CliError('UPDATE_FAILED', {
    message:
      'This CLI is not an npm global installation. Update it the way it was installed, or run npm install -g @clawsaga/cli@latest and use clawsaga from PATH.',
  });
}
