import { execFile } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { promisify } from 'node:util';
import { homedir } from 'node:os';
import { z } from 'zod';
import { CliError } from './errors.js';
import { npmGlobalExecutable } from './installation.js';

const exec = promisify(execFile);
const resultSchema = z.object({
  ok: z.boolean(),
  version: z.string().optional(),
  error: z
    .object({ update_required: z.boolean().optional() })
    .passthrough()
    .optional(),
});

async function runNpm(args: string[], timeout: number) {
  return exec('npm', args, {
    timeout,
    // A project's npm configuration must not redirect the global installation.
    cwd: homedir(),
    // npm is a .cmd file on Windows. The arguments are fixed, never server or player input.
    shell: process.platform === 'win32',
  });
}

async function readCli(executable: string, args: string[], timeout: number) {
  const output = await exec(process.execPath, [executable, ...args], {
    timeout,
    env: { ...process.env, CLAWSAGA_AUTO_UPDATE: '0' },
  }).catch((error: unknown) => {
    // A failed game command still emits a structured result on stdout.
    if (
      error &&
      typeof error === 'object' &&
      'stdout' in error &&
      typeof error.stdout === 'string' &&
      error.stdout.trim()
    )
      return { stdout: error.stdout };
    throw error;
  });
  return resultSchema.parse(JSON.parse(output.stdout));
}

async function installLatest(executable: string, remaining: () => number) {
  await runNpm(
    [
      'install',
      '-g',
      '@clawsaga/cli@latest',
      '--prefer-online',
      '--no-audit',
      '--no-fund',
    ],
    remaining(),
  );
  const installed = await readCli(executable, ['--version'], remaining());
  if (!installed.ok || !installed.version) throw new CliError('UPDATE_FAILED');
  return installed.version;
}

/**
 * Installs the latest CLI with npm and returns its version. A manual update
 * installs once. With `server`, it repeats every 60 seconds for up to five
 * minutes until a read on that server no longer requires an update, because
 * npm can publish the compatible version after the server is deployed.
 */
export async function updateCli(server?: string): Promise<string> {
  const deadline = Date.now() + 300_000;
  const remaining = () => Math.max(1, deadline - Date.now());
  try {
    const executable = await npmGlobalExecutable((args) =>
      runNpm(args, remaining()),
    );
    do {
      const installedVersion = await installLatest(executable, remaining);
      if (!server) return installedVersion;
      const check = await readCli(
        executable,
        ['characters', '--server', server],
        remaining(),
      );
      if (check.ok) return installedVersion;
      if (!check.error?.update_required)
        throw new CliError('UPDATE_FAILED', {
          message:
            'The CLI was updated, but play could not be verified. Stop and resolve the verification error before continuing.',
          verification_error: check.error,
        });
      await sleep(Math.min(60_000, remaining()));
    } while (Date.now() < deadline);
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError('UPDATE_FAILED');
  }
  throw new CliError('UPDATE_FAILED');
}

export async function recoverUpdate(
  error: unknown,
  notify?: (message: string) => void,
): Promise<unknown> {
  if (
    !(error instanceof CliError) ||
    error.code !== 'UPDATE_REQUIRED' ||
    // Set for the verification read, which must not start an update of its own.
    process.env.CLAWSAGA_AUTO_UPDATE === '0'
  )
    return error;
  const { server } = error.detail;
  if (typeof server !== 'string') return error;
  notify?.(
    'Updating the CLI. This can take up to five minutes. Wait for this command to finish.',
  );
  try {
    const version = await updateCli(server);
    return new CliError('UPDATE_REQUIRED', {
      ...error.detail,
      update_required: false,
      updated_version: version,
      message:
        'The CLI was updated. The original command was not retried. Check any uncertain action’s outcome before another change.',
    });
  } catch (updateError) {
    // updateCli rejects only with CliError.
    if (!(updateError instanceof CliError)) throw updateError;
    return new CliError(updateError.code, {
      ...error.detail,
      ...updateError.detail,
    });
  }
}
