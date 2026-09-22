import { afterEach, expect, it, vi } from 'vitest';
import { GameClient } from './client.js';
import { execute } from './commands.js';
import { withRenderedHints } from './hints.js';
import { agentSchemaVersion, type AgentGameResponse } from './protocol.js';

afterEach(() => vi.restoreAllMocks());

// 更新確認は公開リポジトリへ取りに行くため、単体試験では必ず失敗させて無効化する。
vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')));

const response: AgentGameResponse = {
  ok: true,
  schema_version: agentSchemaVersion,
  server_time: '2026-09-12T00:00:00.000Z',
  data: {},
};

it('renders server hints with CLI command syntax and keeps notes as written', () => {
  expect(
    withRenderedHints({
      ...response,
      hints: [
        { operation: 'hello', arguments: { character_id: 'm7Qp2_aR9L-x' } },
        { operation: 'get_activity', arguments: { activity_id: 'a1b2c3d4' } },
        {
          operation: 'equip_item',
          arguments: { instance_id: '11111111-1111-4111-8111-111111111111' },
        },
        { note: 'Changing job puts your previous weapon in the bag.' },
      ],
    }).hints,
  ).toEqual([
    { note: 'Run `hello -c m7Qp2_aR9L-x`.' },
    { note: 'Run `activity -a a1b2c3d4`.' },
    {
      note: 'Run `equip --instance 11111111-1111-4111-8111-111111111111`.',
    },
    { note: 'Changing job puts your previous weapon in the bag.' },
  ]);
});

it('adds the invoked character to hints for character commands', () => {
  expect(
    withRenderedHints(
      {
        ...response,
        hints: [
          { operation: 'get_activity', arguments: { activity_id: 'a1b2c3d4' } },
          {
            operation: 'equip_item',
            arguments: {
              instance_id: '11111111-1111-4111-8111-111111111111',
            },
          },
        ],
      },
      'HintHero0000',
    ).hints,
  ).toEqual([
    { note: 'Run `activity -a a1b2c3d4 -c HintHero0000`.' },
    {
      note: 'Run `equip --instance 11111111-1111-4111-8111-111111111111 -c HintHero0000`.',
    },
  ]);
});

it('names an operation it cannot render instead of guessing one', () => {
  expect(
    withRenderedHints({
      ...response,
      hints: [{ operation: 'some_future_operation' }],
    }).hints,
  ).toEqual([{ note: 'Use the some_future_operation operation.' }]);
});

it('renders hints from the result without another request', async () => {
  const serverResponse: AgentGameResponse = {
    ...response,
    hints: [
      {
        operation: 'equip_item',
        arguments: { instance_id: '11111111-1111-4111-8111-111111111111' },
      },
    ],
  };
  const invoke = vi
    .spyOn(GameClient.prototype, 'invoke')
    .mockResolvedValue(serverResponse);
  const result = await execute(
    [
      'buy',
      '--item',
      'basic_pickaxe',
      '--max-payment',
      '100',
      '-c',
      'HintHero0000',
      '-l',
      'ja',
    ],
    vi.fn(),
  );
  expect(result).toMatchObject({
    hints: [
      {
        note: 'Run `equip --instance 11111111-1111-4111-8111-111111111111 -c HintHero0000`.',
      },
    ],
  });
  expect(serverResponse.hints).toHaveLength(1);
  expect(invoke).toHaveBeenCalledTimes(1);
});

it('leaves failures and results without hints unchanged', async () => {
  const failure: AgentGameResponse = {
    ...response,
    ok: false,
    error: { message: 'Too many requests.' },
  };
  const invoke = vi
    .spyOn(GameClient.prototype, 'invoke')
    .mockResolvedValue(failure);
  expect(await execute(['hello', '-c', 'HintHero0000'], vi.fn())).toEqual(
    failure,
  );
  invoke.mockResolvedValue(response);
  expect(await execute(['map', '-c', 'HintHero0000'], vi.fn())).toEqual(
    response,
  );
});

const travelId = '00000000-0000-4000-8000-000000000001';
const ambushId = '00000000-0000-4000-8000-000000000002';

function runningTravel(): AgentGameResponse {
  return {
    ...response,
    next_poll_after_seconds: 5,
    data: {
      activity: {
        kind: 'travel',
        activity_id: travelId,
        from: { id: 'dolgan', name: 'Dolgan', kind: 'town' },
        to: { id: 'openpit', name: 'Open pit', kind: 'field' },
        started_at: '2026-09-12T00:00:00.000Z',
        arrives_at: '2026-09-12T00:00:15.000Z',
        duration_seconds: 15,
        status: 'RUNNING',
      },
    },
  };
}

