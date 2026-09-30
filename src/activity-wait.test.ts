import { afterEach, expect, it, vi } from 'vitest';
import { agentSchemaVersion, type AgentGameResponse } from './protocol.js';
import { initial } from './test-responses.js';
import { GameClient } from './client.js';
import { execute } from './commands.js';
import { waitForActivity } from './activity-wait.js';
import { CliError } from './errors.js';

vi.mock('node:timers/promises', () => ({
  setTimeout: (delay: number) =>
    new Promise((resolve) => setTimeout(resolve, delay)),
}));
// 更新確認は公開リポジトリへ取りに行くため、単体試験では必ず失敗させて無効化する。
vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')));
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

it('waits the server interval and queries only the accepted activity until completion', async () => {
  vi.useFakeTimers();
  if (initial.data.activity?.kind !== 'travel')
    throw new Error('Expected travel fixture');
  const completed: AgentGameResponse = {
    ...initial,
    data: {
      activity: null,
      last_result: {
        kind: 'travel',
        activity_id: initial.data.activity.activity_id,
        status: 'ENDED',
        end_reason: 'COMPLETED',
        ended_at: '2026-09-09T00:00:15.000Z',
        to: initial.data.activity.to,
      },
    },
  };
  const invoke = vi
    .spyOn(GameClient.prototype, 'invoke')
    .mockResolvedValueOnce(initial)
    .mockResolvedValueOnce({ ...initial, next_poll_after_seconds: 10 })
    .mockResolvedValueOnce(completed);
  const notify = vi.fn();
  const pending = execute(
    ['travel', '-c', 'Traveler0000', '--to', 'openpit', '-l', 'en'],
    notify,
  );
  await vi.advanceTimersByTimeAsync(4999);
  expect(invoke).toHaveBeenCalledTimes(1);
  expect(notify).toHaveBeenCalledTimes(1);
  expect(notify).toHaveBeenCalledWith({
    event: 'activity_accepted',
    activity_id: initial.data.activity.activity_id,
    kind: 'travel',
    started_at: '2026-09-09T00:00:00.000Z',
    arrives_at: '2026-09-09T00:00:15.000Z',
    next_poll_after_seconds: 5,
  });
  await vi.advanceTimersByTimeAsync(1);
  expect(invoke).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(10000);
  expect(await pending).toEqual(completed);
  expect(invoke).toHaveBeenCalledTimes(3);
  expect(notify).toHaveBeenCalledTimes(1);
  expect(invoke).toHaveBeenLastCalledWith('character/activity', {
    character_id: 'Traveler0000',
    activity_id: initial.data.activity.activity_id,
    locale: 'en',
  });
});

it('returns one acceptance for --no-wait travel, fight and rest without polling or a wait input', async () => {
  const invoke = vi
    .spyOn(GameClient.prototype, 'invoke')
    .mockResolvedValue(initial);
  const notify = vi.fn();
  const travel = await execute(
    ['travel', '-c', 'Traveler0000', '--to', 'openpit', '--no-wait'],
    notify,
  );
  expect(travel).toMatchObject({ ok: true, data: initial.data });
  expect(invoke).toHaveBeenCalledTimes(1);
  expect(invoke).toHaveBeenLastCalledWith('character/travel', {
    character_id: 'Traveler0000',
    to: 'openpit',
  });
  await execute(
    ['fight', '-c', 'Traveler0000', '--enemy', 'wolf', '--no-wait'],
    notify,
  );
  expect(invoke).toHaveBeenLastCalledWith('character/combat/start', {
    character_id: 'Traveler0000',
    enemy_id: 'wolf',
  });
  await execute(['rest', '-c', 'Traveler0000', '--inn', '--no-wait'], notify);
  expect(invoke).toHaveBeenLastCalledWith('character/rest', {
    character_id: 'Traveler0000',
    inn: true,
  });
  // 開始1回ずつ。活動照会もstderr診断も出さない。
  expect(invoke).toHaveBeenCalledTimes(3);
  expect(notify).not.toHaveBeenCalled();
});

it('points an unknown accepted start at the current or latest activity', async () => {
  vi.spyOn(GameClient.prototype, 'invoke').mockRejectedValue(
    new CliError('NETWORK_ERROR', { outcome: 'unknown' }),
  );
  const error = await execute(
    ['travel', '-c', 'Traveler0000', '--to', 'openpit'],
    vi.fn(),
  ).catch((thrown: unknown) => thrown);
  if (!(error instanceof CliError)) throw new Error('Expected a CliError');
  const hint = String(error.detail.hint);
  expect(error.code).toBe('NETWORK_ERROR');
  expect(hint).toContain('may have produced output');
  expect(hint).toContain('activity -c Traveler0000');
  expect(hint).toContain('match its kind and time');
  expect(hint).toContain('ambiguous');
  // The activity ID is unknown, so the hint must not pin one with -a.
  expect(hint).not.toMatch(/-a /);
});

