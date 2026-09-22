import { chmod, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import lockfile from 'proper-lockfile';
import { afterEach, expect, it, vi } from 'vitest';
import {
  CredentialStore,
  credentialPath,
  isPendingAuthorization,
} from './credentials.js';
import { GameClient, serverOrigin } from './client.js';
import { CliError } from './errors.js';
import { agentSchemaVersion } from './protocol.js';

vi.mock('node:fs/promises', async (importOriginal) => {
  const fs = await importOriginal<typeof import('node:fs/promises')>();
  return { ...fs, chmod: vi.fn(fs.chmod) };
});

vi.mock('node:timers/promises', () => ({
  setTimeout: (delay: number) =>
    new Promise((resolve) => setTimeout(resolve, delay)),
}));

const directories: string[] = [];
const origin = 'https://clawsaga.example';
afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
});
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'clawsaga-cli-'));
  directories.push(directory);
  const path = join(directory, 'private', 'credentials.json');
  const store = new CredentialStore(path);
  await store.update((entries) => {
    entries[origin] = {
      access_token: 'old-access',
      refresh_token: 'old-refresh',
      scope: 'game:read game:play offline_access',
      expires_at: 0,
    };
  });
  return { store, path };
}

it('chooses the home directory and rejects unsafe servers', () => {
  expect(credentialPath()).toBe(
    join(homedir(), '.clawsaga', 'credentials.json'),
  );
  for (const value of [
    'http://example.com',
    'https://user:secret@example.com',
    'https://example.com/path',
    'https://example.com/?token=secret',
  ])
    expect(() => serverOrigin(value)).toThrow('INVALID_SERVER');
  expect(serverOrigin('http://localhost:3000')).toBe('http://localhost:3000');
});

it('keeps storage and locks inside the home directory and excludes them from Git', async () => {
  const home = await mkdtemp(join(tmpdir(), 'clawsaga-home-'));
  directories.push(home);
  const path = credentialPath(home);
  const store = new CredentialStore(path);
  await store.update(async (entries) => {
    expect(
      (await stat(join(home, '.clawsaga', 'credentials.lock'))).isDirectory(),
    ).toBe(true);
    entries[origin] = {
      access_token: 'access',
      refresh_token: 'refresh',
      expires_at: 0,
      scope: 'game:read',
    };
  });
  expect(await readFile(join(home, '.clawsaga', '.gitignore'), 'utf8')).toBe(
    '*\n',
  );
  expect(
    await new CredentialStore(path).update((entries) => {
      const entry = entries[origin];
      return entry && !isPendingAuthorization(entry)
        ? entry.access_token
        : undefined;
    }),
  ).toBe('access');
  const other = new CredentialStore(credentialPath(join(home, 'other')));
  const request = vi.fn<typeof fetch>();
  await expect(
    new GameClient(origin, other, request).accessToken(),
  ).rejects.toThrow('AUTH_REQUIRED');
  expect(request).not.toHaveBeenCalled();
});

it('keeps credentials private and serializes concurrent refreshes without stale writes', async () => {
  const { store, path } = await fixture();
  const request = vi.fn<typeof fetch>().mockResolvedValue(
    Response.json({
      access_token: 'new-access',
      refresh_token: 'new-refresh',
      expires_in: 3600,
      scope: 'game:read game:play offline_access',
    }),
  );
  const first = new GameClient(origin, store, request);
  const second = new GameClient(origin, new CredentialStore(path), request);
  expect(
    await Promise.all([first.accessToken(), second.accessToken()]),
  ).toEqual(['new-access', 'new-access']);
  expect(request).toHaveBeenCalledTimes(1);
  if (process.platform !== 'win32') {
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect((await stat(join(path, '..'))).mode & 0o777).toBe(0o700);
  }
  expect(JSON.parse(await readFile(path, 'utf8'))).toMatchObject({
    [origin]: { refresh_token: 'new-refresh' },
  });
});

