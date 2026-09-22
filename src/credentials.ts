import {
  chmod,
  mkdir,
  open,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { homedir } from 'node:os';
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
export const pendingAuthorizationSchema = z.object({
  device_code: z.string(),
  expires_at: z.number(),
});
export type PendingAuthorization = z.infer<typeof pendingAuthorizationSchema>;
export type CredentialEntry = Credential | PendingAuthorization;
const storeSchema = z.record(
  z.string(),
  z.union([credentialSchema, pendingAuthorizationSchema]),
);

export function isPendingAuthorization(
  entry: CredentialEntry,
): entry is PendingAuthorization {
  return 'device_code' in entry;
}

export function credentialPath(home = homedir()) {
  return join(home, '.clawsaga', 'credentials.json');
}

export class CredentialStore {
  constructor(private readonly path = credentialPath()) {}

  /**
   * Reads the stored credentials without taking the lock. A writer replaces the
   * file by rename, so a reader sees either the previous or the new content.
   */
  async read(): Promise<Record<string, CredentialEntry>> {
    try {
      return await this.parse();
    } catch {
      throw new CliError('CREDENTIAL_STORAGE_FAILED');
    }
  }

  private async parse(): Promise<Record<string, CredentialEntry>> {
    try {
      return storeSchema.parse(JSON.parse(await readFile(this.path, 'utf8')));
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
        return {};
      throw error;
    }
  }

  async update<T>(
    action: (entries: Record<string, CredentialEntry>) => T | Promise<T>,
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
        // A SIGKILLed holder's lock only becomes stealable once it goes stale,
        // so the waiting side must outlast `stale` rather than expire with it.
        retries: { retries: 150, factor: 1, minTimeout: 500, maxTimeout: 500 },
        // Longer than a held lock ever legitimately lasts: a 30-second token
        // request and the save that follows it.
        stale: 60_000,
      });
      await chmod(this.path, 0o600).catch(() => undefined);
      const entries = await this.parse();
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