it('recovers a main activity whose start response could not be read', async () => {
  vi.spyOn(GameClient.prototype, 'accessToken').mockResolvedValue('test-token');
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        new Response('private upstream details', { status: 200 }),
      ),
    ),
  );
  const travel = await execute(
    ['travel', '-c', 'Traveler0000', '--to', 'openpit'],
    vi.fn(),
  ).catch((thrown: unknown) => thrown);
  if (!(travel instanceof CliError)) throw new Error('Expected a CliError');
  // 応答が読めなくてもサーバーは受付済みかもしれないため、結果不明として扱う。
  expect(travel.code).toBe('INVALID_RESPONSE');
  expect(travel.detail.outcome).toBe('unknown');
  const hint = String(travel.detail.hint);
  expect(hint).toContain('may have produced output');
  expect(hint).toContain('activity -c Traveler0000');
  // The activity ID is unknown, so the hint must not pin one with -a.
  expect(hint).not.toMatch(/-a /);

  // A read keeps its own diagnostics; only a main activity gets the step.
  const map = await execute(['map', '-c', 'Traveler0000'], vi.fn()).catch(
    (thrown: unknown) => thrown,
  );
  if (!(map instanceof CliError)) throw new Error('Expected a CliError');
  expect(map.code).toBe('INVALID_RESPONSE');
  expect(map.detail).not.toHaveProperty('outcome');
  expect(map.detail).not.toHaveProperty('hint');
});

it('recovers a main activity whose start returned 503', async () => {
  vi.spyOn(GameClient.prototype, 'accessToken').mockResolvedValue('test-token');
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(null, { status: 503 }))),
  );
  const error = await execute(
    ['travel', '-c', 'Traveler0000', '--to', 'openpit'],
    vi.fn(),
  ).catch((thrown: unknown) => thrown);
  if (!(error instanceof CliError)) throw new Error('Expected a CliError');
  expect(error).toMatchObject({
    code: 'SERVICE_UNAVAILABLE',
    detail: { outcome: 'unknown' },
  });
  expect(error.detail.hint).toContain('activity -c Traveler0000');
});

it('recovers a main activity whose response has a newer server schema', async () => {
  const [major = 0, minor = 0] = agentSchemaVersion.split('.').map(Number);
  vi.spyOn(GameClient.prototype, 'accessToken').mockResolvedValue('test-token');
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        Response.json({
          ok: true,
          schema_version: `${major}.${minor + 1}`,
          server_time: '2026-09-19T00:00:00.000Z',
          data: {},
        }),
      ),
    ),
  );
  const travel = await execute(
    ['travel', '-c', 'Traveler0000', '--to', 'openpit'],
    vi.fn(),
  ).catch((thrown: unknown) => thrown);
  if (!(travel instanceof CliError)) throw new Error('Expected a CliError');
  // 更新した後に開始し直すのではなく、受付済みかもしれない活動を先に照合する。
  expect(travel.code).toBe('UPDATE_REQUIRED');
  expect(travel.detail).toMatchObject({
    operation: 'character/travel',
    http_status: 200,
    outcome: 'unknown',
  });
  const hint = String(travel.detail.hint);
  expect(hint).toContain('may have produced output');
  expect(hint).toContain('activity -c Traveler0000');
  // The activity ID is unknown, so the hint must not pin one with -a.
  expect(hint).not.toMatch(/-a /);

  // A read keeps its own diagnostics; only a main activity gets the step.
  const map = await execute(['map', '-c', 'Traveler0000'], vi.fn()).catch(
    (thrown: unknown) => thrown,
  );
  if (!(map instanceof CliError)) throw new Error('Expected a CliError');
  expect(map.code).toBe('UPDATE_REQUIRED');
  expect(map.detail).not.toHaveProperty('outcome');
  expect(map.detail).not.toHaveProperty('hint');
});

it('does not offer activity recovery when the start was never sent', async () => {
  const request = vi.fn();
  vi.stubGlobal('fetch', request);
  vi.spyOn(GameClient.prototype, 'accessToken').mockRejectedValue(
    new CliError('INVALID_RESPONSE'),
  );
  const error = await execute(
    ['travel', '-c', 'Traveler0000', '--to', 'openpit'],
    vi.fn(),
  ).catch((thrown: unknown) => thrown);
  if (!(error instanceof CliError)) throw new Error('Expected a CliError');
  expect(error.code).toBe('INVALID_RESPONSE');
  // 送信前の失敗はゲームを変えていないため、結果不明の復旧手順を付けない。
  expect(error.detail.outcome).not.toBe('unknown');
  expect(error.detail).not.toHaveProperty('hint');
  expect(request).not.toHaveBeenCalled();
});