function runningCombat(activityId: string) {
  return {
    kind: 'combat',
    activity_id: activityId,
    enemy_id: 'wolf',
    enemy_name: 'Wolf',
    practice: false,
    started_at: '2026-09-12T00:00:45.000Z',
    time_limit_at: '2026-09-12T00:08:00.000Z',
    next_update_at: '2026-09-12T00:00:50.000Z',
    duration_seconds: 480,
    status: 'RUNNING',
    hp: 80,
    max_hp: 120,
    mp: 100,
    enemy_hp: 40,
    enemy_max_hp: 160,
    retreat_ticks: 0,
    retreat_requested_tick: null,
  } as const;
}

function gatherResultWithAmbush() {
  return {
    kind: 'gather',
    activity_id: '00000000-0000-4000-8000-000000000003',
    status: 'ENDED',
    end_reason: 'COMPLETED',
    ended_at: '2026-09-12T00:00:45.000Z',
    output: { item_id: 'herb', name: 'Wolf Mint', quantity: 1 },
    ambush: { activity_id: ambushId, enemy_id: 'wolf' },
  } as const;
}

it('describes a --no-wait acceptance as a receipt, not a completion', () => {
  expect(
    withRenderedHints(runningTravel(), 'HintHero0000', { wait: false }),
  ).toMatchObject({
    hints: [
      {
        note: `The travel activity ${travelId} was accepted and has not finished; track it with \`activity -a ${travelId} -c HintHero0000\`.`,
      },
    ],
  });
  // The default wait adds no receipt.
  expect(
    withRenderedHints(runningTravel(), 'HintHero0000').hints,
  ).toBeUndefined();
});

it('describes a --no-wait finished result as a past result', () => {
  expect(
    withRenderedHints(
      {
        ...response,
        data: {
          activity: null,
          last_result: {
            kind: 'rest',
            activity_id: travelId,
            status: 'ENDED',
            end_reason: 'COMPLETED',
            ended_at: '2026-09-12T00:00:45.000Z',
            summary: {
              hp: 100,
              mp: 100,
              weakened_until: null,
            },
          },
        },
      },
      'HintHero0000',
      { wait: false },
    ).hints,
  ).toEqual([
    {
      note: 'This is the stored result of an earlier accepted rest activity, not a new start.',
    },
  ]);
});

it('confirms an ambush result and keeps a running combat without a read suggestion', () => {
  expect(
    withRenderedHints(
      {
        ...response,
        hints: [
          { operation: 'get_activity', arguments: { activity_id: ambushId } },
        ],
        data: {
          activity: runningCombat(ambushId),
          last_result: gatherResultWithAmbush(),
        },
      },
      'HintHero0000',
    ).hints,
  ).toEqual([
    {
      note: `The gather result is confirmed and combat ${ambushId} is the current activity; continue or stop that battle instead of repeating the finished activity.`,
    },
  ]);
});

it('describes a past ambush and only then suggests reading its combat', () => {
  expect(
    withRenderedHints(
      {
        ...response,
        hints: [
          { operation: 'get_activity', arguments: { activity_id: ambushId } },
        ],
        data: { activity: null, last_result: gatherResultWithAmbush() },
      },
      'HintHero0000',
    ).hints,
  ).toEqual([
    {
      note: `An ambush happened after the confirmed gather result, which stands; that combat is not the current activity. Read its outcome with \`activity -a ${ambushId} -c HintHero0000\` if you have not seen it.`,
    },
  ]);
});

it('keeps a partial repetition and its payload while noting the confirmed count', () => {
  const partial = {
    ...response,
    ok: false,
    error: {
      message: 'The repetition ended before all requested attempts completed.',
    },
    data: {
      activity: runningCombat(ambushId),
      last_result: gatherResultWithAmbush(),
    },
    repetition: {
      requested_count: 10,
      completed_count: 3,
      produced: { herb: 3 },
      stopped_reason: 'ambush',
    },
  } as unknown as AgentGameResponse;
  const rendered = withRenderedHints(partial, 'HintHero0000');
  expect(rendered).toMatchObject({
    ok: false,
    error: partial.error,
    repetition: {
      requested_count: 10,
      completed_count: 3,
      produced: { herb: 3 },
      stopped_reason: 'ambush',
    },
    data: partial.data,
  });
  expect(rendered.hints).toEqual([
    {
      note: `The gather result is confirmed and combat ${ambushId} is the current activity; continue or stop that battle instead of repeating the finished activity.`,
    },
    {
      note: '3 of 10 attempts are confirmed and their output is kept; the repetition stopped before the rest.',
    },
  ]);
});