it('serves a valid token while another process holds the lock', async () => {
  const { store, path } = await fixture();
  await store.update((entries) => {
    const current = entries[origin];
    if (current) current.expires_at = Date.now() + 600_000;
  });
  const directory = join(path, '..');
  const release = await lockfile.lock(directory, {
    realpath: false,
    lockfilePath: join(directory, 'credentials.lock'),
  });
  const request = vi.fn<typeof fetch>();
  try {
    expect(
      await new GameClient(
        origin,
        new CredentialStore(path),
        request,
      ).accessToken(),
    ).toBe('old-access');
  } finally {
    await release();
  }
  expect(request).not.toHaveBeenCalled();
});

it('saves, updates and reads credentials even when permission changes fail', async () => {
  await vi.mocked(chmod).withImplementation(
    () =>
      Promise.reject(
        Object.assign(new Error('Permission changes unavailable'), {
          code: 'EPERM',
        }),
      ),
    async () => {
      const { store, path } = await fixture();
      await store.update((entries) => {
        const entry = entries[origin]!;
        if (!isPendingAuthorization(entry))
          entry.access_token = 'updated-access';
      });
      expect(
        await store.update((entries) => {
          const entry = entries[origin];
          return entry && !isPendingAuthorization(entry)
            ? entry.access_token
            : undefined;
        }),
      ).toBe('updated-access');
      expect(JSON.parse(await readFile(path, 'utf8'))).toMatchObject({
        [origin]: { access_token: 'updated-access' },
      });
    },
  );
});

it('waits for a slow concurrent refresh and leaves unchanged credentials untouched', async () => {
  const { store, path } = await fixture();
  const request = vi.fn<typeof fetch>().mockImplementation(async () => {
    await new Promise((resolve) => setTimeout(resolve, 6000));
    return Response.json({
      access_token: 'new-access',
      refresh_token: 'new-refresh',
      expires_in: 3600,
      scope: 'game:read game:play offline_access',
    });
  });
  const first = new GameClient(origin, store, request);
  const second = new GameClient(origin, new CredentialStore(path), request);
  expect(
    await Promise.all([first.accessToken(), second.accessToken()]),
  ).toEqual(['new-access', 'new-access']);
  expect(request).toHaveBeenCalledTimes(1);
  const before = await stat(path);
  await first.accessToken();
  const after = await stat(path);
  expect(after.ino).toBe(before.ino);
  expect(after.mtimeMs).toBe(before.mtimeMs);
}, 10_000);

it('does not replay a game mutation after a 401 or network failure', async () => {
  const { store } = await fixture();
  await store.update((entries) => {
    entries[origin]!.expires_at = Date.now() + 3600_000;
  });
  for (const response of [
    new Response(null, { status: 401 }),
    new Error('fixture network'),
  ]) {
    const request = vi.fn<typeof fetch>();
    if (response instanceof Error) request.mockRejectedValue(response);
    else request.mockResolvedValue(response);
    const client = new GameClient(origin, store, request);
    await expect(client.invoke('character/travel', {})).rejects.toThrow(
      response instanceof Error ? 'NETWORK_ERROR' : 'AUTH_REQUIRED',
    );
    expect(request).toHaveBeenCalledTimes(1);
  }
});

it('reports 5xx and unreadable responses without exposing response contents', async () => {
  const { store } = await fixture();
  await store.update((entries) => {
    entries[origin]!.expires_at = Date.now() + 3600_000;
  });
  const cases = [
    {
      response: new Response('private upstream details', { status: 502 }),
      code: 'SERVICE_UNAVAILABLE',
    },
    {
      response: Response.json({
        ok: true,
        schema_version: agentSchemaVersion,
        server_time: '2026-09-11T00:00:00.000Z',
        next_poll_after_seconds: 'private upstream details',
        data: {},
      }),
      code: 'INVALID_RESPONSE',
      message: "The server response did not match this CLI's expected format.",
    },
    {
      response: new Response('private upstream details', { status: 200 }),
      code: 'INVALID_RESPONSE',
      message: 'The server returned a response that was not valid JSON.',
    },
  ];
  for (const { response, code, message } of cases) {
    const request = vi.fn<typeof fetch>().mockResolvedValue(response);
    const client = new GameClient(origin, store, request);
    const error = await client
      .invoke('character/activity', {})
      .catch((error: unknown) => error);
    expect(error).toMatchObject({ code });
    if (message) expect(error).toMatchObject({ detail: { message } });
    expect(JSON.stringify(error)).not.toContain('private upstream details');
    expect(JSON.stringify(error)).not.toContain('old-access');
    expect(request).toHaveBeenCalledTimes(1);
  }
});