const useArgs = ['use', '-c', 'Traveler0000', '--item', 'healing_potion'];
const itemChanges = [
  useArgs,
  ['discard', '-c', 'Traveler0000', '--item', 'wolf_meat', '--quantity', '2'],
];
const lostItemResponses: [string, string, () => Promise<Response>][] = [
  [
    'NETWORK_ERROR',
    'a connection failure',
    () => Promise.reject(new TypeError('fetch failed')),
  ],
  [
    'NETWORK_ERROR',
    'a timeout',
    () => Promise.reject(new DOMException('timed out', 'TimeoutError')),
  ],
  [
    'SERVICE_UNAVAILABLE',
    'a 5xx',
    () => Promise.resolve(new Response(null, { status: 502 })),
  ],
  [
    'INVALID_RESPONSE',
    'invalid JSON',
    () => Promise.resolve(new Response('upstream', { status: 200 })),
  ],
  [
    'INVALID_RESPONSE',
    'an unexpected schema',
    () => Promise.resolve(Response.json({ ok: true })),
  ],
];

it.each(
  itemChanges.flatMap((args) =>
    lostItemResponses.map(
      ([code, label, respond]) =>
        [args[0], label, args, code, respond] as const,
    ),
  ),
)(
  'warns against resending %s after %s',
  async (_name, _label, args, code, respond) => {
    vi.spyOn(GameClient.prototype, 'accessToken').mockResolvedValue(
      'test-token',
    );
    const request = vi.fn(respond);
    vi.stubGlobal('fetch', request);
    const error = await execute(args, vi.fn()).catch(
      (thrown: unknown) => thrown,
    );
    if (!(error instanceof CliError)) throw new Error('Expected a CliError');
    // 使用・廃棄は要求IDを持たないため、自動で再送せず、受理済みの可能性を残す。
    expect(request).toHaveBeenCalledTimes(1);
    expect(error.code).toBe(code);
    expect(error.detail.outcome).toBe('unknown');
    const hint = String(error.detail.hint);
    expect(hint).toContain('do not resend');
    expect(hint).toContain('character -c Traveler0000 --include inventory');
    expect(hint).toContain('Unchanged state does not prove it failed');
    expect(hint).not.toContain('--request');
  },
);

it('does not mark an item change unknown when it was never sent', async () => {
  const request = vi.fn();
  vi.stubGlobal('fetch', request);
  vi.spyOn(GameClient.prototype, 'accessToken').mockRejectedValue(
    new CliError('AUTH_REQUIRED'),
  );
  const error = await execute(useArgs, vi.fn()).catch(
    (thrown: unknown) => thrown,
  );
  if (!(error instanceof CliError)) throw new Error('Expected a CliError');
  expect(error.detail.outcome).toBe('not_sent');
  expect(error.detail).not.toHaveProperty('hint');
  expect(request).not.toHaveBeenCalled();
});

it('returns a rejected or successful item change without recovery steps', async () => {
  const response = (ok: boolean): AgentGameResponse => ({
    ok,
    schema_version: agentSchemaVersion,
    server_time: '2026-09-20T00:00:00.000Z',
    data: {},
    ...(ok ? {} : { error: { message: 'That item has no effect now.' } }),
  });
  const invoke = vi
    .spyOn(GameClient.prototype, 'invoke')
    .mockResolvedValueOnce(response(false))
    .mockResolvedValueOnce(response(true));
  for (const ok of [false, true]) {
    const result = (await execute(useArgs, vi.fn())) as AgentGameResponse;
    expect(result.ok).toBe(ok);
    expect(result).not.toHaveProperty('hints');
  }
  // 正常応答の後に人物の再取得を追加しない。
  expect(invoke).toHaveBeenCalledTimes(2);
});

it('lists the --no-wait option and example in structured help', async () => {
  const help = (await execute(['travel', '--help'], vi.fn())) as unknown as {
    help: { options: { flags: string }[]; examples: string[] };
  };
  expect(help.help.options).toEqual(
    expect.arrayContaining([expect.objectContaining({ flags: '--no-wait' })]),
  );
  expect(help.help.examples).toContain(
    'clawsaga travel -c m7Qp2_aR9L-x --to openpit --no-wait',
  );
  // The wait choice is local; the game request schema never carries it.
  const schema = (await execute(['schema', 'travel'], vi.fn())) as unknown as {
    input_schema: { properties: Record<string, unknown> };
  };
  expect(schema.input_schema.properties).not.toHaveProperty('wait');
  expect(schema.input_schema.properties).not.toHaveProperty('no_wait');
});

