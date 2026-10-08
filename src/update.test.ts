import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CliError } from './errors.js';
import { recoverUpdate, updateCli } from './update.js';

const mocks = vi.hoisted(() => ({
  exec: vi.fn(),
  npmGlobalExecutable: vi.fn(),
  sleep: vi.fn(),
}));
vi.mock('node:child_process', () => ({
  execFile: Object.assign(() => undefined, {
    [Symbol.for('nodejs.util.promisify.custom')]: mocks.exec,
  }),
}));
vi.mock('./installation.js', () => ({
  npmGlobalExecutable: mocks.npmGlobalExecutable,
}));
vi.mock('node:timers/promises', () => ({ setTimeout: mocks.sleep }));

const updateRequired = () =>
  Promise.reject(
    Object.assign(new Error('Command failed'), {
      stdout: JSON.stringify({ ok: false, error: { update_required: true } }),
    }),
  );

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  mocks.npmGlobalExecutable.mockResolvedValue('/new/cli.mjs');
  mocks.sleep.mockImplementation((ms: number) => {
    vi.setSystemTime(Date.now() + ms);
    return Promise.resolve();
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});

it('waits for publication and compatibility without replaying the original operation', async () => {
  let installs = 0;
  mocks.exec.mockImplementation((command: string, args: string[]) => {
    if (command === 'npm') {
      installs++;
      return Promise.resolve({ stdout: '' });
    }
    // npm still serves the old version on the first install, and the server
    // has moved past the second one.
    if (args.includes('--version'))
      return Promise.resolve({
        stdout: JSON.stringify({
          ok: true,
          version: installs === 1 ? '0.1.20' : `9.0.${installs}`,
        }),
      });
    expect(args).toEqual([
      '/new/cli.mjs',
      'characters',
      '--server',
      'https://clawsaga.net',
    ]);
    if (installs < 3) return updateRequired();
    return Promise.resolve({ stdout: '{"ok":true}' });
  });
  const result = await recoverUpdate(
    new CliError('UPDATE_REQUIRED', {
      outcome: 'unknown',
      request_id: 'keep-me',
      update_required: true,
      server: 'https://clawsaga.net',
    }),
  );
  expect(result).toMatchObject({
    detail: {
      outcome: 'unknown',
      request_id: 'keep-me',
      update_required: false,
      updated_version: '9.0.3',
    },
  });
  expect(mocks.sleep.mock.calls).toEqual([[60_000], [60_000]]);
  expect(mocks.exec).toHaveBeenLastCalledWith(
    process.execPath,
    expect.anything(),
    expect.objectContaining({
      env: expect.objectContaining({ CLAWSAGA_AUTO_UPDATE: '0' }),
    }),
  );
});

it('stops after five minutes when no new version is available and preserves the unknown outcome', async () => {
  mocks.exec.mockImplementation((command: string, args: string[]) =>
    command === 'npm' || args.includes('--version')
      ? Promise.resolve({ stdout: '{"ok":true,"version":"0.1.20"}' })
      : updateRequired(),
  );
  const result = await recoverUpdate(
    new CliError('UPDATE_REQUIRED', {
      outcome: 'unknown',
      activity_id: 'keep-me',
      server: 'https://clawsaga.net',
    }),
  );
  expect(result).toMatchObject({
    code: 'UPDATE_FAILED',
    detail: { outcome: 'unknown', activity_id: 'keep-me' },
  });
  expect(Date.now()).toBe(300_000);
  expect(mocks.sleep).toHaveBeenCalledTimes(5);
});

it('does not update unreadable responses or from the verification read', async () => {
  const invalid = new CliError('INVALID_RESPONSE', { outcome: 'unknown' });
  expect(await recoverUpdate(invalid)).toBe(invalid);
  vi.stubEnv('CLAWSAGA_AUTO_UPDATE', '0');
  const incompatible = new CliError('UPDATE_REQUIRED', {
    server: 'https://clawsaga.net',
  });
  expect(await recoverUpdate(incompatible)).toBe(incompatible);
  expect(mocks.npmGlobalExecutable).not.toHaveBeenCalled();
});

it('manual update finishes after one install even when already current', async () => {
  mocks.exec.mockResolvedValue({ stdout: '{"ok":true,"version":"0.1.20"}' });
  expect(await updateCli()).toBe('0.1.20');
  expect(mocks.exec).toHaveBeenCalledTimes(2);
  expect(mocks.sleep).not.toHaveBeenCalled();
});

it.each(['installer', 'version check'])(
  'stops immediately when the %s fails during automatic updating',
  async (stage) => {
    mocks.exec.mockImplementation((command: string) => {
      if (stage === 'version check' && command === 'npm')
        return Promise.resolve({ stdout: '' });
      return Promise.reject(new Error('Permission denied'));
    });
    const result = await recoverUpdate(
      new CliError('UPDATE_REQUIRED', {
        outcome: 'unknown',
        request_id: 'keep-me',
        server: 'https://clawsaga.net',
      }),
    );
    expect(result).toMatchObject({
      code: 'UPDATE_FAILED',
      detail: {
        outcome: 'unknown',
        request_id: 'keep-me',
      },
    });
    expect(mocks.exec).toHaveBeenCalledTimes(stage === 'installer' ? 1 : 2);
    expect(mocks.sleep).not.toHaveBeenCalled();
  },
);

it('stops instead of retrying updates for an unrelated verification failure', async () => {
  mocks.exec.mockImplementation((command: string, args: string[]) => {
    if (command === 'npm') return Promise.resolve({ stdout: '' });
    if (args.includes('--version'))
      return Promise.resolve({ stdout: '{"ok":true,"version":"9.0.0"}' });
    return Promise.reject(
      Object.assign(new Error('Command failed'), {
        stdout: '{"ok":false,"error":{"message":"Authentication required"}}',
      }),
    );
  });
  await expect(updateCli('https://clawsaga.net')).rejects.toMatchObject({
    code: 'UPDATE_FAILED',
    detail: { verification_error: { message: 'Authentication required' } },
  });
  expect(mocks.sleep).not.toHaveBeenCalled();
});
