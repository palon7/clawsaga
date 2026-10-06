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

it('returns one acceptance for --no-wait travel and rest without polling or a wait input', async () => {
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
  await execute(['rest', '-c', 'Traveler0000', '--inn', '--no-wait'], notify);
  expect(invoke).toHaveBeenLastCalledWith('character/rest', {
    character_id: 'Traveler0000',
    inn: true,
  });
  // 開始1回ずつ。活動照会もstderr診断も出さない。
  expect(invoke).toHaveBeenCalledTimes(2);
  expect(notify).not.toHaveBeenCalled();
});

const [schemaMajor = 0, schemaMinor = 0] = agentSchemaVersion
  .split('.')
  .map(Number);
const lostStartResponses: [
  string,
  string,
  () => Response,
  Record<string, unknown>,
][] = [
  [
    'unreadable',
    'INVALID_RESPONSE',
    () => new Response('private upstream details', { status: 200 }),
    {},
  ],
  [
    'a 503',
    'SERVICE_UNAVAILABLE',
    () => new Response(null, { status: 503 }),
    {},
  ],
  [
    'from a newer server schema',
    'UPDATE_REQUIRED',
    () =>
      Response.json({
        ok: true,
        schema_version: `${schemaMajor}.${schemaMinor + 1}`,
        server_time: '2026-09-19T00:00:00.000Z',
        data: {},
      }),
    { operation: 'character/travel', http_status: 200 },
  ],
];

it.each(lostStartResponses)(
  'recovers a main activity whose start response is %s',
  async (_label, code, respond, detail) => {
    vi.spyOn(GameClient.prototype, 'accessToken').mockResolvedValue(
      'test-token',
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(respond())),
    );
    const travel = await execute(
      ['travel', '-c', 'Traveler0000', '--to', 'openpit'],
      vi.fn(),
    ).catch((thrown: unknown) => thrown);
    if (!(travel instanceof CliError)) throw new Error('Expected a CliError');
    // 応答が読めなくてもサーバーは受付済みかもしれないため、結果不明として扱う。
    // 更新した後に開始し直すのではなく、受付済みかもしれない活動を先に照合する。
    expect(travel.code).toBe(code);
    expect(travel.detail).toMatchObject({ ...detail, outcome: 'unknown' });
    const hint = String(travel.detail.hint);
    expect(hint).toContain('may already have succeeded');
    expect(hint).toContain('activity -c Traveler0000');
    expect(hint).toContain('Compare its kind and time');
    expect(hint).toContain(
      'If you cannot tell whether it is the same activity',
    );
    // The activity ID is unknown, so the hint must not pin one with -a.
    expect(hint).not.toMatch(/-a /);

    // A read keeps its own diagnostics; only a main activity gets the step.
    const map = await execute(['map', '-c', 'Traveler0000'], vi.fn()).catch(
      (thrown: unknown) => thrown,
    );
    if (!(map instanceof CliError)) throw new Error('Expected a CliError');
    expect(map.code).toBe(code);
    expect(map.detail).not.toHaveProperty('outcome');
    expect(map.detail).not.toHaveProperty('hint');
  },
);

const travelArgs = ['travel', '-c', 'Traveler0000', '--to', 'openpit'];
const useArgs = ['use', '-c', 'Traveler0000', '--item', 'healing_potion'];

it.each([
  ['a main activity', travelArgs],
  ['an item use', useArgs],
])('does not offer recovery when %s was never sent', async (_label, args) => {
  const request = vi.fn();
  vi.stubGlobal('fetch', request);
  vi.spyOn(GameClient.prototype, 'accessToken').mockRejectedValue(
    new CliError('INVALID_RESPONSE'),
  );
  const error = await execute(args, vi.fn()).catch((thrown: unknown) => thrown);
  if (!(error instanceof CliError)) throw new Error('Expected a CliError');
  expect(error.code).toBe('INVALID_RESPONSE');
  // 送信前の失敗はゲームを変えていないため、結果不明の復旧手順を付けない。
  expect(error.detail.outcome).toBe('not_sent');
  expect(error.detail).not.toHaveProperty('hint');
  expect(request).not.toHaveBeenCalled();
});

const connectionFailure = () => Promise.reject(new TypeError('fetch failed'));
const lostItemChanges: [string[], string, string, () => Promise<Response>][] = [
  [useArgs, 'NETWORK_ERROR', 'a connection failure', connectionFailure],
  [
    useArgs,
    'SERVICE_UNAVAILABLE',
    'a 5xx',
    () => Promise.resolve(new Response(null, { status: 502 })),
  ],
  [
    useArgs,
    'INVALID_RESPONSE',
    'invalid JSON',
    () => Promise.resolve(new Response('upstream', { status: 200 })),
  ],
  [
    ['discard', '-c', 'Traveler0000', '--item', 'wolf_meat', '--quantity', '2'],
    'NETWORK_ERROR',
    'a connection failure',
    connectionFailure,
  ],
];

it.each(
  lostItemChanges.map(
    ([args, code, label, respond]) =>
      [args[0], label, args, code, respond] as const,
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
    expect(hint).toContain('do not repeat the command');
    expect(hint).toContain('character -c Traveler0000 --include inventory');
    expect(hint).toContain('Even if nothing has changed');
    expect(hint).not.toContain('--request');
  },
);

it('reports wait contract and authorization failures without resubmitting accepted activities', async () => {
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

  invoke.mockClear().mockRejectedValue(new CliError('AUTH_REQUIRED'));
  const unauthorized = expect(
    waitForActivity(client, { character: 'Traveler0000' }, initial),
  ).rejects.toMatchObject({
    code: 'AUTH_REQUIRED',
    detail: { activity_id: initial.data.activity!.activity_id },
  });
  await vi.advanceTimersByTimeAsync(5000);
  await unauthorized;
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