it('stops on lost authorization and preserves the accepted ID without restarting travel', async () => {
  vi.useFakeTimers();
  const invoke = vi
    .spyOn(GameClient.prototype, 'invoke')
    .mockRejectedValue(new CliError('AUTH_REQUIRED'));
  const pending = waitForActivity(
    new GameClient('https://example.com'),
    { character: 'Traveler0000' },
    initial,
  );
  const assertion = expect(pending).rejects.toMatchObject({
    code: 'AUTH_REQUIRED',
    detail: { activity_id: initial.data.activity!.activity_id },
  });
  await vi.advanceTimersByTimeAsync(5000);
  await assertion;
  expect(invoke).toHaveBeenCalledTimes(1);
});

it('reports wait contract failures without resubmitting accepted activities', async () => {
  vi.useFakeTimers();
  const client = new GameClient('https://example.com');
  const invoke = vi.spyOn(client, 'invoke');
  await expect(
    waitForActivity(
      client,
      { character: 'Traveler0000' },
      {
        ...initial,
        next_poll_after_seconds: undefined,
      },
    ),
  ).rejects.toMatchObject({
    code: 'INVALID_RESPONSE',
    detail: {
      reason: 'missing_poll_interval',
      activity_id: initial.data.activity!.activity_id,
    },
  });
  expect(invoke).not.toHaveBeenCalled();

  invoke.mockResolvedValue({ ...initial, data: { activity: null } });
  const mismatched = expect(
    waitForActivity(client, { character: 'Traveler0000' }, initial),
  ).rejects.toMatchObject({
    code: 'INVALID_RESPONSE',
    detail: {
      reason: 'activity_id_mismatch',
      activity_id: initial.data.activity!.activity_id,
    },
  });
  await vi.advanceTimersByTimeAsync(5000);
  await mismatched;
  expect(invoke).toHaveBeenCalledTimes(1);

  invoke.mockClear().mockRejectedValue(
    new CliError('INVALID_RESPONSE', {
      reason: 'invalid_response',
      operation: 'character/activity',
      http_status: 200,
      fields: ['data.activity'],
    }),
  );
  const invalid = expect(
    waitForActivity(client, { character: 'Traveler0000' }, initial),
  ).rejects.toMatchObject({
    code: 'INVALID_RESPONSE',
    detail: {
      reason: 'invalid_response',
      operation: 'character/activity',
      http_status: 200,
      fields: ['data.activity'],
      activity_id: initial.data.activity!.activity_id,
    },
  });
  await vi.advanceTimersByTimeAsync(5000);
  await invalid;
  expect(invoke).toHaveBeenCalledTimes(1);
});

it('waits for an accepted fight and returns a cancellation without starting another battle', async () => {
  vi.useFakeTimers();
  const battle: AgentGameResponse = {
    ...initial,
    next_poll_after_seconds: 10,
    data: {
      activity: {
        kind: 'combat',
        activity_id: '00000000-0000-4000-8000-000000000002',
        enemy_id: 'wolf',
        enemy_name: 'Wolf',
        practice: true,
        started_at: initial.server_time,
        time_limit_at: '2026-09-09T00:08:00.000Z',
        next_update_at: '2026-09-09T00:00:10.000Z',
        duration_seconds: 480,
        status: 'RUNNING',
        hp: 120,
        max_hp: 120,
        mp: 100,
        enemy_hp: 120,
        enemy_max_hp: 120,
        retreat_ticks: 0,
        retreat_requested_tick: null,
      },
    },
  };
  const cancelled: AgentGameResponse = {
    ...initial,
    data: {
      activity: null,
      last_result: {
        kind: 'combat',
        activity_id: battle.data.activity!.activity_id,
        status: 'ENDED',
        end_reason: 'CANCELLED',
        ended_at: '2026-09-09T00:00:10.000Z',
        summary: null,
      },
    },
  };
  const invoke = vi
    .spyOn(GameClient.prototype, 'invoke')
    .mockResolvedValueOnce(battle)
    .mockResolvedValueOnce(cancelled);
  const pending = execute(
    [
      'fight',
      '-c',
      'Traveler0000',
      '--enemy',
      'wolf',
      '--practice',
      '--preset',
      'safe',
    ],
    vi.fn(),
  );
  await vi.advanceTimersByTimeAsync(9999);
  expect(invoke).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(await pending).toEqual(cancelled);
  expect(invoke.mock.calls).toEqual([
    [
      'character/combat/start',
      {
        character_id: 'Traveler0000',
        enemy_id: 'wolf',
        practice: true,
        preset: 'safe',
      },
    ],
    [
      'character/activity',
      {
        character_id: 'Traveler0000',
        activity_id: battle.data.activity!.activity_id,
      },
    ],
  ]);
});
