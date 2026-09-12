import {
  chmod,
  mkdir,
  open,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import lockfile from 'proper-lockfile';
import { z } from 'zod';
import { CliError } from './errors.js';

export const credentialSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  expires_at: z.number(),
  scope: z.string(),
});
export type Credential = z.infer<typeof credentialSchema>;
const storeSchema = z.record(z.string(), credentialSchema);

export function credentialPath(directory = process.cwd()) {
  return join(directory, '.clawsaga', 'credentials.json');
}

export class CredentialStore {
  constructor(private readonly path = credentialPath()) {}

  async update<T>(
    action: (entries: Record<string, Credential>) => T | Promise<T>,
  ): Promise<T> {
    const directory = dirname(this.path);
    let release: (() => Promise<void>) | undefined;
    try {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      // Permission bits are best effort; some filesystems do not support them.
      await chmod(directory, 0o700).catch(() => undefined);
      await writeFile(join(directory, '.gitignore'), '*\n');
      release = await lockfile.lock(directory, {
        realpath: false,
        lockfilePath: join(directory, 'credentials.lock'),
        // Allow the other process's 30-second token request to finish and save.
        retries: { retries: 70, factor: 1, minTimeout: 500, maxTimeout: 500 },
        stale: 60_000,
      });
      let entries: Record<string, Credential> = {};
      try {
        await chmod(this.path, 0o600).catch(() => undefined);
        entries = storeSchema.parse(
          JSON.parse(await readFile(this.path, 'utf8')),
        );
      } catch (error) {
        if (!(
          error instanceof Error &&
          'code' in error &&
          error.code === 'ENOENT'
        ))
          throw error;
      }
      const original = JSON.stringify(entries);
      const result = await action(entries);
      const updated = JSON.stringify(entries);
      if (updated === original) return result;
      const temporary = join(directory, `.credentials-${randomUUID()}.tmp`);
      try {
        const file = await open(temporary, 'wx', 0o600);
        try {
          await file.writeFile(updated);
          await file.sync();
        } finally {
          await file.close();
        }
        await rename(temporary, this.path);
      } finally {
        await rm(temporary, { force: true });
      }
      return result;
    } catch (error) {
      if (error instanceof CliError) throw error;
      throw new CliError('CREDENTIAL_STORAGE_FAILED');
    } finally {
      await release?.();
    }
  }
}
