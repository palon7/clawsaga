import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, it } from 'vitest';

// 実際の配布CLIを子プロセスで動かし、ローカルHTTPハーネスだけで受付・待機の
// 中断と、別プロセスからの同じ活動の回収を確かめる。参照するbundleは
// `pnpm build`の生成物で、`pnpm check`はtestより先にbuildする。
const cli = fileURLToPath(
  new URL('../skills/clawsaga/bin/clawsaga.mjs', import.meta.url),
);
const characterId = 'Traveler0000';
const travelId = '00000000-0000-4000-8000-000000000001';
const serverTime = '2026-09-19T00:00:00.000Z';

const cleanups: (() => void | Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

const runningTravel = {
  kind: 'travel',
  activity_id: travelId,
  from: { id: 'dolgan', name: 'Dolgan', kind: 'town' },
  to: { id: 'openpit', name: 'Open pit', kind: 'field' },
  started_at: serverTime,
  arrives_at: '2026-09-19T00:00:15.000Z',
  duration_seconds: 15,
  status: 'RUNNING',
};

function accepted(pollSeconds: number) {
  return JSON.stringify({
    ok: true,
    schema_version: '3.2',
    server_time: serverTime,
    next_poll_after_seconds: pollSeconds,
    data: { activity: runningTravel },
  });
}

const currentActivity = JSON.stringify({
  ok: true,
  schema_version: '3.2',
  server_time: serverTime,
  data: { activity: runningTravel },
});

type Recorded = { path: string; body: Record<string, unknown> };

function harness(
  handle: (
    request: Recorded,
    response: ServerResponse,
    requests: Recorded[],
  ) => void,
) {
  const requests: Recorded[] = [];
  const server: Server = createServer((incoming, response) => {
    let raw = '';
    incoming.setEncoding('utf8');
    incoming.on('data', (chunk) => (raw += chunk));
    incoming.on('end', () => {
      const path = new URL(incoming.url ?? '/', 'http://localhost').pathname;
      const request = {
        path,
        body: (raw ? JSON.parse(raw) : {}) as Record<string, unknown>,
      };
      requests.push(request);
      handle(request, response, requests);
    });
  });
  return new Promise<{ origin: string; requests: Recorded[] }>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      cleanups.push(
        () =>
          new Promise<void>((done) => {
            server.closeAllConnections();
            server.close(() => done());
          }),
      );
      resolve({ origin: `http://127.0.0.1:${port}`, requests });
    });
  });
}

function workspace(origin: string) {
  const directory = mkdtempSync(join(tmpdir(), 'clawsaga-cli-'));
  cleanups.push(() => rmSync(directory, { recursive: true, force: true }));
  mkdirSync(join(directory, '.clawsaga'));
  writeFileSync(
    join(directory, '.clawsaga', 'credentials.json'),
    JSON.stringify({
      [origin]: {
        access_token: 'test-token',
        refresh_token: 'test-refresh',
        expires_at: Date.now() + 3_600_000,
        scope: 'game:read game:play offline_access',
      },
    }),
  );
  return directory;
}

function runCli(origin: string, args: string[]) {
  const directory = workspace(origin);
  const env = { ...process.env };
  delete env.CLAWSAGA_SERVER;
  const child: ChildProcess = spawn(
    process.execPath,
    [cli, ...args, '-s', origin],
    { cwd: directory, env },
  );
  let stdout = '';
  let stderr = '';
  child.stdout?.setEncoding('utf8');
  child.stdout?.on('data', (chunk: string) => (stdout += chunk));
  child.stderr?.setEncoding('utf8');
  child.stderr?.on('data', (chunk: string) => (stderr += chunk));
  cleanups.push(() => {
    child.kill('SIGKILL');
  });
  return {
    child,
    stdout: () => stdout,
    stderr: () => stderr,
    // 'close' fires after the stdio pipes drain; 'exit' does not.
    exited: new Promise<{ code: number | null; signal: string | null }>(
      (resolve) =>
        child.on('close', (code, signal) => resolve({ code, signal })),
    ),
  };
}

async function waitFor(check: () => boolean, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('timed out waiting for output');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

it('recovers an accepted travel whose response was lost, without a second start', async () => {
  const { origin, requests } = await harness((request, response) => {
    if (request.path === '/api/v1/character/travel') {
      // サーバーは受付済みだが応答が届かない。
      response.destroy();
      return;
    }
    response.end(currentActivity);
  });

  const first = runCli(origin, [
    'travel',
    '-c',
    characterId,
    '--to',
    'openpit',
  ]);
  const failed = await first.exited;
  expect(failed.code).not.toBe(0);
  expect(JSON.parse(first.stdout())).toMatchObject({
    ok: false,
    error: { hint: expect.stringContaining(`activity -c ${characterId}`) },
  });

  const recovery = runCli(origin, ['activity', '-c', characterId]);
  expect(await recovery.exited).toEqual({ code: 0, signal: null });
  expect(JSON.parse(recovery.stdout())).toMatchObject({
    ok: true,
    data: { activity: { activity_id: travelId, status: 'RUNNING' } },
  });

  // 受付応答を失っても、開始要求は1回だけ。
  expect(
    requests.filter((entry) => entry.path === '/api/v1/character/travel'),
  ).toHaveLength(1);
  // 活動IDが不明なときは -a を付けずに現在の活動を照会する。
  expect(
    requests.filter((entry) => entry.path === '/api/v1/character/activity'),
  ).toEqual([
    { path: '/api/v1/character/activity', body: { character_id: characterId } },
  ]);
}, 20_000);

it('recovers a travel killed during the wait from its acceptance diagnostic', async () => {
  const { origin, requests } = await harness((request, response) => {
    if (request.path === '/api/v1/character/travel') {
      response.end(accepted(30));
      return;
    }
    response.end(currentActivity);
  });

  const waiting = runCli(origin, [
    'travel',
    '-c',
    characterId,
    '--to',
    'openpit',
  ]);
  await waitFor(() => waiting.stderr().includes('activity_accepted'));
  waiting.child.kill('SIGKILL');
  await waiting.exited;
  expect(waiting.stdout()).toBe('');

  const line = waiting
    .stderr()
    .split('\n')
    .find((entry) => entry.includes('activity_accepted'));
  const diagnostic = JSON.parse(line ?? '{}') as Record<string, unknown>;
  expect(diagnostic).toMatchObject({
    event: 'activity_accepted',
    activity_id: travelId,
    kind: 'travel',
    started_at: serverTime,
    arrives_at: '2026-09-19T00:00:15.000Z',
    next_poll_after_seconds: 30,
  });

  const recovery = runCli(origin, [
    'activity',
    '-c',
    characterId,
    '-a',
    String(diagnostic.activity_id),
  ]);
  expect(await recovery.exited).toEqual({ code: 0, signal: null });
  expect(JSON.parse(recovery.stdout())).toMatchObject({
    ok: true,
    data: { activity: { activity_id: travelId, status: 'RUNNING' } },
  });

  expect(
    requests.filter((entry) => entry.path === '/api/v1/character/travel'),
  ).toHaveLength(1);
  // 回収した照会は診断どおりの活動IDを送る。
  expect(
    requests.filter((entry) => entry.path === '/api/v1/character/activity'),
  ).toEqual([
    {
      path: '/api/v1/character/activity',
      body: { character_id: characterId, activity_id: travelId },
    },
  ]);
}, 20_000);