it('reports UPDATE_REQUIRED only when the server schema is newer', async () => {
  const { store } = await fixture();
  await store.update((entries) => {
    entries[origin]!.expires_at = Date.now() + 3600_000;
  });
  const [major = 0, minor = 0] = agentSchemaVersion.split('.').map(Number);
  for (const schema_version of [`${major + 1}.0`, `${major}.${minor + 1}`]) {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        ok: true,
        schema_version,
        server_time: '2026-09-11T00:00:00.000Z',
        data: {},
      }),
    );
    const client = new GameClient(origin, store, request);
    const error = await client
      .invoke('character/activity', {})
      .catch((error: unknown) => error);
    if (!(error instanceof CliError)) throw new Error('Expected a CliError');
    // The caller decides whether the operation had an outcome; the transport
    // keeps the response diagnostics and adds no outcome of its own.
    expect(error.code).toBe('UPDATE_REQUIRED');
    expect(error.detail).toMatchObject({
      operation: 'character/activity',
      http_status: 200,
    });
    expect(error.detail).not.toHaveProperty('outcome');
  }
});

it('marks a failure before the start as not sent, not as an unknown outcome', async () => {
  const { store } = await fixture();
  const requests = [
    // The token refresh answered a body this CLI cannot read.
    () =>
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          new Response('private upstream details', { status: 200 }),
        ),
    // The token refresh never reached the server.
    () =>
      vi.fn<typeof fetch>().mockRejectedValue(new TypeError('socket hang up')),
  ];
  for (const buildRequest of requests) {
    const request = buildRequest();
    const client = new GameClient(origin, store, request);
    const error = await client
      .invoke('character/travel', { to: 'mossway' })
      .catch((error: unknown) => error);
    if (!(error instanceof CliError)) throw new Error('Expected a CliError');
    expect(error.detail.outcome).toBe('not_sent');
    // Only the token refresh was attempted; the game start was never sent.
    expect(request).toHaveBeenCalledTimes(1);
    expect(String(request.mock.calls[0]?.[0])).toBe(
      `${origin}/api/auth/oauth2/token`,
    );
  }
});

it('shows the server message for 401 and 429 responses', async () => {
  const { store } = await fixture();
  await store.update((entries) => {
    entries[origin]!.expires_at = Date.now() + 3600_000;
  });
  const request = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      Response.json(
        { ok: false, error: { message: 'Authentication failed.' } },
        { status: 401 },
      ),
    )
    .mockResolvedValueOnce(
      Response.json(
        { ok: false, error: { message: 'Too many requests.' } },
        { status: 429, headers: { 'Retry-After': '3' } },
      ),
    );
  const client = new GameClient(origin, store, request);
  await expect(client.invoke('character/activity', {})).rejects.toMatchObject({
    code: 'AUTH_REQUIRED',
    detail: {
      message: 'Authentication failed. Run auth login and try again.',
    },
  });
  await expect(client.invoke('character/activity', {})).rejects.toMatchObject({
    code: 'RATE_LIMITED',
    detail: { message: 'Too many requests.', retry_after: '3' },
  });
});

it('returns device approval immediately and exchanges the pending code on the next command', async () => {
  const { store } = await fixture();
  const request = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      Response.json({
        device_code: 'private-device',
        user_code: 'USER-CODE',
        verification_uri: `${origin}/oauth/device`,
        verification_uri_complete: `${origin}/oauth/device?user_code=USER-CODE`,
        expires_in: 600,
        interval: 5,
      }),
    )
    .mockResolvedValueOnce(
      Response.json({
        access_token: 'new-access',
        refresh_token: 'new-refresh',
        expires_in: 3600,
        scope: 'game:read game:play offline_access',
      }),
    );
  const client = new GameClient(origin, store, request);
  const result = await client.login();
  expect(result).toEqual({
    ok: true,
    authenticated: false,
    verification_uri: `${origin}/oauth/device?user_code=USER-CODE`,
    user_code: 'USER-CODE',
  });
  expect(request).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(result)).not.toContain('private-device');
  expect(await client.accessToken()).toBe('new-access');
  expect(request).toHaveBeenCalledTimes(2);
});
